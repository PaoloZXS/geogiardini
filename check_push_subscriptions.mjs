import { createClient } from '@libsql/client';

const db = createClient({
  url: 'libsql://geogiardini-paolozxs.aws-eu-west-1.turso.io',
  authToken: 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3NzgwODIzMzgsImlkIjoiMDE5ZGZkOGItZWEwMS03NGI2LTkzNTUtZDgxNjI4YjEzMDlkIiwicmlkIjoiZjFjYTE4ZDktOTMxOS00MmFkLTg4NTEtNDFiODVlMTEzOTNiIn0.ZwsaKrGcqLR_THEJ9OUGCE8pOK8mRs7P8fuOhodrsDwIPrff5UVKA2oR6ePLNxRm0cpcmQmaIS1eSV7T0D16CA'
});

const main = async () => {
  const result = await db.execute('SELECT id, giardiniere_id, endpoint, created_at, updated_at FROM push_subscriptions LIMIT 20', []);
  console.log(JSON.stringify(result.rows, null, 2));
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
