import { createDbClient, ensureGiardinieriTable } from '../lib/db';
import { ensurePushSubscriptionsTable, savePushSubscription } from '../lib/push';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, message: 'Method not allowed.' }));
    return;
  }

  try {
    const { giardiniereId, subscription } = req.body ?? {};
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

    const db = createDbClient();
    await ensureGiardinieriTable(db);
    await ensurePushSubscriptionsTable(db);

    const giardiniereResult = await db.execute(
      'SELECT id FROM giardinieri WHERE id = ? LIMIT 1',
      [normalizedGiardiniereId]
    );
    const giardiniereRows = Array.isArray(giardiniereResult.rows)
      ? giardiniereResult.rows
      : [];

    if (giardiniereRows.length === 0) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, message: 'Giardiniere non trovato.' }));
      return;
    }

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
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        success: false,
        message: 'Errore durante il salvataggio della sottoscrizione push.'
      })
    );
  }
}
