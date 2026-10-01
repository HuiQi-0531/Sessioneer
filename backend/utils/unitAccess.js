const pool = require('../db');

const ensureUnitMembership = async (clientOrPool, unitId, userId, role) => {
  await clientOrPool.query(
    `
    INSERT INTO unit_memberships (unit_id, user_id, role)
    VALUES ($1, $2, $3)
    ON CONFLICT (unit_id, user_id, role) DO NOTHING
    `,
    [unitId, userId, role]
  );
};

const getCoordinatorUnitId = async (unitId, userId, clientOrPool = pool) => {
  const result = await clientOrPool.query(
    `
    SELECT u.id
    FROM units u
    LEFT JOIN unit_memberships um
      ON um.unit_id = u.id
     AND um.user_id = $2
     AND um.role = 'coordinator'
    WHERE u.id = $1
      AND (u.unit_coordinator_id = $2 OR um.id IS NOT NULL)
    LIMIT 1
    `,
    [unitId, userId]
  );

  return result.rows[0]?.id || null;
};

// SQL fragment: every unit a user ($1) belongs to in any way - coordinator
// (main or added), tutor / super tutor membership, submitted availability,
// or an assigned session. Same rule the timetable and availability pages use.
const LINKED_UNITS_SQL = `
  SELECT id AS unit_id FROM units WHERE unit_coordinator_id = $1
  UNION
  SELECT unit_id FROM unit_memberships WHERE user_id = $1
  UNION
  SELECT unit_id FROM availability WHERE tutor_id = $1
  UNION
  SELECT s.unit_id FROM session_tutors st JOIN sessions s ON s.id = st.session_id WHERE st.tutor_id = $1
`;

// True when the user belongs to the unit in any role.
const isUserLinkedToUnit = async (userId, unitId, clientOrPool = pool) => {
  if (!userId || !unitId) return false;
  const result = await clientOrPool.query(
    `SELECT 1 FROM (${LINKED_UNITS_SQL}) linked WHERE linked.unit_id = $2 LIMIT 1`,
    [userId, unitId]
  );
  return result.rows.length > 0;
};

// True when two users belong to at least one common unit.
const shareAnyUnit = async (userIdA, userIdB, clientOrPool = pool) => {
  if (!userIdA || !userIdB) return false;
  const result = await clientOrPool.query(
    `
    SELECT 1
    FROM (${LINKED_UNITS_SQL}) a
    JOIN (${LINKED_UNITS_SQL.replace(/\$1/g, '$$2')}) b ON a.unit_id = b.unit_id
    LIMIT 1
    `,
    [userIdA, userIdB]
  );
  return result.rows.length > 0;
};

module.exports = {
  ensureUnitMembership,
  getCoordinatorUnitId,
  isUserLinkedToUnit,
  shareAnyUnit,
  LINKED_UNITS_SQL
};