// Everyone holding the session (from tutors[], i.e. session_tutors), not
// just the first tutor. A claimed cover that is still running is shown
// next to it, so the timetable always says who is actually teaching.
export const getTutorNames = (session) => (Array.isArray(session.tutors) ? session.tutors : [])
  .map(t => t.tutorName)
  .filter(Boolean);

export const formatCoverNote = (session) => {
  const covers = Array.isArray(session.activeCovers) ? session.activeCovers : [];
  if (covers.length === 0) return '';
  const fmt = (d) => new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  return covers
    .map(c => `Cover: ${c.claimedByName || 'claimed'} (${fmt(c.startDate)} - ${fmt(c.endDate)})`)
    .join('; ');
};

export const getTutorLabel = (session) => getTutorNames(session).join(', ');
