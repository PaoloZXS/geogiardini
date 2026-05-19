import { createDbClient } from "./db.js";
import {
  savePushSubscription,
  ensurePushSubscriptionsTable
} from "../../lib/push.js";

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

    const recipientType =
      parsedBody?.recipientType?.toString()?.trim() || "giardiniere";
    const recipientId =
      parsedBody?.recipientId?.toString()?.trim() ||
      parsedBody?.giardiniereId?.toString()?.trim();
    const subscription = parsedBody?.subscription;
    const endpoint = subscription?.endpoint?.toString().trim();
    const p256dh = subscription?.keys?.p256dh?.toString().trim();
    const auth = subscription?.keys?.auth?.toString().trim();

    if (!recipientId || !endpoint || !p256dh || !auth) {
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

    await savePushSubscription(
      db,
      {
        type: recipientType === "admin" ? "admin" : "giardiniere",
        id: recipientId
      },
      {
        endpoint,
        p256dh,
        auth
      }
    );

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
