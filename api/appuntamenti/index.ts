async function createDbClient() {
  const databaseUrl = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!databaseUrl || !authToken) {
    throw new Error(
      "TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set in environment variables"
    );
  }

  const { createClient } = await import("@libsql/client");
  return createClient({ url: databaseUrl, authToken });
}

function normalizeColumnName(raw: unknown) {
  return (raw ?? "").toString().trim().toLowerCase();
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
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (
      message.includes("duplicate column name") ||
      message.includes("already exists")
    ) {
      return;
    }
    throw error;
  }
}

async function ensureGiardinieriTable(db: any) {
  await db.execute(
    "CREATE TABLE IF NOT EXISTS giardinieri (id TEXT PRIMARY KEY, username TEXT NOT NULL, codice TEXT NOT NULL, created_at TEXT NOT NULL, attivo INTEGER NOT NULL DEFAULT 0)",
    []
  );

  const columnsResult = await db.execute(
    "PRAGMA table_info('giardinieri')",
    []
  );
  const columns = extractTableColumns(columnsResult.rows);
  if (!columns.includes("attivo")) {
    await safeAddColumn(
      db,
      "ALTER TABLE giardinieri ADD COLUMN attivo INTEGER NOT NULL DEFAULT 0"
    );
  }
}

async function ensureClientiTable(db: any) {
  await db.execute(
    'CREATE TABLE IF NOT EXISTS clienti (id INTEGER PRIMARY KEY, nome TEXT, indirizzo TEXT, telefono TEXT, codice TEXT NOT NULL DEFAULT "", attivo INTEGER NOT NULL DEFAULT 1)',
    []
  );

  const columnsResult = await db.execute("PRAGMA table_info('clienti')", []);
  const columns = extractTableColumns(columnsResult.rows);
  if (!columns.includes("codice")) {
    await safeAddColumn(
      db,
      'ALTER TABLE clienti ADD COLUMN codice TEXT NOT NULL DEFAULT ""'
    );
  }
  if (!columns.includes("attivo")) {
    await safeAddColumn(
      db,
      "ALTER TABLE clienti ADD COLUMN attivo INTEGER NOT NULL DEFAULT 1"
    );
  }
}

async function ensureAppuntamentiTable(db: any) {
  await db.execute(
    'CREATE TABLE IF NOT EXISTS appuntamenti (id TEXT PRIMARY KEY, data TEXT NOT NULL, cliente_id INTEGER NOT NULL, note TEXT NOT NULL DEFAULT "", created_at TEXT NOT NULL)',
    []
  );
}

async function ensureAppuntamentoGiardinieriTable(db: any) {
  await db.execute(
    "CREATE TABLE IF NOT EXISTS appuntamento_giardinieri (id TEXT PRIMARY KEY, appuntamento_id TEXT NOT NULL, giardiniere_id TEXT NOT NULL, UNIQUE(appuntamento_id, giardiniere_id))",
    []
  );
}

async function ensureAppuntamentoAttivitaTable(db: any) {
  await db.execute(
    "CREATE TABLE IF NOT EXISTS appuntamento_attivita (id TEXT PRIMARY KEY, appuntamento_id TEXT NOT NULL, description TEXT NOT NULL)",
    []
  );
}

async function ensureNotificheTable(db: any) {
  await db.execute(
    "CREATE TABLE IF NOT EXISTS notifiche (id TEXT PRIMARY KEY, giardiniere_id TEXT NOT NULL, appuntamento_id TEXT NOT NULL, cliente_id TEXT, title TEXT NOT NULL, message TEXT NOT NULL, read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)",
    []
  );

  const columnsResult = await db.execute("PRAGMA table_info('notifiche')", []);
  const columns = extractTableColumns(columnsResult.rows);
  if (!columns.includes("cliente_id")) {
    await safeAddColumn(db, "ALTER TABLE notifiche ADD COLUMN cliente_id TEXT");
  }
}

