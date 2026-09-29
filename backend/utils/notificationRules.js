// Moved here unchanged from notifications.routes.js.
const { joinUserName } = require('./userNames');

const replaceEmailsWithNames = (content, users) => {
  if (!content) return content;
  return users.reduce((text, user) => {
    const displayName = joinUserName(user.name, user.last_name);
    if (!user.email || !displayName) return text;
    return text.replaceAll(user.email, displayName);
  }, content);
};

const formatNotification = (n, users = []) => ({
  id: n.id,
  type: n.notification_type,
  title: n.title,
  content: replaceEmailsWithNames(n.content, users),
  relatedUnitId: n.related_unit_id,
  relatedSessionId: n.related_session_id,
  actionUrl: n.action_url,
  isRead: n.is_read,
  createdAt: n.created_at
});

module.exports = { replaceEmailsWithNames, formatNotification };
