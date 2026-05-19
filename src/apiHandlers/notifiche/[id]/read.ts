import { createDbClient } from "../../db.js";
import { sendPushToAdmins } from "../../../../lib/push.js";

async function ensureNotificheTable(db: any) {
  await db.execute(
    "CREATE TABLE IF NOT EXISTS notifiche (id TEXT PRIMARY KEY, giardiniere_id TEXT NOT NULL, appuntamento_id TEXT NOT NULL, cliente_id TEXT, title TEXT NOT NULL, message TEXT NOT NULL, read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)",
    []
  );
}

export default async function handler(req: any, res: any) {
  if (req.method !== "PUT" && req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ success: false, message: "Method not allowed." }));
    return;
  }

  try {
    const id = req.query?.id?.toString()?.trim();
    if (!id) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({ success: false, message: "Id notifica mancante." })
      );
      return;
    }

    const db = await createDbClient();
    await ensureNotificheTable(db);

    const existingResult = await db.execute(
      'SELECT n."read" AS is_read FROM notifiche n WHERE n.id = ? LIMIT 1',
      [id]
    );
    const existingRow = Array.isArray(existingResult.rows)
      ? existingResult.rows[0]
      : null;
    const wasAlreadyRead = Number(existingRow?.is_read ?? 0) === 1;

    if (!wasAlreadyRead) {
      await db.execute('UPDATE notifiche SET "read" = 1 WHERE id = ?', [id]);
    }

    if (!wasAlreadyRead) {
      try {
        await sendPushToAdmins(db, {
          title: "Notifica letta",
          body: "Un giardiniere ha letto una notifica.",
          data: {
            url: "/admin",
            type: "read-confirmation",
            notificationId: id,
            badgeCount: 1
          }
        });
      } catch (pushError) {
        console.error(
          "Admin push send in notifiche read API failed",
          pushError
        );
      }
    }

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ success: true }));
  } catch (error: any) {
    console.error("Notifiche read API error", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({ success: false, message: "Errore interno del server." })
    );
  }
}
