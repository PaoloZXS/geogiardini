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
    await ensureGiardinieriTable(db);
    const id =
      req.query?.id?.toString?.().trim() || req.params?.id?.toString?.().trim();

    if (req.method === "DELETE") {
      if (!id) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            success: false,
            message: "Id giardiniere mancante."
          })
        );
        return;
      }
      await db.execute("DELETE FROM giardinieri WHERE id = ?", [id]);
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
          JSON.stringify({
            success: false,
            message: "Id giardiniere mancante."
          })
        );
        return;
      }

      const { username, codice, attivo } = req.body ?? {};
      const trimmedUsername = username?.toString().trim();
      const trimmedCodice = codice?.toString().trim();
      const isActive = attivo ? 1 : 0;

      if (!trimmedUsername || !trimmedCodice) {
        res.statusCode = 400;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            success: false,
            message: "Username e codice sono obbligatori."
          })
        );
        return;
      }

      const existing = await db.execute(
        "SELECT id FROM giardinieri WHERE LOWER(username) = LOWER(?) AND id != ? LIMIT 1",
        [trimmedUsername, id]
      );

      if (existing.rows.length > 0) {
        res.statusCode = 409;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            success: false,
            message: "Username già presente. Usa un altro username."
          })
        );
        return;
      }

      await db.execute(
        "UPDATE giardinieri SET username = ?, codice = ?, attivo = ? WHERE id = ?",
        [trimmedUsername, trimmedCodice, isActive, id]
      );

      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ success: true }));
      return;
    }

    if (req.method === "GET") {
      const result = await db.execute(
        "SELECT id, username, codice, created_at, attivo FROM giardinieri ORDER BY created_at DESC",
        []
      );
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({ success: true, giardinieri: result.rows || [] })
      );
      return;
    }

    const { username, codice, attivo } = req.body ?? {};
    const trimmedUsername = username?.toString().trim();
    const trimmedCodice = codice?.toString().trim();
    const isActive = attivo ? 1 : 0;

    if (!trimmedUsername || !trimmedCodice) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          success: false,
          message: "Username e codice sono obbligatori."
        })
      );
      return;
    }

    const existing = await db.execute(
      "SELECT id FROM giardinieri WHERE LOWER(username) = LOWER(?) LIMIT 1",
      [trimmedUsername]
    );
    if (existing.rows.length > 0) {
      res.statusCode = 409;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          success: false,
          message: "Username già presente. Usa un altro username."
        })
      );
      return;
    }

    await db.execute(
      "INSERT INTO giardinieri (id, username, codice, created_at, attivo) VALUES (?, ?, ?, ?, ?)",
      [
        crypto.randomUUID(),
        trimmedUsername,
        trimmedCodice,
        new Date().toISOString(),
        isActive
      ]
    );
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ success: true }));
  } catch (error: any) {
    console.error("Giardinieri API error", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({ success: false, message: "Errore interno del server." })
    );
  }
}
