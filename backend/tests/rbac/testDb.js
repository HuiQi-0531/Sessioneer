// Small helpers to reset and query the test database directly.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { Client } = require('pg');

const url = () => process.env.TEST_DATABASE_URL;

const query = async (sql, params = []) => {
  const client = new Client({ connectionString: url() });
  await client.connect();
  try {
    return await client.query(sql, params);
  } finally {
    await client.end();
  }
};

// Load server.js in a separate process so it runs its start-up schema updates
// against the test database, then exit once they have settled.
const runServerSchemaUpdates = () => {
  const script = `
    require('./server');
    setTimeout(() => process.exit(0), 3000);
  `;
  execFileSync(process.execPath, ['-e', script], {
    cwd: path.join(__dirname, '..', '..'),
    env: process.env,
    stdio: 'ignore',
    timeout: 60000
  });
};

// Build a fresh test database that matches the live one.
//
// Two problems in main's own start-up code make a brand-new database come out
// incomplete (the live database is fine because those columns already exist):
//   1. server.js fires its CREATE TABLE and ALTER TABLE statements in parallel,
//      so an ALTER sometimes runs before its table exists and is lost. Running
//      the start-up updates twice fills those gaps.
//   2. Three columns the routes use are never created anywhere on main:
//      sessions.session_code, tutor_applications.maximum_hours and
//      tutor_applications.contract_type. They are added here.
const resetTestDatabase = async () => {
  const setupSql = fs.readFileSync(path.join(__dirname, '..', '..', 'setup-db.sql'), 'utf8');
  await query(`
    DROP SCHEMA public CASCADE;
    CREATE SCHEMA public;
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
    ${setupSql}
  `);
  runServerSchemaUpdates();
  runServerSchemaUpdates();
  await query(`
    ALTER TABLE sessions ADD COLUMN IF NOT EXISTS session_code VARCHAR(30);
    ALTER TABLE tutor_applications ADD COLUMN IF NOT EXISTS maximum_hours INTEGER;
    ALTER TABLE tutor_applications ADD COLUMN IF NOT EXISTS contract_type VARCHAR(50);
  `);
};

// server.js runs many schema updates asynchronously on start-up. Wait until the
// tables the seed needs exist AND the schema has stopped changing, so no test
// starts while a column is still being added.
const waitForSchema = async () => {
  const started = Date.now();
  let lastSignature = '';
  let stableSince = 0;
  while (Date.now() - started < 30000) {
    const r = await query(`
      SELECT
        (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = 'public')
        || ':' ||
        (SELECT COUNT(*) FROM pg_indexes WHERE schemaname = 'public')
        || ':' ||
        (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = 'public') AS sig,
        to_regclass('public.unit_memberships') IS NOT NULL
        AND to_regclass('public.cover_requests') IS NOT NULL
        AND to_regclass('public.session_tutors') IS NOT NULL
        AND to_regclass('public.tutor_applications') IS NOT NULL
        AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'change_requests' AND column_name = 'current_session_id')
        AS ready
    `);
    const { sig, ready } = r.rows[0];
    if (ready && sig === lastSignature) {
      if (Date.now() - stableSince >= 2000) return;
    } else {
      lastSignature = sig;
      stableSince = Date.now();
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('Timed out waiting for the backend to finish creating the database schema');
};

module.exports = { query, resetTestDatabase, waitForSchema };
