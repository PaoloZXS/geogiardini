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
  const result = await db.execute(
    "SELECT id, giardiniere_id, endpoint, created_at, updated_at FROM push_subscriptions LIMIT 20",
    []
  );
  console.log(JSON.stringify(result.rows, null, 2));
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
