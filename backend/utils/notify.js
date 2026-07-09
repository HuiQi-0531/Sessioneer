const pool = require('../db');

// Maps a notification type prefix to the users column that controls it.
// Types that don't match either prefix are always created (e.g. none currently).
const getPreferenceColumn = (type) => {
  if (type.startsWith('session_')) return 'notify_session_updates';
  if (type.startsWith('request_')) return 'notify_request_updates';
  return null;
};

/**
 * Creates a notification for a user, unless they've turned off that
 * category of notification in their Profile settings.
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
    const prefColumn = getPreferenceColumn(type);
    if (prefColumn) {
      const prefResult = await pool.query(
        `SELECT ${prefColumn} FROM users WHERE id = $1`,
        [userId]
      );
      const enabled = prefResult.rows[0]?.[prefColumn];
      // Column defaults to TRUE; only skip if explicitly disabled.
      if (enabled === false) return;
    }

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