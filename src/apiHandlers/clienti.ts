import { createDbClient } from "./db.js";

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

export default async function handler(req: any, res: any) {
  if (
    req.method !== "GET" &&
    req.method !== "POST" &&
    req.method !== "PUT" &&
    req.method !== "DELETE"
  ) {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ success: false, message: "Method not allowed." }));
    return;
  }

  try {
    const db = await createDbClient();
    await ensureClientiTable(db);
    const id =
      req.query?.id?.toString?.().trim() || req.params?.id?.toString?.().trim();

    if (req.method === "DELETE") {
      if (!id) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({ success: false, message: "Id cliente mancante." })
        );
        return;
      }
      await db.execute("DELETE FROM clienti WHERE id = ?", [id]);
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ success: true }));
      return;
    }

    if (req.method === "PUT") {
      if (!id) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({ success: false, message: "Id cliente mancante." })
        );
        return;
      }

      const { nome, indirizzo, telefono, codice, attivo } = req.body ?? {};
      const trimmedNome = nome?.toString().trim();
      const trimmedIndirizzo = indirizzo?.toString().trim();
      const trimmedTelefono = telefono?.toString().trim() ?? "";
      const trimmedCodice = codice?.toString().trim();
      const isActive = attivo ? 1 : 0;

      if (!trimmedNome || !trimmedIndirizzo || !trimmedCodice) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            success: false,
            message: "Nome, indirizzo e codice sono obbligatori."
          })
        );
        return;
      }

      const existing = await db.execute(
        "SELECT id FROM clienti WHERE LOWER(nome) = LOWER(?) AND id != ? LIMIT 1",
        [trimmedNome, id]
      );

      if (existing.rows.length > 0) {
        res.statusCode = 409;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            success: false,
            message: "Cliente già presente. Usa un altro nome."
          })
        );
        return;
      }

      await db.execute(
        "UPDATE clienti SET nome = ?, indirizzo = ?, telefono = ?, codice = ?, attivo = ? WHERE id = ?",
        [
          trimmedNome,
          trimmedIndirizzo,
          trimmedTelefono,
          trimmedCodice,
          isActive,
          id
        ]
      );

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ success: true }));
      return;
    }

    if (req.method === "GET") {
      const result = await db.execute(
        "SELECT id, nome, indirizzo, telefono, codice, attivo FROM clienti ORDER BY id DESC",
        []
      );
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ success: true, clienti: result.rows || [] }));
      return;
    }

    const { nome, indirizzo, telefono, codice, attivo } = req.body ?? {};
    const trimmedNome = nome?.toString().trim();
    const trimmedIndirizzo = indirizzo?.toString().trim();
    const trimmedTelefono = telefono?.toString().trim() ?? "";
    const trimmedCodice = codice?.toString().trim();
    const isActive = attivo ? 1 : 0;

    if (!trimmedNome || !trimmedIndirizzo || !trimmedCodice) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          success: false,
          message: "Nome, indirizzo e codice sono obbligatori."
        })
      );
      return;
    }

    const existingClient = await db.execute(
      "SELECT id FROM clienti WHERE LOWER(nome) = LOWER(?) LIMIT 1",
      [trimmedNome]
    );
    if (existingClient.rows.length > 0) {
      res.statusCode = 409;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          success: false,
          message: "Cliente già presente. Usa un altro nome."
        })
      );
      return;
    }

    await db.execute(
      "INSERT INTO clienti (nome, indirizzo, telefono, codice, attivo) VALUES (?, ?, ?, ?, ?)",
      [trimmedNome, trimmedIndirizzo, trimmedTelefono, trimmedCodice, isActive]
    );
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ success: true }));
  } catch (error: any) {
    console.error("Clienti API error", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({ success: false, message: "Errore interno del server." })
    );
  }
}
