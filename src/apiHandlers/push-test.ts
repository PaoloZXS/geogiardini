import { createDbClient } from "./db.js";

async function ensurePushSubscriptionsTable(db: any) {
  await db.execute(
    "CREATE TABLE IF NOT EXISTS push_subscriptions (id TEXT PRIMARY KEY, giardiniere_id TEXT NOT NULL, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
    []
  );
}

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ success: false, message: "Method not allowed." }));
    return;
  }

  try {
    const parsedBody =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : (req.body ?? {});

    const giardiniereId = parsedBody?.giardiniereId?.toString()?.trim();
    const title = parsedBody?.title?.toString()?.trim() || "Notifica di prova";
    const message = parsedBody?.message?.toString()?.trim() || "Prova push.";

    if (!giardiniereId) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({ success: false, message: "GiardiniereId mancante." })
      );
      return;
    }

    const db = await createDbClient();
    await ensurePushSubscriptionsTable(db);

    const subscriptionsResult = await db.execute(
      "SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE giardiniere_id = ?",
      [giardiniereId]
    );
    const rows = Array.isArray(subscriptionsResult.rows)
      ? subscriptionsResult.rows
      : [];

    if (rows.length === 0) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          success: false,
          message: "Nessuna sottoscrizione push trovata per questo giardiniere."
        })
      );
      return;
    }

    const { sendPushToGiardinieri } = await import("../../lib/push.js");
    const pushStats = await sendPushToGiardinieri(db, [giardiniereId], {
      title,
      body: message,
      data: {
        url: "/#/giardiniere",
        type: "push-test",
        createdAt: new Date().toISOString()
      }
    });

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ success: true, pushStats }));
  } catch (error: any) {
    console.error("Push test API error", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        success: false,
        message:
          error?.message || "Errore interno del server durante il test push."
      })
    );
  }
}
