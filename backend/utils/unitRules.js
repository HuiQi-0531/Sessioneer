// Unit logic used by units.routes.js (normaliseUnitCode also by admin.routes.js).
const pool = require('../db');
const { isUnitActive } = require('./normalise');

const formatUnit = (u) => ({
  id: u.id,
  unitCode: u.unit_code,
  unitName: u.unit_name,
  semester: u.semester,
  year: u.year,
  campus: u.campus,
  deliveryMode: u.delivery_mode,
  enrolmentSize: u.enrolment_size,
  availabilityDeadline: u.availability_deadline,
  availabilityLocked: u.availability_locked,
  scheduleLocked: u.schedule_locked || false,
  scheduleLockedAt: u.schedule_locked_at || null,
  draftReleased: u.draft_released || false,
  isActive: isUnitActive(u.semester, u.year)
});

const formatUnitAccess = (u) => ({
  ...formatUnit(u),
  roles: u.roles || []
});

const normaliseUnitCode = (unitCode) => String(unitCode || '').trim().toUpperCase();

const normaliseEmails = (emails) => {
  if (!Array.isArray(emails)) return [];

  return [...new Set(
    emails
      .map(email => String(email || '').trim().toLowerCase())
      .filter(Boolean)
  )];
};

const loadCoordinatorUsersByEmail = async (emails, currentUserEmail = null, clientOrPool = pool) => {
  const cleanEmails = normaliseEmails(emails)
    .filter(email => email !== String(currentUserEmail || '').trim().toLowerCase());

  if (cleanEmails.length === 0) {
    return { users: [], missingEmails: [], nonCoordinatorEmails: [] };
  }

  const result = await clientOrPool.query(
    `
    SELECT id, name, last_name, email, role
    FROM users
    WHERE LOWER(email) = ANY($1::text[])
    `,
    [cleanEmails]
  );

  const foundByEmail = new Map(result.rows.map(user => [user.email.toLowerCase(), user]));
  const missingEmails = cleanEmails.filter(email => !foundByEmail.has(email));
  const nonCoordinatorEmails = result.rows
    .filter(user => user.role !== 'coordinator')
    .map(user => user.email);
  const users = result.rows.filter(user => user.role === 'coordinator');

  return { users, missingEmails, nonCoordinatorEmails };
};

// Lock-schedule readiness (was inline in PATCH /units/:id/lock-schedule).
const canLockSchedule = (unassignedCount, pendingCount, force) =>
  !(!force && (unassignedCount > 0 || pendingCount > 0));

// One row per session in the unit: how many tutors it needs, how many are
// holding it (pending or confirmed) and how many have not answered yet.
// Read from session_tutors, the single source of truth for assignments.
const SCHEDULE_READINESS_SQL = `
  SELECT s.id,
         COALESCE(s.required_tutors, 1) AS required_tutors,
         COUNT(st.id) FILTER (WHERE st.tutor_confirmed IS DISTINCT FROM FALSE) AS active_count,
         COUNT(st.id) FILTER (WHERE st.tutor_confirmed IS NULL) AS pending_count
  FROM sessions s
  LEFT JOIN session_tutors st ON st.session_id = s.id
  WHERE s.unit_id = $1
  GROUP BY s.id, s.required_tutors
`;

// unassignedCount = sessions still short of tutors; pendingCount = sessions
// with at least one tutor who has not confirmed or declined yet.
const summariseScheduleReadiness = (rows) => rows.reduce((acc, row) => {
  const required = Math.max(1, Number(row.required_tutors) || 1);
  if (Number(row.active_count) < required) acc.unassignedCount += 1;
  if (Number(row.pending_count) > 0) acc.pendingCount += 1;
  return acc;
}, { unassignedCount: 0, pendingCount: 0 });

// Deletes a unit and everything that belongs to it, children first, in one
// transaction. Needed because several tables reference units/sessions
// without ON DELETE CASCADE (a plain DELETE FROM units fails with a FK error).
const deleteUnitCascade = async (poolOrClient, unitId) => {
  const ownClient = typeof poolOrClient.connect === 'function' && !poolOrClient.release;
  const client = ownClient ? await poolOrClient.connect() : poolOrClient;
  const sessionIds = 'SELECT id FROM sessions WHERE unit_id = $1';
  const statements = [
    'DELETE FROM cover_requests WHERE unit_id = $1 OR session_id IN (' + sessionIds + ')',
    'DELETE FROM cover_batches WHERE unit_id = $1',
    'DELETE FROM change_requests WHERE unit_id = $1 OR session_id IN (' + sessionIds + ')',
    'DELETE FROM swap_requests WHERE current_session_id IN (' + sessionIds + ') OR preferred_session_id IN (' + sessionIds + ')',
    'DELETE FROM session_assign WHERE unit_id = $1 OR session_id IN (' + sessionIds + ')',
    'DELETE FROM session_tutors WHERE session_id IN (' + sessionIds + ')',
    'UPDATE notifications SET related_session_id = NULL WHERE related_session_id IN (' + sessionIds + ')',
    'UPDATE notifications SET related_unit_id = NULL WHERE related_unit_id = $1',
    'DELETE FROM availability WHERE unit_id = $1',
    'DELETE FROM sessions WHERE unit_id = $1',
    'DELETE FROM units WHERE id = $1'
  ];
  try {
    if (ownClient) await client.query('BEGIN');
    for (const sql of statements) {
      const table = sql.match(/(?:FROM|UPDATE) (\w+)/)[1];
      const exists = await client.query('SELECT to_regclass($1) AS t', [`public.${table}`]);
      if (exists.rows[0].t) await client.query(sql, [unitId]);
    }
    if (ownClient) await client.query('COMMIT');
  } catch (error) {
    if (ownClient) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    if (ownClient) client.release();
  }
};

// Name for a duplicated unit (was inline in POST /units/:id/duplicate).
const resolveDuplicateUnitName = (unitName, sourceUnitName) =>
  (unitName || sourceUnitName || '').trim() || sourceUnitName;

module.exports = {
  formatUnit,
  formatUnitAccess,
  normaliseUnitCode,
  normaliseEmails,
  loadCoordinatorUsersByEmail,
  canLockSchedule,
  resolveDuplicateUnitName,
  SCHEDULE_READINESS_SQL,
  summariseScheduleReadiness,
  deleteUnitCascade
};
