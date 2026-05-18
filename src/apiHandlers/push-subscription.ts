import { createDbClient } from "./db";

async function ensurePushSubscriptionsTable(db: any) {
  await db.execute(
    "CREATE TABLE IF NOT EXISTS push_subscriptions (id TEXT PRIMARY KEY, giardiniere_id TEXT NOT NULL, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
    []
  );
}

async function savePushSubscription(
  db: any,
  giardiniereId: string,
  subscription: { endpoint: string; p256dh: string; auth: string }
) {
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO push_subscriptions (id, giardiniere_id, endpoint, p256dh, auth, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET giardiniere_id = excluded.giardiniere_id, p256dh = excluded.p256dh, auth = excluded.auth, updated_at = excluded.updated_at",
    [
      crypto.randomUUID(),
      giardiniereId,
      subscription.endpoint,
      subscription.p256dh,
      subscription.auth,
      now,
      now
    ]
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

    const { giardiniereId, subscription } = parsedBody;
    const normalizedGiardiniereId = giardiniereId?.toString().trim();
    const endpoint = subscription?.endpoint?.toString().trim();
    const p256dh = subscription?.keys?.p256dh?.toString().trim();
    const auth = subscription?.keys?.auth?.toString().trim();

    if (!normalizedGiardiniereId || !endpoint || !p256dh || !auth) {
      res.statusCode = 400;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          success: false,
          message: "Sottoscrizione push non valida."
        })
      );
      return;
    }

    const db = await createDbClient();
    await ensurePushSubscriptionsTable(db);

    await savePushSubscription(db, normalizedGiardiniereId, {
      endpoint,
      p256dh,
      auth
    });

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ success: true }));
  } catch (error) {
    console.error("Saving push subscription failed", error);
    const details =
      error instanceof Error && error.message
        ? error.message
        : "Errore sconosciuto durante registrazione push.";
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        success: false,
        message: `Errore durante il salvataggio della sottoscrizione push. Dettaglio: ${details}`
      })
    );
  }
}
