// Tutor list formatting and tag cleanup used by tutors.routes.js.
const formatTutor = (t) => ({
  id: t.id,
  name: t.name,
  email: t.email,
  avatarUrl: t.avatar_url,
  phoneNumber: t.phone_number,
  workExperience: t.work_experience,
  maximumHours: t.maximum_hours,
  contractType: t.contract_type,
  role: t.membership_role || 'tutor',
  isSuperTutor: t.membership_role === 'super_tutor',
  priorityTag: t.priority_tag || 'Standard',
  internalNotes: t.internal_notes || '',
  tags: t.tags || [],
  earlyAccess: t.early_access || false,
  starred: t.starred || false,
  flagged: t.flagged || false
});

// Keep only text tags, trimmed, with empty ones removed. A tag that is not
// text (for example a number) is skipped instead of crashing the save.
const cleanTagList = (tags) => (Array.isArray(tags)
  ? tags.filter(t => typeof t === 'string').map(t => t.trim()).filter(t => t.length > 0)
  : []);

module.exports = { formatTutor, cleanTagList };
