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

module.exports = {
  ensureUnitMembership,
  getCoordinatorUnitId
};
