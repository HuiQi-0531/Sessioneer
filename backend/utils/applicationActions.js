// Invite and decline for tutor applications. Shared by the coordinator routes
// (tutorApplications.routes.js) and the admin routes (admin.routes.js) so both
// follow the same rules.
const crypto = require('crypto');
const pool = require('../db');
const { normaliseInvitedRole, formatApplication } = require('./applicationRules');
const { getCoordinatorUnitId, superTutorDowngradeError } = require('./unitAccess');

class ApplicationActionError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const NOT_PENDING_MESSAGE = 'This application is no longer pending. Refresh the page to see its current status.';
const INVITE_DAYS = 7;
const MAX_NOTE_LENGTH = 500;

// unitId is optional: a coordinator passes their unit so they can only act on
// applications to it; the admin passes nothing.
const loadApplication = async (applicationId, unitId) => {
  const result = await pool.query(
    'SELECT id, unit_id, email, status FROM tutor_applications WHERE id = $1 AND ($2::uuid IS NULL OR unit_id = $2)',
    [applicationId, unitId || null]
  );
  if (result.rows.length === 0) throw new ApplicationActionError('Application not found', 404);
  return result.rows[0];
};

/**
 * Invite a pending application.
 *  - Applicant already has an account (e.g. a tutor from another unit):
 *    accept-invite refuses existing emails, so they are added to the unit
 *    straight away, like the direct invite does, and the application is closed.
 *  - Otherwise: a 7-day invite link is generated.
 * Every update checks status = 'pending' again, so a page that wasn't
 * refreshed can't invite someone who was already invited or declined.
 */
const inviteApplication = async ({ applicationId, unitId = null, role, invitedById }) => {
  const invitedRole = normaliseInvitedRole(role);
  const application = await loadApplication(applicationId, unitId);
  if (application.status !== 'pending') throw new ApplicationActionError(NOT_PENDING_MESSAGE, 409);
  const appUnitId = application.unit_id;

  const existingUser = await pool.query(
    'SELECT id, role, name, last_name, email FROM users WHERE LOWER(email) = LOWER($1)',
    [application.email]
  );

  if (existingUser.rows.length > 0) {
    const user = existingUser.rows[0];
    if (user.role === 'admin') {
      throw new ApplicationActionError('This email belongs to an administrator account and cannot be added as a tutor.', 409);
    }
    if (await getCoordinatorUnitId(appUnitId, user.id)) {
      throw new ApplicationActionError('This person is already a coordinator of this unit.', 409);
    }
    if (invitedRole === 'tutor') {
      const downgradeError = await superTutorDowngradeError(user.id, appUnitId);
      if (downgradeError) throw new ApplicationActionError(downgradeError, 409);
    }

    // One transaction, so the unit access and the application status change together.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const updated = await client.query(
        `
        UPDATE tutor_applications
        SET status = 'accepted', invited_by_id = $1, invited_at = NOW(), invited_role = $2, created_user_id = $3
        WHERE id = $4 AND status = 'pending'
        RETURNING *
        `,
        [invitedById, invitedRole, user.id, applicationId]
      );
      if (updated.rows.length === 0) throw new ApplicationActionError(NOT_PENDING_MESSAGE, 409);

      await client.query(
        `DELETE FROM unit_memberships WHERE unit_id = $1 AND user_id = $2 AND role IN ('tutor', 'super_tutor') AND role != $3`,
        [appUnitId, user.id, invitedRole]
      );
      await client.query(
        `INSERT INTO unit_memberships (unit_id, user_id, role) VALUES ($1, $2, $3)
         ON CONFLICT (unit_id, user_id, role) DO NOTHING`,
        [appUnitId, user.id, invitedRole]
      );
      const unitRow = (await client.query('SELECT unit_code FROM units WHERE id = $1', [appUnitId])).rows[0] || {};
      const roleLabel = invitedRole === 'super_tutor' ? 'Super Tutor' : 'tutor';
      await client.query(
        `INSERT INTO notifications (user_id, notification_type, title, content, related_unit_id, action_url)
         VALUES ($1, 'tutor_unit_invite', 'Added to a new tutor unit', $2, $3, '/tutor-dashboard')`,
        [user.id, `You have been added as a ${roleLabel} for ${unitRow.unit_code || 'a unit'}.`, appUnitId]
      );
      await client.query('COMMIT');
      return { ...formatApplication(updated.rows[0]), addedExistingUser: true };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);
  const result = await pool.query(
    `
    UPDATE tutor_applications
    SET status = 'invited', invited_by_id = $1, invited_at = NOW(),
        invite_token = $2, invite_token_expires_at = $3, invited_role = $4
    WHERE id = $5 AND status = 'pending'
    RETURNING *
    `,
    [invitedById, token, expiresAt, invitedRole, applicationId]
  );
  if (result.rows.length === 0) throw new ApplicationActionError(NOT_PENDING_MESSAGE, 409);
  return { ...formatApplication(result.rows[0]), inviteToken: token };
};

// Decline a pending application. The applicant isn't notified; the note is
// only for the UC and admin.
const declineApplication = async ({ applicationId, unitId = null, note }) => {
  const cleanNote = String(note || '').trim();
  if (cleanNote.length > MAX_NOTE_LENGTH) {
    throw new ApplicationActionError(`Note must be ${MAX_NOTE_LENGTH} characters or fewer`, 400);
  }
  await loadApplication(applicationId, unitId);

  const result = await pool.query(
    `
    UPDATE tutor_applications
    SET status = 'rejected', review_note = $1, reviewed_at = NOW()
    WHERE id = $2 AND status = 'pending'
    RETURNING *
    `,
    [cleanNote || null, applicationId]
  );
  if (result.rows.length === 0) throw new ApplicationActionError(NOT_PENDING_MESSAGE, 409);
  return formatApplication(result.rows[0]);
};

module.exports = {
  ApplicationActionError,
  inviteApplication,
  declineApplication,
  MAX_NOTE_LENGTH
};