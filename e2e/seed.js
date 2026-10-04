// The known world every E2E story starts from. Password for everyone: Password123!
const path = require('path');
const backendDir = path.join(__dirname, '..', 'backend');
const { Client } = require(path.join(backendDir, 'node_modules/pg'));
const { hashPassword } = require(path.join(backendDir, 'utils/passwords'));

const PASSWORD = 'Password123!';
const USERS = {
  uc: { email: 'uc@e2e.test', role: 'coordinator', name: 'Uma', last: 'Coordinator' },
  tutor: { email: 'tutor@e2e.test', role: 'tutor', name: 'Tia', last: 'Tutor' },
  cover: { email: 'cover@e2e.test', role: 'tutor', name: 'Cal', last: 'Cover' },
  admin: { email: 'admin@e2e.test', role: 'admin', name: 'Ada', last: 'Admin' }
};

const seed = async (url) => {
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    const ids = {};
    for (const [key, u] of Object.entries(USERS)) {
      ids[key] = (await db.query(
        `INSERT INTO users (email, password_hash, role, name, last_name, maximum_hours)
         VALUES ($1, $2, $3, $4, $5, 20) RETURNING id`,
        [u.email, hashPassword(PASSWORD), u.role, u.name, u.last]
      )).rows[0].id;
    }
    const unitId = (await db.query(
      `INSERT INTO units (unit_coordinator_id, unit_code, unit_name, semester, year, enrolment_size, availability_deadline, draft_released)
       VALUES ($1, 'E2E101', 'End To End', 'Semester 2', $2, 60, NOW() + INTERVAL '30 days', TRUE) RETURNING id`,
      [ids.uc, new Date().getFullYear()]
    )).rows[0].id;
    await db.query(
      `INSERT INTO unit_memberships (unit_id, user_id, role) VALUES ($1, $2, 'coordinator'), ($1, $3, 'tutor'), ($1, $4, 'tutor')`,
      [unitId, ids.uc, ids.tutor, ids.cover]
    );
    const session = async (code, day, start, end) => (await db.query(
      `INSERT INTO sessions (unit_id, session_code, day, start_time, end_time, location, campus, session_type, capacity, required_tutors, status)
       VALUES ($1, $2, $3, $4, $5, 'GP-P-101', 'GP', 'Tutorial', 30, 1, 'Confirmed') RETURNING id`,
      [unitId, code, day, start, end]
    )).rows[0].id;
    const tut01 = await session('TUT01', 'MON', '09:00', '10:00');
    const tut02 = await session('TUT02', 'TUE', '13:00', '14:00');
    const tut03 = await session('TUT03', 'WED', '15:00', '16:00');
    // Two offers waiting for the tutor's answer.
    await db.query('INSERT INTO session_tutors (session_id, tutor_id) VALUES ($1, $3), ($2, $3)', [tut01, tut02, ids.tutor]);
    return { ids, unitId, sessions: { tut01, tut02, tut03 } };
  } finally {
    await db.end();
  }
};

// Wipe every table and seed again, so each story starts from the same world.
// Uses TEST_DATABASE_URL from backend/.env.test (start-backend.js checks it).
const testDbUrl = () => {
  require(path.join(backendDir, 'node_modules/dotenv')).config({ path: path.join(backendDir, '.env.test'), quiet: true });
  return process.env.TEST_DATABASE_URL;
};
const resetWorld = async () => {
  const url = testDbUrl();
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    await db.query(`
      DO $$ DECLARE r RECORD;
      BEGIN
        FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations' LOOP
          EXECUTE 'TRUNCATE TABLE public.' || quote_ident(r.tablename) || ' RESTART IDENTITY CASCADE';
        END LOOP;
      END $$;
    `);
  } finally {
    await db.end();
  }
  return seed(url);
};

// Run SQL against the test database from a story (for checks the UI cannot show).
const sql = async (text, params = []) => {
  const db = new Client({ connectionString: testDbUrl() });
  await db.connect();
  try {
    return (await db.query(text, params)).rows;
  } finally {
    await db.end();
  }
};

module.exports = { seed, resetWorld, sql, USERS, PASSWORD };
