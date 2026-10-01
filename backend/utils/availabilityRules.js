// Availability logic moved here unchanged from availability.routes.js.

// Helper: convert TIME string "08:00:00" back to "8:00am"
// (this page's own slot format - different from normalise.js timeToSlot)
const availabilityTimeToSlot = (timeStr) => {
  const [h] = timeStr.split(':');
  const hour = parseInt(h);
  if (hour === 0) return '12:00am';
  if (hour < 12) return `${hour}:00am`;
  if (hour === 12) return '12:00pm';
  return `${hour - 12}:00pm`;
};

// Normalises day "Monday" -> "MON" for the availability slot key format
const AVAILABILITY_DAY_MAP = {
  Monday: 'MON', Tuesday: 'TUE', Wednesday: 'WED', Thursday: 'THU', Friday: 'FRI',
  MON: 'MON', TUE: 'TUE', WED: 'WED', THU: 'THU', FRI: 'FRI',
};

// True if the unit's availability window is closed, either because a
// coordinator locked it manually or because the deadline has passed.
const isAvailabilityLocked = (unit) => {
  if (unit.availability_locked) return true;
  if (unit.availability_deadline && new Date() > new Date(unit.availability_deadline)) return true;
  return false;
};

// One submitted slot, e.g. "Monday-8:00am": "preferred" (was inline in POST /availability/submit).
// Returns null for anything the route skipped.
const parseAvailabilitySlot = (key, preference) => {
  const dashIdx = key.indexOf('-');
  if (dashIdx === -1) return null;
  const dayRaw = key.slice(0, dashIdx);
  const timeRaw = key.slice(dashIdx + 1);

  const day = AVAILABILITY_DAY_MAP[dayRaw];
  if (!day) return null;
  if (!['preferred', 'available', 'avoid'].includes(preference)) return null;

  const timeMatch = timeRaw.match(/^(\d+):(\d+)(am|pm)$/);
  if (!timeMatch) return null;
  let hour = parseInt(timeMatch[1]);
  const period = timeMatch[3];
  // A 12-hour clock only goes from 1 to 12, so anything else is not a real time.
  if (hour < 1 || hour > 12) return null;
  if (period === 'pm' && hour !== 12) hour += 12;
  if (period === 'am' && hour === 12) hour = 0;
  const startTime = `${String(hour).padStart(2, '0')}:00:00`;
  const endTime = `${String(hour + 1).padStart(2, '0')}:00:00`;

  return { day, startTime, endTime, preference };
};

// The coordinator's availability grid (was inline in GET /availability).
const buildAvailabilityGrid = (tutorRows, submittedRows, availRows) => {
  const tutors = tutorRows.map(t => ({ id: t.id, name: t.name, icon: null }));
  const visibleTutorIds = new Set(tutors.map(t => t.id));
  const submittedIds = new Set(
    submittedRows
      .map(r => r.tutor_id)
      .filter(id => visibleTutorIds.has(id))
  );

  const submissionStatus = tutors.map(t => ({
    tutorId: t.id,
    submitted: submittedIds.has(t.id),
  }));

  const availability = { MON: {}, TUE: {}, WED: {}, THU: {}, FRI: {} };
  for (const row of availRows) {
    if (!visibleTutorIds.has(row.tutor_id)) continue;
    const day = AVAILABILITY_DAY_MAP[row.day];
    if (!day) continue;
    const slot = availabilityTimeToSlot(row.start_time);
    if (!availability[day][row.tutor_id]) availability[day][row.tutor_id] = {};
    availability[day][row.tutor_id][slot] = row.preference;
  }

  return { tutors, submissionStatus, availability };
};

module.exports = {
  AVAILABILITY_DAY_MAP,
  availabilityTimeToSlot,
  isAvailabilityLocked,
  parseAvailabilitySlot,
  buildAvailabilityGrid
};
