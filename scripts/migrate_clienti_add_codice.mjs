import { createClient } from "@libsql/client";

const databaseUrl = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!databaseUrl || !authToken) {
  throw new Error(
    "TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set in environment variables"
  );
}

const db = createClient({
  url: databaseUrl,
  authToken
});

const main = async () => {
  const info = await db.execute("PRAGMA table_info('clienti')", []);
  const columns = Array.isArray(info.rows)
    ? info.rows.map((row) => row[1] || row.name)
    : [];
  console.log("Current clienti columns:", columns);
  if (!columns.includes("codice")) {
    console.log("Adding codice column to clienti...");
    await db.execute(
      'ALTER TABLE clienti ADD COLUMN codice TEXT NOT NULL DEFAULT ""',
      []
    );
    console.log("Column added successfully.");
  } else {
    console.log("Column codice already exists.");
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
