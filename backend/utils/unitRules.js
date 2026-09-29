// Unit logic moved here unchanged from units.routes.js (normaliseUnitCode also from admin.routes.js).
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
  resolveDuplicateUnitName
};
