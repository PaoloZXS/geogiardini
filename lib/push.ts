type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

type PushTargetType = "admin" | "giardiniere";

type PushTarget = {
  type: PushTargetType;
  id: string;
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
    "CREATE TABLE IF NOT EXISTS push_subscriptions (id TEXT PRIMARY KEY, giardiniere_id TEXT NOT NULL, target_type TEXT NOT NULL DEFAULT 'giardiniere', target_id TEXT NOT NULL DEFAULT '', endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
    []
  );

  const columnsResult = await db.execute(
    "PRAGMA table_info('push_subscriptions')",
    []
  );
  const columns = extractTableColumns(columnsResult.rows);

  if (!columns.includes("target_type")) {
    await safeAddColumn(
      db,
      "ALTER TABLE push_subscriptions ADD COLUMN target_type TEXT NOT NULL DEFAULT 'giardiniere'"
    );
  }

  if (!columns.includes("target_id")) {
    await safeAddColumn(
      db,
      "ALTER TABLE push_subscriptions ADD COLUMN target_id TEXT NOT NULL DEFAULT ''"
    );
  }

  if (!columns.includes("giardiniere_id")) {
    await safeAddColumn(
      db,
      "ALTER TABLE push_subscriptions ADD COLUMN giardiniere_id TEXT NOT NULL DEFAULT ''"
    );
  }

  await db.execute(
    "UPDATE push_subscriptions SET target_type = COALESCE(NULLIF(target_type, ''), 'giardiniere'), target_id = COALESCE(NULLIF(target_id, ''), giardiniere_id) WHERE target_id = '' OR target_id IS NULL",
    []
  );
}

export async function savePushSubscription(
  db: any,
  target: PushTarget,
  subscription: PushSubscriptionRecord
) {
  const now = new Date().toISOString();
  await db.execute(
    "INSERT INTO push_subscriptions (id, giardiniere_id, target_type, target_id, endpoint, p256dh, auth, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET giardiniere_id = excluded.giardiniere_id, target_type = excluded.target_type, target_id = excluded.target_id, p256dh = excluded.p256dh, auth = excluded.auth, updated_at = excluded.updated_at",
    [
      crypto.randomUUID(),
      target.id,
      target.type,
      target.id,
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
  return sendPushToTargets(
    db,
    giardinieriIds.map((id) => ({ type: "giardiniere" as const, id })),
    payload
  );
}

export async function sendPushToAdmins(db: any, payload: PushPayload) {
  return sendPushToTargets(db, [{ type: "admin", id: "admin" }], payload);
}

export async function sendPushToTargets(
  db: any,
  targets: PushTarget[],
  payload: PushPayload
) {
  const stats: PushDeliveryStats = {
    targetedRecipients: targets.length,
    subscriptionCount: 0,
    acceptedCount: 0,
    failedCount: 0,
    removedCount: 0
  };

  if (!targets.length) return stats;

  await ensureConfigured();
  const webpush = await getWebpush();
  await ensurePushSubscriptionsTable(db);

  const clauses = targets
    .map(() => "(target_type = ? AND target_id = ?)")
    .join(" OR ");
  const params = targets.flatMap((target) => [target.type, target.id]);
  const result = await db.execute(
    `SELECT giardiniere_id, target_type, target_id, endpoint, p256dh, auth FROM push_subscriptions WHERE ${clauses}`,
    params
  );

  const rows = (Array.isArray(result.rows) ? result.rows : []) as any[];
  stats.subscriptionCount = rows.length;
  for (const row of rows) {
    const targetType = row?.target_type?.toString?.() ?? "giardiniere";
    const targetId =
      row?.target_id?.toString?.() ?? row?.giardiniere_id?.toString?.() ?? "";
    const endpoint = row?.endpoint?.toString?.() ?? "";
    const p256dh = row?.p256dh?.toString?.() ?? "";
    const auth = row?.auth?.toString?.() ?? "";
    if (!targetId || !endpoint || !p256dh || !auth) {
      continue;
    }

    let badgeCount = Number(payload.data?.badgeCount ?? 0) || 0;
    if (targetType === "giardiniere") {
      const unreadResult = await db.execute(
        "SELECT COUNT(*) AS count FROM notifiche WHERE giardiniere_id = ? AND read = 0",
        [targetId]
      );
      const unreadRow = Array.isArray(unreadResult.rows)
        ? unreadResult.rows[0]
        : null;
      badgeCount =
        Number(unreadRow?.count ?? Object.values(unreadRow ?? {})[0] ?? 0) || 0;
    }
    const payloadWithBadge = {
      ...payload,
      data: {
        ...(payload.data ?? {}),
        badgeCount
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
