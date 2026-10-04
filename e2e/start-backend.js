// Starts the real backend for the E2E tests on port 5001, against the
// throwaway TEST database (never the real one):
//   1. reads backend/.env.test (same file the backend tests use)
//   2. wipes the test database and rebuilds it with `migrate`
//   3. seeds a small known world (see seed.js)
//   4. starts the server
const path = require('path');
const backendDir = path.join(__dirname, '..', 'backend');
const requireBackend = (p) => require(path.join(backendDir, p));

requireBackend('node_modules/dotenv').config({ path: path.join(backendDir, '.env.test') });
const testDb = process.env.TEST_DATABASE_URL;
if (!testDb || !/test/i.test(testDb) || /supabase|render\.com/i.test(testDb)) {
  throw new Error('Set TEST_DATABASE_URL in backend/.env.test to a local database whose name contains "test" (see backend/tests/rbac/README.md)');
}
process.env.DATABASE_URL = testDb;
process.env.JWT_SECRET = process.env.JWT_SECRET || 'sessioneer-e2e-secret';
process.env.CRON_SECRET = process.env.CRON_SECRET || 'e2e';
process.env.FRONTEND_URL = 'http://localhost:3000';
process.env.BREVO_API_KEY = ''; // never send real emails

const { Client } = requireBackend('node_modules/pg');
const { migrate } = requireBackend('scripts/migrate');
const { seed } = require('./seed');

(async () => {
  const client = new Client({ connectionString: testDb });
  await client.connect();
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await client.end();
  await migrate(testDb, () => {});
  await seed(testDb);

  const { server } = requireBackend('server');
  server.listen(5001, () => console.log('E2E backend ready on http://localhost:5001'));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
