// Session rules used by sessions.routes.js and admin.routes.js.
const { normaliseDay, normaliseTime } = require('./normalise');
const { countWeekdayOccurrences, findCoverClash } = require('./coverRules');

// Same suggestion rule as the frontend (ScheduleBuilder.jsx): every 30
// students triggers one more suggested tutor. Used as a fallback whenever a
// caller doesn't explicitly set required_tutors, instead of silently
// defaulting to 1 regardless of capacity.
const STUDENTS_PER_TUTOR = 30;
const suggestedTutorCount = (capacity) => Math.floor((capacity || 0) / STUDENTS_PER_TUTOR) + 1;

// Session code prefix per type - e.g. Tutorial sessions get TUT01, TUT02...
const CODE_PREFIXES = {
  Tutorial: 'TUT',
  Consultation: 'CON',
  Practical: 'PRC',
  Lecture: 'LEC',
  Workshop: 'WOR'
};

const codePrefixForType = (sessionType) => {
  const key = String(sessionType || '').trim().toLowerCase();
  const match = Object.keys(CODE_PREFIXES).find(type => type.toLowerCase() === key);
  return match ? CODE_PREFIXES[match] : 'SES';
};

// Bug 5b: when a session's type changes (Tutorial -> Workshop), its code
// should follow (TUT03 -> WOR01). Only an automatic-looking code is
// replaced: blank, or the old type's prefix + number. A code the UC typed
// themselves in this edit (different from the stored one) is kept.
// requestedCode: what the edit form sent (undefined = not sent).
const shouldRegenerateCode = ({ currentType, newType, currentCode, requestedCode }) => {
  const norm = (v) => String(v || '').trim().toLowerCase();
  if (!newType || norm(newType) === norm(currentType)) return false;
  const stored = String(currentCode || '').trim().toUpperCase();
  const requested = requestedCode === undefined
    ? stored
    : String(requestedCode || '').trim().toUpperCase();
  if (!requested) return true;
  if (requested !== stored) return false; // the UC typed a new code: keep it
  const oldPrefix = codePrefixForType(currentType);
  return new RegExp(`^${oldPrefix}\\d+$`).test(stored);
};

// Given the codes already used in a unit, returns the next free one,
// e.g. TUT01..TUT03 exist -> TUT04. (Was the second half of generateNextSessionCode.)
const nextSessionCode = (prefix, existingCodes) => {
  let maxNum = 0;
  existingCodes.forEach(code => {
    const match = String(code || '').match(new RegExp(`^${prefix}(\\d+)$`));
    if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
  });
  const nextNum = maxNum + 1;
  return `${prefix}${String(nextNum).padStart(2, '0')}`;
};

const isBlank = (value) => value === undefined || value === null || String(value).trim() === '';

const getMissingSessionFields = (session) => {
  const requiredFields = [
    ['day', 'Day'],
    ['startTime', 'Start time'],
    ['endTime', 'End time'],
    ['location', 'Location'],
    ['campus', 'Campus'],
    ['sessionType', 'Type'],
    ['capacity', 'Capacity'],
    ['requiredTutors', 'Tutor'],
    ['status', 'Status']
  ];

  return requiredFields
    .filter(([field]) => isBlank(session[field]))
    .map(([, label]) => label);
};

// Admin version (admin.routes.js) also requires the unit.
const getMissingAdminSessionFields = (session) => {
  const requiredFields = [
    ['unitId', 'Unit'],
    ['day', 'Day'],
    ['startTime', 'Start time'],
    ['endTime', 'End time'],
    ['location', 'Location'],
    ['campus', 'Campus'],
    ['sessionType', 'Type'],
    ['capacity', 'Capacity'],
    ['requiredTutors', 'Tutor'],
    ['status', 'Status']
  ];

  return requiredFields
    .filter(([field]) => isBlank(session[field]))
    .map(([, label]) => label);
};

// End time must be later than start time.
const toMinutesOfDay = (time) => {
  const [h, m] = String(time || '').split(':').map(Number);
  return h * 60 + (m || 0);
};
const endsAfterStart = (start, end) => {
  const s = toMinutesOfDay(start);
  const e = toMinutesOfDay(end);
  if (Number.isNaN(s) || Number.isNaN(e)) return true; // unreadable times are rejected elsewhere
  return e > s;
};

// A count from a CSV must be blank or a whole number.
const isValidCount = (value) => value === undefined || value === null
  || String(value).trim() === '' || /^\d+$/.test(String(value).trim());


