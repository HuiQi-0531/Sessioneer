const { Pool, types } = require('pg');
require('dotenv').config();

const { parseTimestampAsUtc } = require('./utils/dbTypes');

// Supabase stores these project timestamps in UTC, but many tables use
// TIMESTAMP without timezone. Parse that Postgres type as UTC in Node.
types.setTypeParser(1114, parseTimestampAsUtc);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('Database connected at:', res.rows[0].now);
  }
});

module.exports = pool;
