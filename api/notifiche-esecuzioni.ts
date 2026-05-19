import { createDbClient } from "../src/apiHandlers/db.js";

async function ensureNotificheEsecuzioniTable(db: any) {
  await db.execute(
    "CREATE TABLE IF NOT EXISTS notifiche_esecuzioni (id TEXT PRIMARY KEY, notifica_id TEXT NOT NULL UNIQUE, giardiniere_id TEXT NOT NULL, execution_date TEXT, notes TEXT NOT NULL DEFAULT '', photo_paths TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
    []
  );
}

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ success: false, message: "Method not allowed." }));
    return;
  }

  try {
    const db = await createDbClient();
    await ensureNotificheEsecuzioniTable(db);

    const giardiniereId = req.query?.giardiniereId?.toString?.().trim?.();
    const whereClauses: string[] = [];
    const params: any[] = [];

    if (giardiniereId) {
      whereClauses.push("e.giardiniere_id = ?");
      params.push(giardiniereId);
    }

    const whereSql = whereClauses.length
      ? `WHERE ${whereClauses.join(" AND ")}`
      : "";

    const result = await db.execute(
      `SELECT e.id, e.notifica_id, e.giardiniere_id, e.execution_date, e.notes, e.photo_paths, e.created_at, e.updated_at, n.title, n.message, n.read, n.created_at AS notification_created_at FROM notifiche_esecuzioni e LEFT JOIN notifiche n ON n.id = e.notifica_id ${whereSql} ORDER BY e.created_at DESC`,
      params
    );

    const rows = Array.isArray(result.rows) ? result.rows : [];
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ success: true, executions: rows }));
  } catch (error) {
    console.error("Fetching esecuzioni failed", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        success: false,
        executions: [],
        message: "Errore caricamento storico esecuzioni."
      })
    );
  }
}
