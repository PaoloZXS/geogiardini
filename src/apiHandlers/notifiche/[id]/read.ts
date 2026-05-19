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

    const updateResult = await db.execute(
      'UPDATE notifiche SET "read" = 1 WHERE id = ? AND COALESCE("read", 0) = 0',
      [id]
    );
    const updatedRows = Number((updateResult as any)?.rowsAffected ?? 0);

    let adminPushStats = {
      targetedRecipients: 1,
      subscriptionCount: 0,
      acceptedCount: 0,
      failedCount: 0,
      removedCount: 0
    };

    if (updatedRows > 0) {
      try {
        const readInfoResult = await db.execute(
          "SELECT gi.username AS giardiniere_username FROM notifiche n LEFT JOIN giardinieri gi ON gi.id = n.giardiniere_id WHERE n.id = ? LIMIT 1",
          [id]
        );
        const readInfoRow = Array.isArray(readInfoResult.rows)
          ? readInfoResult.rows[0]
          : null;
        const giardiniereUsername =
          readInfoRow?.giardiniere_username?.toString?.()?.trim?.() || "";
        const readMessage = giardiniereUsername
          ? `${giardiniereUsername} ha letto l'avviso.`
          : "Un giardiniere ha letto l'avviso.";

        adminPushStats = await sendPushToAdmins(db, {
          title: "GeoGiardini Admin",
          body: readMessage,
          data: {
            url: "/#/admin",
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
    res.end(
      JSON.stringify({
        success: true,
        updatedRows,
        adminPushStats
      })
    );
  } catch (error: any) {
    console.error("Notifiche read API error", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({ success: false, message: "Errore interno del server." })
    );
  }
}