// Checks for creating one session (was inline in POST /units/:unitId/sessions).
const validateSessionInput = (input) => {
  const missingFields = getMissingSessionFields(input);
  if (missingFields.length > 0) {
    return { error: `Please fill in all fields before saving: ${missingFields.join(', ')}` };
  }

  const capacityNumber = parseInt(input.capacity, 10);
  const requiredTutorsNumber = parseInt(input.requiredTutors, 10);

  if (Number.isNaN(capacityNumber) || capacityNumber < 1) {
    return { error: 'Capacity must be at least 1' };
  }

  if (Number.isNaN(requiredTutorsNumber) || requiredTutorsNumber < 1) {
    return { error: 'Tutor must be at least 1' };
  }

  if (!endsAfterStart(input.startTime, input.endTime)) {
    return { error: 'End time must be after start time' };
  }

  return { error: null, capacityNumber, requiredTutorsNumber };
};

const formatSessionRow = (s) => {
  const allTutors = s.tutors || [];
  // A declined tutor (confirmed === false) doesn't count as filling the
  // slot — the session should reappear as needing reassignment. Pending
  // (confirmed === null) and confirmed (confirmed === true) tutors do.
  const activeTutors = allTutors.filter(t => t.confirmed !== false);
  const declinedTutors = allTutors.filter(t => t.confirmed === false);

  return {
    id: s.id,
    sessionCode: s.session_code || null,
    day: s.day,
    startTime: s.start_time,
    endTime: s.end_time,
    location: s.location,
    campus: s.campus,
    sessionType: s.session_type,
    capacity: s.capacity,
    requiredTutors: s.required_tutors,
    status: s.status,
    staffNote: s.staff_note,
    tutors: activeTutors,
    declinedTutors,
    isAssigned: activeTutors.length > 0,
    // Claimed cover requests whose cover period has not ended yet. A cover
    // is temporary, so it is shown here instead of changing tutors[].
    activeCovers: s.active_covers || [],
    // Convenience fields for screens that only show one tutor. They are
    // derived from tutors[] (session_tutors), never from a separate column.
    assignedTutorId: activeTutors[0]?.tutorId || null,
    assignedTutorName: activeTutors[0]?.tutorName || null,
    tutorConfirmed: activeTutors[0]?.confirmed ?? null,
    tutorRejectReason: activeTutors[0]?.rejectReason || null,
    unitCode: s.unit_code || null
  };
};

// Bug 5a: what a TUTOR may see of a unit's timetable. Time, place, code,
// type and three facts: is it mine, is it taken, has it space. No other
// tutor's name, confirmation status or decline reason. tutors[] keeps only
// ids (the Messages profile uses them to list a contact's classes).
const toTutorTimetableRow = (row, viewerId) => {
  const activeIds = (row.tutors || []).map(t => t.tutorId);
  const isMine = Boolean(row.isCovering) || activeIds.includes(viewerId);
  const required = Number(row.requiredTutors || 1);
  return {
    id: row.id,
    sessionCode: row.sessionCode,
    day: row.day,
    startTime: row.startTime,
    endTime: row.endTime,
    location: row.location,
    campus: row.campus,
    sessionType: row.sessionType,
    requiredTutors: row.requiredTutors,
    status: row.status,
    unitCode: row.unitCode,
    isMine,
    isFilled: activeIds.length >= required,
    tutors: activeIds.map(tutorId => ({ tutorId })),
    ...(row.isCovering ? {
      isCovering: true,
      coverStartDate: row.coverStartDate,
      coverEndDate: row.coverEndDate,
      coverOccurrenceCount: row.coverOccurrenceCount
    } : {})
  };
};

const formatCoveringSessionRow = (s) => ({
  ...formatSessionRow(s),
  isCovering: true,
  coverStartDate: s.cover_start_date,
  coverEndDate: s.cover_end_date,
  coverOccurrenceCount: countWeekdayOccurrences(s.day, s.cover_start_date, s.cover_end_date)
});

