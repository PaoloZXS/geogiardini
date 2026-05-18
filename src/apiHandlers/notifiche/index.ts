async function createDbClient() {
  const databaseUrl = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!databaseUrl || !authToken) {
    throw new Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set in environment variables');
  }

  const { createClient } = await import('@libsql/client');
  return createClient({ url: databaseUrl, authToken });
}

function normalizeColumnName(raw: unknown) {
  return (raw ?? '').toString().trim().toLowerCase();
}

function extractTableColumns(rows: any[] | undefined) {
  if (!Array.isArray(rows)) return [] as string[];

  const found = new Set<string>();
  for (const row of rows) {
    const nameFromObject = row?.name ?? row?.column_name ?? row?.column;
    if (nameFromObject != null) {
      found.add(normalizeColumnName(nameFromObject));
      continue;
    }
    if (Array.isArray(row) && row.length > 1) {
      found.add(normalizeColumnName(row[1]));
      continue;
    }
    const values = Object.values(row ?? {});
    if (values.length > 1) {
      found.add(normalizeColumnName(values[1]));
    }
  }

  return Array.from(found).filter(Boolean);
}

async function safeAddColumn(db: any, sql: string) {
  try {
    await db.execute(sql, []);
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('duplicate column name') || message.includes('already exists')) {
      return;
    }
    throw error;
  }
}

async function ensureGiardinieriTable(db: any) {
  await db.execute(
    'CREATE TABLE IF NOT EXISTS giardinieri (id TEXT PRIMARY KEY, username TEXT NOT NULL, codice TEXT NOT NULL, created_at TEXT NOT NULL, attivo INTEGER NOT NULL DEFAULT 0)',
    []
  );

  const columnsResult = await db.execute("PRAGMA table_info('giardinieri')", []);
  const columns = extractTableColumns(columnsResult.rows);

  if (!columns.includes('attivo')) {
    await safeAddColumn(db, 'ALTER TABLE giardinieri ADD COLUMN attivo INTEGER NOT NULL DEFAULT 0');
  }
}

async function ensureNotificheTable(db: any) {
  await db.execute(
    'CREATE TABLE IF NOT EXISTS notifiche (id TEXT PRIMARY KEY, giardiniere_id TEXT NOT NULL, appuntamento_id TEXT NOT NULL, cliente_id TEXT, title TEXT NOT NULL, message TEXT NOT NULL, read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)',
    []
  );

  const columnsResult = await db.execute("PRAGMA table_info('notifiche')", []);
  const columns = extractTableColumns(columnsResult.rows);

  if (!columns.includes('cliente_id')) {
    await safeAddColumn(db, 'ALTER TABLE notifiche ADD COLUMN cliente_id TEXT');
  }
}

function isNoSuchTableError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes('no such table');
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, message: 'Method not allowed.' }));
    return;
  }

  try {
    const db = await createDbClient();

    if (req.method === 'GET') {
      const giardiniereId = req.query?.giardiniereId?.toString()?.trim();
      const readFilter = req.query?.read?.toString()?.trim();

      const whereClauses: string[] = [];
      const params: any[] = [];

      if (giardiniereId) {
        whereClauses.push('n.giardiniere_id = ?');
        params.push(giardiniereId);
      }

      if (readFilter === '0' || readFilter === 'false') {
        whereClauses.push('n.read = 0');
      } else if (readFilter === '1' || readFilter === 'true') {
        whereClauses.push('n.read = 1');
      }

      const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

      try {
        const result = await db.execute(
          `SELECT n.id, n.giardiniere_id, gi.username AS giardiniere_username, n.appuntamento_id, n.cliente_id, c.nome AS cliente_nome, n.title, n.message, n.read, n.created_at FROM notifiche n LEFT JOIN giardinieri gi ON gi.id = n.giardiniere_id LEFT JOIN clienti c ON c.id = n.cliente_id ${whereSql} ORDER BY n.created_at DESC`,
          params
        );
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, notifiche: Array.isArray(result.rows) ? result.rows : [] }));
        return;
      } catch (error) {
        if (isNoSuchTableError(error)) {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true, notifiche: [] }));
          return;
        }
        throw error;
      }
    }

    const { title, message, giardinieriIds, clienteId } = req.body ?? {};
    const trimmedTitle = title?.toString().trim() || "Messaggio dall' Amministratore";
    const trimmedMessage = message?.toString().trim();
    const trimmedClienteId = clienteId?.toString().trim();
    const selectedGiardinieri = Array.isArray(giardinieriIds)
      ? giardinieriIds.map((item: any) => item?.toString().trim()).filter((item: string) => item)
      : [];

    if (!trimmedMessage) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, message: 'Messaggio e obbligatorio.' }));
      return;
    }

    await ensureGiardinieriTable(db);
    await ensureNotificheTable(db);

    let recipients = selectedGiardinieri;
    if (recipients.length === 0) {
      const giardinieriResult = await db.execute(
        "SELECT id FROM giardinieri WHERE LOWER(TRIM(CAST(attivo AS TEXT))) IN ('1', 'true', 'yes')",
        []
      );
      const rows = Array.isArray(giardinieriResult.rows) ? giardinieriResult.rows : [];
      recipients = rows.map((row: any) => row?.id?.toString?.()).filter((id: string) => id);
    }

    if (recipients.length === 0) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, message: 'Nessun giardiniere selezionato o attivo.' }));
      return;
    }

    const createdAt = new Date().toISOString();
    for (const giardiniereId of recipients) {
      await db.execute(
        'INSERT INTO notifiche (id, giardiniere_id, appuntamento_id, cliente_id, title, message, read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [crypto.randomUUID(), giardiniereId, '', trimmedClienteId || null, trimmedTitle, trimmedMessage, 0, createdAt]
      );
    }

    let pushStats = {
      targetedRecipients: recipients.length,
      subscriptionCount: 0,
      acceptedCount: 0,
      failedCount: 0,
      removedCount: 0
    };

    try {
      const { sendPushToGiardinieri } = await import('../../lib/push');
      pushStats = await sendPushToGiardinieri(db, recipients, {
        title: trimmedTitle,
        body: trimmedMessage,
        data: {
          url: '/',
          type: 'notifica',
          clienteId: trimmedClienteId || null,
          createdAt
        }
      });
    } catch (pushError) {
      // Keep notification persistence successful even if push delivery fails.
      console.error('Push send in notifiche API failed', pushError);
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, recipientsCount: recipients.length, pushStats }));
  } catch (error: any) {
    console.error('Notifiche API error', error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, message: 'Errore interno del server.' }));
  }
}