function isNoSuchTableError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message.toLowerCase()
      : String(error).toLowerCase();
  return message.includes("no such table");
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ success: false, message: "Method not allowed." }));
    return;
  }

  try {
    const db = await createDbClient();

    if (req.method === "GET") {
      const giardiniereId = req.query?.giardiniereId?.toString()?.trim();
      const clienteId = req.query?.clienteId?.toString()?.trim();

      const whereClauses: string[] = [];
      const params: any[] = [];

      if (giardiniereId) {
        whereClauses.push("ag.giardiniere_id = ?");
        params.push(giardiniereId);
      }
      if (clienteId) {
        whereClauses.push("a.cliente_id = ?");
        params.push(clienteId);
      }

      const whereSql = whereClauses.length
        ? `WHERE ${whereClauses.join(" AND ")}`
        : "";

      try {
        const result = await db.execute(
          `SELECT
            a.id AS appointment_id,
            a.data AS appointment_date,
            a.cliente_id AS cliente_id,
            c.nome AS cliente_nome,
            a.note AS appointment_note,
            a.created_at AS appointment_created_at,
            gi.id AS giardiniere_id,
            gi.username AS giardiniere_username,
            aa.description AS activity_description
          FROM appuntamenti a
          LEFT JOIN clienti c ON c.id = a.cliente_id
          LEFT JOIN appuntamento_giardinieri ag ON ag.appuntamento_id = a.id
          LEFT JOIN giardinieri gi ON gi.id = ag.giardiniere_id
          LEFT JOIN appuntamento_attivita aa ON aa.appuntamento_id = a.id
          ${whereSql}
          ORDER BY a.data DESC, a.created_at DESC`,
          params
        );

        const rows = Array.isArray(result.rows) ? result.rows : [];
        const appointmentsMap = new Map<string, any>();

        for (const row of rows) {
          const appointmentId = row?.appointment_id?.toString();
          if (!appointmentId) continue;

          if (!appointmentsMap.has(appointmentId)) {
            appointmentsMap.set(appointmentId, {
              id: appointmentId,
              data: row?.appointment_date ?? "",
              clienteId: row?.cliente_id ?? "",
              clienteNome: row?.cliente_nome ?? "",
              note: row?.appointment_note ?? "",
              createdAt: row?.appointment_created_at ?? "",
              giardinieri: [],
              attivita: []
            });
          }

          const appointment = appointmentsMap.get(appointmentId);

          const giardiniereIdValue = row?.giardiniere_id?.toString();
          const giardiniereUsernameValue =
            row?.giardiniere_username?.toString();
          if (giardiniereIdValue && giardiniereUsernameValue) {
            if (
              !appointment.giardinieri.some(
                (item: any) => item.id === giardiniereIdValue
              )
            ) {
              appointment.giardinieri.push({
                id: giardiniereIdValue,
                username: giardiniereUsernameValue
              });
            }
          }

          const activityDescription = row?.activity_description?.toString();
          if (
            activityDescription &&
            !appointment.attivita.includes(activityDescription)
          ) {
            appointment.attivita.push(activityDescription);
          }
        }

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            success: true,
            appointments: Array.from(appointmentsMap.values())
          })
        );
        return;
      } catch (error) {
        if (isNoSuchTableError(error)) {
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ success: true, appointments: [] }));
          return;
        }
        throw error;
      }
    }

    const { data, clienteId, giardinieriIds, attivita, note } = req.body ?? {};
    const trimmedData = data?.toString().trim();
    const trimmedClienteId = clienteId?.toString().trim();
    const selectedGiardinieri = Array.isArray(giardinieriIds)
      ? giardinieriIds
          .map((item: any) => item?.toString().trim())
          .filter((item: string) => item)
      : [];
    const selectedAttivita = Array.isArray(attivita)
      ? attivita
          .map((item: any) => item?.toString().trim())
          .filter((item: string) => item)
      : [];
    const noteText = note?.toString().trim() ?? "";

    if (!trimmedData || !trimmedClienteId || selectedGiardinieri.length === 0) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          success: false,
          message: "Data, cliente e almeno un giardiniere sono obbligatori."
        })
      );
      return;
    }

    await ensureClientiTable(db);
    await ensureGiardinieriTable(db);
    await ensureAppuntamentiTable(db);
    await ensureAppuntamentoGiardinieriTable(db);
    await ensureAppuntamentoAttivitaTable(db);
    await ensureNotificheTable(db);

    const clientResult = await db.execute(
      "SELECT nome FROM clienti WHERE id = ? LIMIT 1",
      [trimmedClienteId]
    );
    const clientRows = Array.isArray(clientResult.rows)
      ? clientResult.rows
      : [];
    const clienteNome = clientRows[0]?.nome?.toString?.() ?? "cliente";

    const appointmentId = crypto.randomUUID();
    await db.execute(
      "INSERT INTO appuntamenti (id, data, cliente_id, note, created_at) VALUES (?, ?, ?, ?, ?)",
      [
        appointmentId,
        trimmedData,
        trimmedClienteId,
        noteText,
        new Date().toISOString()
      ]
    );

    for (const giardiniereId of selectedGiardinieri) {
      await db.execute(
        "INSERT INTO appuntamento_giardinieri (id, appuntamento_id, giardiniere_id) VALUES (?, ?, ?)",
        [crypto.randomUUID(), appointmentId, giardiniereId]
      );
    }

    for (const activity of selectedAttivita) {
      await db.execute(
        "INSERT INTO appuntamento_attivita (id, appuntamento_id, description) VALUES (?, ?, ?)",
        [crypto.randomUUID(), appointmentId, activity]
      );
    }

    const formattedDate = new Date(trimmedData).toLocaleDateString("it-IT");
    const notificationTitle = `Nuovo appuntamento per ${clienteNome}`;
    const notificationMessage = `Cliente : ${clienteNome}\nAttivita da svolgere : ${selectedAttivita.join(", ")}\nData Appuntamento : ${formattedDate}`;

    for (const giardiniereId of selectedGiardinieri) {
      await db.execute(
        "INSERT INTO notifiche (id, giardiniere_id, cliente_id, appuntamento_id, title, message, read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [
          crypto.randomUUID(),
          giardiniereId,
          trimmedClienteId,
          appointmentId,
          notificationTitle,
          notificationMessage,
          0,
          new Date().toISOString()
        ]
      );
    }

    let pushStats = {
      targetedRecipients: selectedGiardinieri.length,
      subscriptionCount: 0,
      acceptedCount: 0,
      failedCount: 0,
      removedCount: 0
    };

    try {
      const { sendPushToGiardinieri } = await import("../../lib/push");
      pushStats = await sendPushToGiardinieri(db, selectedGiardinieri, {
        title: notificationTitle,
        body: notificationMessage,
        data: {
          url: "/giardiniere",
          type: "appuntamento",
          clienteId: trimmedClienteId,
          appointmentId,
          createdAt: new Date().toISOString()
        }
      });
    } catch (pushError) {
      console.error("Push send in appuntamenti API failed", pushError);
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        success: true,
        recipientsCount: selectedGiardinieri.length,
        pushStats
      })
    );
  } catch (error: any) {
    const errorMessage =
      error && typeof error === "object" && "message" in error
        ? String(error.message)
        : String(error || "Errore interno del server.");
    console.error("Appuntamenti API error", {
      error,
      body: req.body,
      errorMessage
    });
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        success: false,
        message: `Errore interno del server: ${errorMessage}. Richiesta: ${JSON.stringify(
          {
            data: req.body?.data,
            clienteId: req.body?.clienteId,
            giardinieriIds: req.body?.giardinieriIds,
            attivita: req.body?.attivita
          }
        )}`
      })
    );
  }
}
