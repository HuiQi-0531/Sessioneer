// Small helpers to reset and query the test database directly.
const { Client } = require('pg');
const { migrate } = require('../../scripts/migrate');

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

// Build a fresh test database from the blueprint: setup-db.sql plus every
// migration, exactly what `npm run db:migrate` does to a real database.
// (This used to load server.js twice to let its start-up ALTERs settle and
// then patch three columns by hand. The schema now lives only in
// setup-db.sql, so none of that is needed.)
const resetTestDatabase = async () => {
  await query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate(url(), () => {});
};

// Kept for older callers: the schema is complete as soon as migrate() returns.
const waitForSchema = async () => {};

module.exports = { query, resetTestDatabase, waitForSchema };
