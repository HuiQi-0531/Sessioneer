// Used by messages.routes.js.
const { brisbaneDateKey } = require('./brisbaneTime');
const formatMessage = (m, currentUserId) => ({
  id: m.id,
  senderId: m.sender_id,
  recipientId: m.recipient_id || null,
  senderName: m.sender_name || null,
  senderAvatarUrl: m.sender_avatar_url || null,
  content: m.content,
  isRead: m.is_read,
  sentAt: m.sent_at,
  attachmentUrl: m.attachment_url || null,
  attachmentName: m.attachment_name || null,
  attachmentType: m.attachment_type || null,
  attachmentSize: m.attachment_size || null,
  isMine: m.sender_id === currentUserId
});

// Where a unit's group chat sits: 'upcoming', 'current' or 'past'.
// Semester 1 is Jan-Jun and Semester 2 is Jul-Dec, the same windows the
// Active Unit switcher uses, so "current" here always matches it.
// `today` is a Brisbane 'YYYY-MM-DD' so the change happens at Brisbane
// midnight, not UTC midnight (Render runs in UTC).
// Mirrors src/utils/messageUnits.js.
const unitChatStatus = (semester, year, today = brisbaneDateKey(new Date())) => {
  if (!semester || !year) return 'current';
  const isSem1 = String(semester).includes('1');
  const start = `${year}-${isSem1 ? '01-01' : '07-01'}`;
  const end = `${year}-${isSem1 ? '06-30' : '12-31'}`;
  if (today < start) return 'upcoming';
  if (today > end) return 'past';
  return 'current';
};

module.exports = { formatMessage, unitChatStatus };