// One CSV row before it is saved (was inline in POST /import).
// Returns { skipReason } when the row cannot be read, otherwise the values to save.
// sessionCode is null when the row has none, so the route generates the next code.
const prepareImportRow = (row) => {
  const normalisedDay = normaliseDay(row.day);
  const normalisedStart = normaliseTime(row.startTime);
  const normalisedEnd = normaliseTime(row.endTime);

  if (!normalisedDay || !normalisedStart || !normalisedEnd) {
    return { skipReason: 'Could not read day or time' };
  }

  if (!endsAfterStart(normalisedStart, normalisedEnd)) {
    return { skipReason: 'End time must be after start time' };
  }

  if (!isValidCount(row.capacity) || !isValidCount(row.requiredTutors)) {
    return { skipReason: 'Capacity and tutor count must be whole numbers' };
  }

  return {
    skipReason: null,
    sessionCode: row.sessionCode ? String(row.sessionCode).trim().toUpperCase() : null,
    values: {
      day: normalisedDay,
      startTime: normalisedStart,
      endTime: normalisedEnd,
      location: row.location || null,
      campus: row.campus || null,
      sessionType: row.sessionType || null,
      capacity: row.capacity || null,
      requiredTutors: row.requiredTutors || suggestedTutorCount(row.capacity),
      status: row.status || 'Confirmed',
      staffNote: row.staffNote || null
    }
  };
};

// Tutor accepting or declining an assigned session (was inline in PATCH /:sessionId/confirm).
const buildConfirmationUpdate = (confirmed, reason) => {
  if (typeof confirmed !== 'boolean') {
    return { error: 'Please choose to accept or decline the session' };
  }
  if (confirmed === false && (!reason || !reason.trim())) {
    return { error: 'Please provide a reason for declining' };
  }
  return { error: null, confirmed, rejectReason: confirmed ? null : reason.trim() };
};

// Whether this session still has room for this tutor (was inline in PATCH /:sessionId/assign).
// Returns the error message, or null when the tutor can be added.
const checkAssignSlot = (existingRows, tutorId, sessionRequiredTutors) => {
  const activeExistingTutors = existingRows.filter(r => r.tutor_confirmed !== false);

  if (activeExistingTutors.some(r => r.tutor_id === tutorId)) {
    return 'This tutor is already assigned to this session';
  }
  const requiredTutors = sessionRequiredTutors || 1;
  if (activeExistingTutors.length >= requiredTutors) {
    return `This session already has its required ${requiredTutors} tutor(s) assigned`;
  }
  return null;
};

// Editing an existing session (PUT /units/:unitId/sessions/:sessionId).
// `current` is the stored row plus assigned_count (active tutors); `changes`
// holds only the fields sent. Returns { status, error } or null.
const checkSessionEdit = (current, changes) => {
  const start = changes.startTime || current.start_time;
  const end = changes.endTime || current.end_time;
  if (!endsAfterStart(start, end)) {
    return { status: 400, error: 'End time must be after start time' };
  }
  if (changes.capacity !== undefined && changes.capacity !== null && changes.capacity !== '') {
    const capacity = Number(changes.capacity);
    if (!Number.isInteger(capacity) || capacity < 1) return { status: 400, error: 'Capacity must be at least 1' };
  }
  if (changes.requiredTutors !== undefined && changes.requiredTutors !== null && changes.requiredTutors !== '') {
    const required = Number(changes.requiredTutors);
    if (!Number.isInteger(required) || required < 1) return { status: 400, error: 'Tutor must be at least 1' };
    if (required < Number(current.assigned_count || 0)) {
      return { status: 409, error: 'Tutors required cannot be lower than the number already assigned' };
    }
  }
  if (changes.day && !['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].includes(changes.day)) {
    return { status: 400, error: 'Day must be a weekday such as MON' };
  }
  return null;
};

// Accepting a session: returns an error message when it overlaps another
// session the tutor has already accepted (or a cover they are doing),
// otherwise null. `commitments` rows have session_id, day, start_time,
// end_time, unit_code and optional start_date/end_date (covers).
const findAcceptClash = (session, commitments) => {
  const target = { session_id: session.id, day: session.day, start_time: session.start_time, end_time: session.end_time };
  const other = (commitments || []).find(c => Boolean(findCoverClash(target, [c])));
  if (!other) return null;
  return `You have already accepted an overlapping session in ${other.unit_code}. Decline one of them first.`;
};

module.exports = {
  STUDENTS_PER_TUTOR,
  findAcceptClash,
  checkSessionEdit,
  suggestedTutorCount,
  codePrefixForType,
  nextSessionCode,
  shouldRegenerateCode,
  isBlank,
  endsAfterStart,
  getMissingSessionFields,
  getMissingAdminSessionFields,
  validateSessionInput,
  formatSessionRow,
  formatCoveringSessionRow,
  toTutorTimetableRow,
  prepareImportRow,
  buildConfirmationUpdate,
  checkAssignSlot
};