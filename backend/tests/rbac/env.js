// Loads backend/.env.test BEFORE the backend code starts, and points the
// backend at the throwaway test database instead of the real one.
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env.test') });

const testDb = process.env.TEST_DATABASE_URL;
if (!testDb) {
  throw new Error('TEST_DATABASE_URL must be set in backend/.env.test (see tests/rbac/README.md)');
}
// Safety: the tests wipe the database, so refuse anything that is not clearly a test DB.
if (!/test/i.test(testDb) || /supabase|render\.com/i.test(testDb)) {
  throw new Error('TEST_DATABASE_URL must point at a throwaway local database whose name contains "test"');
}

// db.js reads DATABASE_URL; dotenv never overrides a variable that is already set,
// so backend/.env cannot switch this back to the real database.
process.env.DATABASE_URL = testDb;
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'sessioneer-rbac-test-secret';
process.env.FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
process.env.EMAIL_FROM = process.env.EMAIL_FROM || 'Sessioneer Test <test@example.com>';
process.env.BREVO_API_KEY = process.env.BREVO_API_KEY || 'test';
process.env.CRON_SECRET = process.env.CRON_SECRET || 'test';
