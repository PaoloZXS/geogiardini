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

async function ensureAttivitaTable(db: any) {
  await db.execute(
    'CREATE TABLE IF NOT EXISTS attivita (id TEXT PRIMARY KEY, description TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)',
    []
  );

  const columnsResult = await db.execute("PRAGMA table_info('attivita')", []);
  const columns = extractTableColumns(columnsResult.rows);

  if (!columns.includes('description')) {
    await safeAddColumn(db, 'ALTER TABLE attivita ADD COLUMN description TEXT NOT NULL DEFAULT ""');
  }

  if (!columns.includes('completed')) {
    await safeAddColumn(db, 'ALTER TABLE attivita ADD COLUMN completed INTEGER NOT NULL DEFAULT 0');
  }
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
      const result = await db.execute('SELECT id, description, completed, created_at FROM attivita ORDER BY LOWER(description) ASC', []);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, attivita: result.rows || [] }));
      return;
    }

    const { description } = req.body ?? {};
    const trimmedDescription = description?.toString().trim();
    if (!trimmedDescription) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, message: 'La descrizione dell\'attività è obbligatoria.' }));
      return;
    }

    await ensureAttivitaTable(db);
    await db.execute('INSERT INTO attivita (id, description, completed, created_at) VALUES (?, ?, ?, ?)', [crypto.randomUUID(), trimmedDescription, 0, new Date().toISOString()]);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true }));
  } catch (error: any) {
    console.error('Attivita API error', error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, message: 'Errore interno del server.' }));
  }
}
