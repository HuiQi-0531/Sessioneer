const pool = require('../db');

/**
 * Creates a notification for a user. Other route files (sessions, requests)
 * call this when something happens that the user should be told about.
 *
 * @param {object} params
 * @param {string} params.userId - who the notification is for
 * @param {string} params.type - short machine-readable type, e.g. 'session_assigned'
 * @param {string} params.title
 * @param {string} params.content
 * @param {string} [params.unitId]
 * @param {string} [params.sessionId]
 * @param {string} [params.actionUrl]
 */
const createNotification = async ({ userId, type, title, content, unitId, sessionId, actionUrl }) => {
  try {
    await pool.query(
      `
      INSERT INTO notifications
        (user_id, notification_type, title, content, related_unit_id, related_session_id, action_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [userId, type, title, content, unitId || null, sessionId || null, actionUrl || null]
    );
  } catch (error) {
    // A notification failing to write should never break the action that triggered it
    console.error('Error creating notification:', error);
  }
};

module.exports = { createNotification };