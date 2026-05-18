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

const sql =
  "SELECT name, sql FROM sqlite_master WHERE type='table' AND name IN ('clienti','giardinieri')";

db.execute(sql, [])
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
