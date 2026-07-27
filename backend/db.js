const { Pool, types } = require('pg');
require('dotenv').config();

// Supabase stores these project timestamps in UTC, but many tables use
// TIMESTAMP without timezone. Parse that Postgres type as UTC in Node.
types.setTypeParser(1114, (value) => new Date(`${value}Z`));

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
