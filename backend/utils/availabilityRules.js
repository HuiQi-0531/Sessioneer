// Availability rules used by availability.routes.js.
const { timeToMinutes } = require('./normalise');

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

// Hour slots ("8:00am", "9:00am" ...) that a session from start to end touches.
const sessionAvailabilitySlots = (startTime, endTime) => {
  const startMin = timeToMinutes(String(startTime));
  const endMin = timeToMinutes(String(endTime));
  const slots = [];
  for (let m = Math.floor(startMin / 60) * 60; m < endMin; m += 60) {
    slots.push(availabilityTimeToSlot(`${String(Math.floor(m / 60)).padStart(2, '0')}:00:00`));
  }
  return slots;
};

// Once a tutor ACCEPTS a session, that time is no longer free for any other
// unit. This marks those hours as "avoid" in the grid for other units and
// records why in `committed`, e.g. committed.MON[tutorId]["8:00am"] = "CAB201".
// It is worked out when the grid is read (nothing is written to the
// availability table), so it stays correct if the tutor later declines or
// is unassigned, and survives the tutor re-submitting their availability.
// committedRows: { tutor_id, day, start_time, end_time, unit_code } from
// session_tutors where tutor_confirmed = TRUE, in units other than this one.
const applyCommittedSessions = (grid, committedRows) => {
  const visible = new Set((grid.tutors || []).map(t => t.id));
  const committed = { MON: {}, TUE: {}, WED: {}, THU: {}, FRI: {} };
  for (const row of committedRows || []) {
    if (!visible.has(row.tutor_id)) continue;
    const day = AVAILABILITY_DAY_MAP[row.day];
    if (!day) continue;
    for (const slot of sessionAvailabilitySlots(row.start_time, row.end_time)) {
      if (!grid.availability[day][row.tutor_id]) grid.availability[day][row.tutor_id] = {};
      grid.availability[day][row.tutor_id][slot] = 'avoid';
      if (!committed[day][row.tutor_id]) committed[day][row.tutor_id] = {};
      committed[day][row.tutor_id][slot] = row.unit_code;
    }
  }
  return { ...grid, committed };
};

module.exports = {
  sessionAvailabilitySlots,
  applyCommittedSessions,
  AVAILABILITY_DAY_MAP,
  availabilityTimeToSlot,
  isAvailabilityLocked,
  parseAvailabilitySlot,
  buildAvailabilityGrid
};
