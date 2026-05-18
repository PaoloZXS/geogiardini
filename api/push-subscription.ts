import { ensurePushSubscriptionsTable, savePushSubscription } from '../lib/push';

async function createDbClient() {
  const databaseUrl = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!databaseUrl || !authToken) {
    throw new Error('TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set in environment variables');
  }

  const { createClient } = await import('@libsql/client');
  return createClient({ url: databaseUrl, authToken });
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, message: 'Method not allowed.' }));
    return;
  }

  try {
    const parsedBody =
      typeof req.body === 'string'
        ? JSON.parse(req.body || '{}')
        : req.body ?? {};

    const { giardiniereId, subscription } = parsedBody;
    const normalizedGiardiniereId = giardiniereId?.toString().trim();
    const endpoint = subscription?.endpoint?.toString().trim();
    const p256dh = subscription?.keys?.p256dh?.toString().trim();
    const auth = subscription?.keys?.auth?.toString().trim();

    if (!normalizedGiardiniereId || !endpoint || !p256dh || !auth) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, message: 'Sottoscrizione push non valida.' }));
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
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true }));
  } catch (error) {
    console.error('Saving push subscription failed', error);
    const details =
      error instanceof Error && error.message
        ? error.message
        : 'Errore sconosciuto durante registrazione push.';
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: false,
        message: `Errore durante il salvataggio della sottoscrizione push. Dettaglio: ${details}`
      })
    );
  }
}
