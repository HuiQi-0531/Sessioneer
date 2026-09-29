// Moved here unchanged from tutors.routes.js.
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

const cleanTagList = (tags) => (Array.isArray(tags)
  ? tags.map(t => t.trim()).filter(t => t.length > 0)
  : []);

module.exports = { formatTutor, cleanTagList };
