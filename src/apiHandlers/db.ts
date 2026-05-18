export async function createDbClient() {
  const databaseUrl =
    process.env.TURSO_DATABASE_URL?.toString().trim() ||
    process.env.LIBSQL_DATABASE_URL?.toString().trim() ||
    process.env.DATABASE_URL?.toString().trim() ||
    '';
  const authToken =
    process.env.TURSO_AUTH_TOKEN?.toString().trim() ||
    process.env.LIBSQL_AUTH_TOKEN?.toString().trim() ||
    process.env.AUTH_TOKEN?.toString().trim() ||
    '';

  if (!databaseUrl || !authToken) {
    throw new Error(
      'Database environment variables not configured. Please set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN or equivalent.'
    );
  }

  const { createClient } = await import('@libsql/client');
  return createClient({ url: databaseUrl, authToken });
}
