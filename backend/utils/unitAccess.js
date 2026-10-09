const pool = require('../db');
const { requiresSuperTutor } = require('./roles');

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

// SQL condition: the user in column `userCol` is a coordinator of the unit
// in `unitParam` (the main UC or an added coordinator). UCs no longer submit
// availability, so they are left out of the unit's tutor lists even if they
// still have an old tutor membership on the same unit.
const isUnitCoordinatorSql = (userCol, unitParam) => `(
  EXISTS (SELECT 1 FROM units cu WHERE cu.id = ${unitParam} AND cu.unit_coordinator_id = ${userCol})
  OR EXISTS (
    SELECT 1 FROM unit_memberships cm
    WHERE cm.unit_id = ${unitParam} AND cm.user_id = ${userCol} AND cm.role = 'coordinator'
  )
)`;

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

// Finds the unit a request is about. unitId wins. A unit code is not unique
// (the same code is reused every semester, and two coordinators can both
// run "CAB201"), so a code is matched to the newest unit the user belongs
// to, falling back to the newest unit with that code.
const resolveUnitForUser = async ({ unitId, unitCode }, userId, clientOrPool = pool) => {
  if (unitId) {
    const byId = await clientOrPool.query(
      'SELECT id, unit_code, unit_name, unit_coordinator_id, availability_locked, availability_deadline FROM units WHERE id = $1',
      [unitId]
    );
    return byId.rows[0] || null;
  }
  if (!unitCode) return null;
  const result = await clientOrPool.query(
    `
    SELECT u.id, u.unit_code, u.unit_name, u.unit_coordinator_id, u.availability_locked, u.availability_deadline,
           (u.id IN (${LINKED_UNITS_SQL.replace(/\$1/g, '$$2')})) AS is_linked
    FROM units u
    WHERE UPPER(TRIM(u.unit_code)) = UPPER(TRIM($1))
    ORDER BY is_linked DESC, u.year DESC, u.created_at DESC
    LIMIT 1
    `,
    [unitCode, userId]
  );
  return result.rows[0] || null;
};

// True when the user is on the unit as a tutor/super tutor: a membership,
// submitted availability, or an assignment in session_tutors.
const isTutorLinkedToUnit = async (userId, unitId, clientOrPool = pool) => {
  if (!userId || !unitId) return false;
  const result = await clientOrPool.query(
    `
    SELECT 1 WHERE EXISTS (
      SELECT 1 FROM unit_memberships WHERE user_id = $1 AND unit_id = $2 AND role IN ('tutor', 'super_tutor')
      UNION
      SELECT 1 FROM availability WHERE tutor_id = $1 AND unit_id = $2
      UNION
      SELECT 1 FROM session_tutors st JOIN sessions s ON s.id = st.session_id
      WHERE st.tutor_id = $1 AND s.unit_id = $2
    )
    `,
    [userId, unitId]
  );
  return result.rows.length > 0;
};

// A plain Tutor may not teach Lectures or Consultations. Returns an error
// message if dropping this person to Tutor would leave one of those with them.
const superTutorDowngradeError = async (userId, unitId, clientOrPool = pool) => {
  const result = await clientOrPool.query(
    `
    SELECT s.session_code, s.session_type
    FROM session_tutors st
    JOIN sessions s ON s.id = st.session_id
    WHERE st.tutor_id = $1 AND s.unit_id = $2
      AND st.tutor_confirmed IS DISTINCT FROM FALSE
    `,
    [userId, unitId]
  );
  const held = result.rows
    .filter(row => requiresSuperTutor(row.session_type))
    .map(row => row.session_code || row.session_type);
  if (held.length === 0) return null;
  return `This person still teaches ${held.join(', ')}, which needs a Super Tutor. Reassign it before changing them to Tutor.`;
};

module.exports = {
  resolveUnitForUser,
  isTutorLinkedToUnit,
  ensureUnitMembership,
  getCoordinatorUnitId,
  isUserLinkedToUnit,
  shareAnyUnit,
  superTutorDowngradeError,
  isUnitCoordinatorSql,
  LINKED_UNITS_SQL
};