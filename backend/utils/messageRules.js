// Moved here unchanged from messages.routes.js.
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

module.exports = { formatMessage };
