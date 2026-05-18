type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

type PushSubscriptionRecord = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

import * as fs from "fs";
import * as path from "path";

type PushDeliveryStats = {
  targetedRecipients: number;
  subscriptionCount: number;
  acceptedCount: number;
  failedCount: number;
  removedCount: number;
};

let isConfigured = false;
let webpushInstance: any = null;

async function getWebpush() {
  if (webpushInstance) {
    return webpushInstance;
  }

  const mod = await import("web-push");
  webpushInstance = (mod as any).default ?? mod;
  return webpushInstance;
}

function getVapidKeys() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.toString().trim() ?? "";
  const privateKey = process.env.VAPID_PRIVATE_KEY?.toString().trim() ?? "";
  if (publicKey && privateKey) {
    return { publicKey, privateKey };
  }

  try {
    const vapidFilePath = path.resolve(process.cwd(), "vapid-keys.json");
    if (fs.existsSync(vapidFilePath)) {
      const fileContent = fs.readFileSync(vapidFilePath, "utf8");
      const vapidData = JSON.parse(fileContent);
      const filePublicKey = vapidData?.publicKey?.toString()?.trim() ?? "";
      const filePrivateKey = vapidData?.privateKey?.toString()?.trim() ?? "";
      if (filePublicKey && filePrivateKey) {
        return { publicKey: filePublicKey, privateKey: filePrivateKey };
      }
    }
  } catch (error) {
    console.warn(
      "Impossibile leggere vapid-keys.json per le chiavi VAPID:",
      error
    );
  }

  return { publicKey, privateKey };
}

async function ensureConfigured() {
  if (isConfigured) {
    return;
  }

  const { publicKey, privateKey } = getVapidKeys();
  if (!publicKey || !privateKey) {
    throw new Error(
      "VAPID keys are not configured on server environment variables or vapid-keys.json is missing."
    );
  }

  const webpush = await getWebpush();
  webpush.setVapidDetails("mailto:admin@geogiardini.it", publicKey, privateKey);
  isConfigured = true;
}

export function getPushPublicKey() {
  const { publicKey } = getVapidKeys();
  return publicKey;
}

export async function ensurePushSubscriptionsTable(db: any) {
  await db.execute(
    "CREATE TABLE IF NOT EXISTS push_subscriptions (id TEXT PRIMARY KEY, giardiniere_id TEXT NOT NULL, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
    []
  );
}

export async function savePushSubscription(
  db: any,
  giardiniereId: string,
  subscription: PushSubscriptionRecord
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

export async function sendPushToGiardinieri(
  db: any,
  giardinieriIds: string[],
  payload: PushPayload
) {
  const stats: PushDeliveryStats = {
    targetedRecipients: giardinieriIds.length,
    subscriptionCount: 0,
    acceptedCount: 0,
    failedCount: 0,
    removedCount: 0
  };

  if (!giardinieriIds.length) return stats;

  await ensureConfigured();
  const webpush = await getWebpush();
  await ensurePushSubscriptionsTable(db);

  const placeholders = giardinieriIds.map(() => "?").join(",");
  const result = await db.execute(
    `SELECT giardiniere_id, endpoint, p256dh, auth FROM push_subscriptions WHERE giardiniere_id IN (${placeholders})`,
    giardinieriIds
  );

  const rows = (Array.isArray(result.rows) ? result.rows : []) as any[];
  stats.subscriptionCount = rows.length;
  for (const row of rows) {
    const giardiniereId = row?.giardiniere_id?.toString?.() ?? "";
    const endpoint = row?.endpoint?.toString?.() ?? "";
    const p256dh = row?.p256dh?.toString?.() ?? "";
    const auth = row?.auth?.toString?.() ?? "";
    if (!giardiniereId || !endpoint || !p256dh || !auth) {
      continue;
    }

    const unreadResult = await db.execute(
      "SELECT COUNT(*) AS count FROM notifiche WHERE giardiniere_id = ? AND read = 0",
      [giardiniereId]
    );
    const unreadRow = Array.isArray(unreadResult.rows)
      ? unreadResult.rows[0]
      : null;
    const unreadCount =
      Number(unreadRow?.count ?? Object.values(unreadRow ?? {})[0] ?? 0) || 0;
    const payloadWithBadge = {
      ...payload,
      data: {
        ...(payload.data ?? {}),
        badgeCount: unreadCount
      }
    };

    try {
      await webpush.sendNotification(
        {
          endpoint,
          keys: { p256dh, auth }
        },
        JSON.stringify(payloadWithBadge)
      );
      stats.acceptedCount += 1;
    } catch (error: any) {
      stats.failedCount += 1;
      const statusCode = Number(error?.statusCode ?? 0);
      if (statusCode === 404 || statusCode === 410) {
        await db.execute("DELETE FROM push_subscriptions WHERE endpoint = ?", [
          endpoint
        ]);
        stats.removedCount += 1;
      }
      console.error("Push send failed for endpoint", endpoint, error);
    }
  }

  return stats;
}
