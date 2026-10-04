// Brings a database up to date:
//   1. runs setup-db.sql (creates anything missing, never deletes)
//   2. runs every db/migrations/NNN_*.sql not yet recorded in schema_migrations,
//      in order, each inside its own transaction.
//
// Usage (from backend/):
//   npm run db:migrate                      uses DATABASE_URL from .env
//   DATABASE_URL=postgres://... npm run db:migrate
//
// Always try it on a copy / staging database before the live one.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const ROOT = path.join(__dirname, '..');
const MIGRATIONS_DIR = path.join(ROOT, 'db', 'migrations');

const migrate = async (connectionString = process.env.DATABASE_URL, log = console.log) => {
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query('SET client_min_messages TO warning');
    await client.query(fs.readFileSync(path.join(ROOT, 'setup-db.sql'), 'utf8'));
    log('setup-db.sql applied');

    const files = fs.existsSync(MIGRATIONS_DIR)
      ? fs.readdirSync(MIGRATIONS_DIR).filter(f => /^\d+_.+\.sql$/.test(f)).sort()
      : [];
    const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map(r => r.name));

    for (const file of files) {
      if (done.has(file)) continue;
      await client.query('BEGIN');
      try {
        await client.query(fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8'));
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        log(`migration applied: ${file}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`migration ${file} failed: ${error.message}`);
      }
    }
    log('database is up to date');
  } finally {
    await client.end();
  }
};

if (require.main === module) {
  migrate().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { migrate };
