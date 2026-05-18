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
    const { role, username, code } = req.body ?? {};

    if (!['admin', 'giardiniere', 'cliente'].includes(role)) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, message: 'Ruolo di login non valido.' }));
      return;
    }

    if (!username || !code) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, message: 'Nome e codice sono obbligatori.' }));
      return;
    }

    if (role === 'admin') {
      if (username === 'Angelo' && code === 'A2026') {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, role, username }));
        return;
      }
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: false, message: 'Credenziali admin errate.' }));
      return;
    }

    const db = await createDbClient();
    const query =
      role === 'giardiniere'
        ? 'SELECT id FROM giardinieri WHERE LOWER(username) = LOWER(?) AND codice = ? LIMIT 1'
        : 'SELECT id FROM clienti WHERE LOWER(nome) = LOWER(?) AND codice = ? LIMIT 1';

    const result = await db.execute(query, [username.trim(), code.trim()]);
    const rows = Array.isArray(result.rows) ? result.rows : [];

    if (rows.length > 0) {
      const firstRow = rows[0] as any;
      const normalize = (value: unknown) => {
        if (typeof value === 'string') return value;
        if (value == null) return undefined;
        return typeof (value as any).toString === 'function' ? (value as any).toString() : undefined;
      };
      const userId =
        normalize(firstRow?.id) ??
        normalize(firstRow?.ID) ??
        normalize(firstRow?.Id) ??
        normalize(Array.isArray(firstRow) ? firstRow[0] : undefined) ??
        normalize(Object.values(firstRow)[0]);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, role, username, id: userId }));
      return;
    }

    res.statusCode = 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, message: 'Credenziali errate.' }));
  } catch (error: any) {
    console.error('Login API error', error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: false, message: 'Errore interno del server.' }));
  }
}
