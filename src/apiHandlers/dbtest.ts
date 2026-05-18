import { createDbClient } from './db';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, message: 'Method not allowed.' }));
    return;
  }

  try {
    const db = await createDbClient();
    const result = await db.execute('SELECT 1', []);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, result: result.rows || [] }));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }));
  }
}
