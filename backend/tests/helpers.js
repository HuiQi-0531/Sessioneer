const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const TEST_PASSWORD = 'Password123!';

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
};

const makeToken = (user) => jwt.sign(
  { id: user.id, email: user.email, role: user.role },
  process.env.JWT_SECRET,
  { expiresIn: '8h' }
);

const getTestDatabaseUrl = () => {
  if (!process.env.TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL must be set in backend/.env.test before running API tests');
  }

  if (process.env.TEST_DATABASE_URL === process.env.DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL must not be the same as DATABASE_URL');
  }

  return process.env.TEST_DATABASE_URL;
};

const query = async (sql, params = []) => {
  const client = new Client({ connectionString: getTestDatabaseUrl() });
  await client.connect();
  try {
    return await client.query(sql, params);
  } finally {
    await client.end();
  }
};

const runSql = async (sql) => {
  const client = new Client({ connectionString: getTestDatabaseUrl() });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
};

const waitForSchema = async () => {
  const started = Date.now();

  while (Date.now() - started < 10000) {
    const result = await query(`
      SELECT
        to_regclass('public.unit_memberships') AS unit_memberships,
        to_regclass('public.tutor_unit_markers') AS tutor_unit_markers,
        to_regclass('public.cover_requests') AS cover_requests,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'units' AND column_name = 'enrolment_size'
        ) AS has_enrolment_size,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'sessions' AND column_name = 'status'
        ) AS has_session_status
    `);

    const row = result.rows[0];
    if (row.unit_memberships && row.tutor_unit_markers && row.cover_requests && row.has_enrolment_size && row.has_session_status) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error('Timed out waiting for backend schema setup');
};

const resetTestDatabase = async () => {
  const setupSql = fs.readFileSync(path.join(__dirname, '..', 'setup-db.sql'), 'utf8');

  await runSql(`
    DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    ${setupSql}
  `);
};

const insertUser = async ({ email, role, firstName, lastName = 'User', status = 'active', maximumHours = null }) => {
  const result = await query(
    `
    INSERT INTO users (email, password_hash, role, name, last_name, account_status, maximum_hours)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id, email, role, name, last_name, account_status
    `,
    [email, hashPassword(TEST_PASSWORD), role, firstName, lastName, status, maximumHours]
  );
  return result.rows[0];
};

const seedCoreData = async () => {
  await query('DELETE FROM users WHERE email LIKE $1', ['%@sessioneer.test']);

  const users = {
    admin: await insertUser({
      email: 'admin@sessioneer.test',
      role: 'admin',
      firstName: 'Admin',
      lastName: 'User'
    }),
    coordinator: await insertUser({
      email: 'coordinator@sessioneer.test',
      role: 'coordinator',
      firstName: 'Casey',
      lastName: 'Coordinator'
    }),
    tutor: await insertUser({
      email: 'tutor@sessioneer.test',
      role: 'tutor',
      firstName: 'Taylor',
      lastName: 'Tutor',
      maximumHours: 20
    }),
    superTutor: await insertUser({
      email: 'supertutor@sessioneer.test',
      role: 'tutor',
      firstName: 'Sam',
      lastName: 'Super',
      maximumHours: 20
    }),
    coverTutor: await insertUser({
      email: 'covertutor@sessioneer.test',
      role: 'tutor',
      firstName: 'Morgan',
      lastName: 'Cover',
      maximumHours: 20
    }),
    pending: await insertUser({
      email: 'pending@sessioneer.test',
      role: 'tutor',
      firstName: 'Pat',
      lastName: 'Pending',
      status: 'pending'
    }),
    disabled: await insertUser({
      email: 'disabled@sessioneer.test',
      role: 'tutor',
      firstName: 'Drew',
      lastName: 'Disabled',
      status: 'disabled'
    })
  };

  const unitResult = await query(
    `
    INSERT INTO units (unit_coordinator_id, unit_code, unit_name, semester, year, enrolment_size)
    VALUES ($1, 'TST101', 'Backend Test Unit', 'Semester 2', 2026, 120)
    RETURNING id, unit_code
    `,
    [users.coordinator.id]
  );
  const unit = unitResult.rows[0];

  await query(
    `
    INSERT INTO unit_memberships (unit_id, user_id, role)
    VALUES
      ($1, $2, 'coordinator'),
      ($1, $3, 'tutor'),
      ($1, $4, 'super_tutor'),
      ($1, $5, 'tutor')
    ON CONFLICT DO NOTHING
    `,
    [unit.id, users.coordinator.id, users.tutor.id, users.superTutor.id, users.coverTutor.id]
  );

  const sessionResult = await query(
    `
    INSERT INTO sessions (unit_id, day, start_time, end_time, location, session_type, capacity, required_tutors, status, assigned_tutor_id)
    VALUES
      ($1, 'Monday', '09:00', '10:00', 'GP-S-401', 'Tutorial', 25, 1, 'Confirmed', NULL),
      ($1, 'Tuesday', '10:00', '12:00', 'GP-S-402', 'Lecture', 150, 1, 'Confirmed', NULL),
      ($1, 'Wednesday', '13:00', '14:00', 'Zoom', 'Consultation', 10, 1, 'Confirmed', NULL),
      ($1, 'Thursday', '14:00', '15:00', 'GP-S-403', 'Tutorial', 25, 1, 'Confirmed', $2)
    RETURNING id, session_type, day
    `,
    [unit.id, users.tutor.id]
  );

  const sessions = Object.fromEntries(
    sessionResult.rows.map((session) => [session.session_type.toLowerCase(), session])
  );

  const tokens = Object.fromEntries(
    Object.entries(users).map(([key, user]) => [key, makeToken(user)])
  );

  return {
    users,
    unit,
    sessions,
    tokens,
    password: TEST_PASSWORD
  };
};

module.exports = {
  TEST_PASSWORD,
  getTestDatabaseUrl,
  query,
  resetTestDatabase,
  seedCoreData,
  waitForSchema
};
