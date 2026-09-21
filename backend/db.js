const { Pool, types } = require('pg');
require('dotenv').config();

// Supabase stores these project timestamps in UTC, but many tables use
// TIMESTAMP without timezone. Parse that Postgres type as UTC in Node.
types.setTypeParser(1114, (value) => new Date(`${value}Z`));

const connectionString = process.env.NODE_ENV === 'test'
  ? process.env.TEST_DATABASE_URL
  : process.env.DATABASE_URL;

if (process.env.NODE_ENV === 'test' && !process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL is required when NODE_ENV=test');
}

const pool = new Pool({
  connectionString,
});

pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Database connected at:', res.rows[0].now);
  }
});

module.exports = pool;
