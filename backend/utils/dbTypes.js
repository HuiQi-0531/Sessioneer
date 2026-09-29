// Supabase stores these project timestamps in UTC, but many tables use
// TIMESTAMP without timezone. Parse that Postgres type as UTC in Node.
// (Moved here unchanged from db.js so it can be tested without a database.)
const parseTimestampAsUtc = (value) => new Date(`${value}Z`);

module.exports = { parseTimestampAsUtc };
