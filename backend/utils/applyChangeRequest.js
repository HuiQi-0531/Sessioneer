const { timeRangesOverlap, sessionDurationHours } = require('./normalise');
const { requiresSuperTutor } = require('./roles');
const { sameTermUnitIdsSql } = require('./termRules');

class AllocationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

// Seconds are dropped ("11:00:00" -> "11:00") so a label built from raw
// database times still matches the timetable.
const comparable = (value) => String(value || '')
  .replace(/\b(\d{1,2}:\d{2}):\d{2}\b/g, '$1')
  .replace(/\s*[-–]\s*/g, '-')
  .replace(/\s*\|\s*/g, '|')
  .replace(/\s+/g, ' ')
  .trim()
  .toUpperCase();

const sessionComparable = (session) => {
  const start = session.start_time ? String(session.start_time).slice(0, 5) : 'TBC';
  const end = session.end_time ? String(session.end_time).slice(0, 5) : 'TBC';
  const room = session.location || 'TBA';
  return comparable(`${session.day || 'TBC'} ${start}-${end}|${room}`);
};

const sessionLoose = (session) => {
  const start = session.start_time ? String(session.start_time).slice(0, 5) : 'TBC';
  const end = session.end_time ? String(session.end_time).slice(0, 5) : 'TBC';
  const room = session.location || 'TBA';
  return comparable(`${session.day || 'TBC'} ${start} - ${end} ${room}`);
};

const labelFromStored = (value) => {
  if (!value) return '';
  const parts = String(value).split('::');
  return parts.length >= 2 ? parts[parts.length - 1] : String(value);
};

const resolveSessionId = async (client, unitId, storedId, storedValue) => {
  if (storedId) return storedId;
  if (!storedValue || !unitId) return null;

  const result = await client.query(
    'SELECT id, day, start_time, end_time, location, session_type FROM sessions WHERE unit_id = $1',
    [unitId]
  );
  const target = comparable(labelFromStored(storedValue));
  const match = result.rows.find((session) =>
    sessionComparable(session) === target || sessionLoose(session) === target ||
    (session.session_type && comparable(`${session.session_type} - ${sessionComparable(session)}`) === target)
  );
  return match?.id || null;
};

const unassignTutor = async (client, sessionId, tutorId) => {
  await client.query(
    'DELETE FROM session_tutors WHERE session_id = $1 AND tutor_id = $2',
    [sessionId, tutorId]
  );
};

// confirmed: true when the tutor already agreed to this session (they asked
// for it, or accepted the coordinator's suggestion), so they are not asked to
// confirm it a second time. null leaves it "Awaiting response".
const assignTutor = async (client, sessionId, tutorId, confirmed = null) => {
  await client.query(
    `
    INSERT INTO session_tutors (session_id, tutor_id, tutor_confirmed, tutor_reject_reason)
    VALUES ($1, $2, $3, NULL)
    ON CONFLICT (session_id, tutor_id)
    DO UPDATE SET tutor_confirmed = $3, tutor_reject_reason = NULL
    `,
    [sessionId, tutorId, confirmed]
  );
};

const getActiveTutorIds = async (client, sessionId) => {
  const result = await client.query(
    `
    SELECT tutor_id
    FROM session_tutors
    WHERE session_id = $1 AND tutor_confirmed IS DISTINCT FROM false
    `,
    [sessionId]
  );
  return result.rows.map((row) => row.tutor_id);
};

const loadSession = async (client, sessionId, unitId) => {
  const result = await client.query(
    'SELECT * FROM sessions WHERE id = $1 AND unit_id = $2',
    [sessionId, unitId]
  );
  if (result.rows.length === 0) {
    throw new AllocationError('Session not found in this unit', 404);
  }
  return result.rows[0];
};

const assertSameSessionType = async (client, unitId, currentSessionId, targetSessionId) => {
  const current = await loadSession(client, currentSessionId, unitId);
  const target = await loadSession(client, targetSessionId, unitId);
  const currentType = String(current.session_type || '').trim().toLowerCase();
  const targetType = String(target.session_type || '').trim().toLowerCase();
  if (!currentType || currentType !== targetType) {
    throw new AllocationError('Changes and swaps must use the same session type', 409);
  }
  return target;
};

const assertNoOverlap = async (client, tutorId, session, ignoreSessionId) => {
  const result = await client.query(
    `
    SELECT s.day, s.start_time, s.end_time, un.unit_code
    FROM sessions s
    JOIN session_tutors st ON st.session_id = s.id
    JOIN units un ON un.id = s.unit_id
    WHERE st.tutor_id = $1
      AND st.tutor_confirmed IS DISTINCT FROM false
      AND s.id <> $2
      AND ($3::uuid IS NULL OR s.id <> $3)
      AND s.unit_id IN ${sameTermUnitIdsSql('$4')}
    `,
    [tutorId, session.id, ignoreSessionId || null, session.unit_id]
  );
  const conflict = result.rows.find((other) =>
    other.day === session.day &&
    timeRangesOverlap(session.start_time, session.end_time, other.start_time, other.end_time)
  );
  if (conflict) {
    throw new AllocationError(
      `This tutor is already assigned to an overlapping session in ${conflict.unit_code}`,
      409
    );
  }
};

const assertHoursAndRole = async (client, tutorId, session, unitId, ignoreSessionId) => {
  const tutorResult = await client.query(
    `
    SELECT u.maximum_hours,
           COALESCE(bool_or(um.role = 'super_tutor'), false) AS is_super_tutor
    FROM users u
    LEFT JOIN unit_memberships um ON um.user_id = u.id AND um.unit_id = $2
    WHERE u.id = $1
    GROUP BY u.id, u.maximum_hours
    `,
    [tutorId, unitId]
  );
  const tutor = tutorResult.rows[0];
  if (!tutor) throw new AllocationError('Tutor not found', 404);

  if (requiresSuperTutor(session.session_type) && !tutor.is_super_tutor) {
    throw new AllocationError(`Only Super Tutors can be assigned to ${session.session_type} sessions`, 409);
  }

  const otherResult = await client.query(
    `
    SELECT s.start_time, s.end_time
    FROM sessions s
    JOIN session_tutors st ON st.session_id = s.id
    WHERE st.tutor_id = $1
      AND st.tutor_confirmed IS DISTINCT FROM false
      AND s.id <> $2
      AND ($3::uuid IS NULL OR s.id <> $3)
      AND s.unit_id IN ${sameTermUnitIdsSql('$4')}
    `,
    [tutorId, session.id, ignoreSessionId || null, unitId]
  );
  const existingHours = otherResult.rows.reduce(
    (sum, other) => sum + sessionDurationHours(other.start_time, other.end_time),
    0
  );
  const hoursIfAssigned = existingHours + sessionDurationHours(session.start_time, session.end_time);
  if (tutor.maximum_hours != null && hoursIfAssigned > tutor.maximum_hours) {
    throw new AllocationError(
      `Assigning this tutor would exceed their max hours (${hoursIfAssigned}/${tutor.maximum_hours} hrs)`,
      409
    );
  }
};

const applyApprovedChangeRequest = async (client, request) => {
  const tutorId = request.tutor_id;
  const unitId = request.unit_id;
  if (!tutorId || !unitId) {
    throw new AllocationError('This request is missing tutor or unit information');
  }

  const lockResult = await client.query(
    'SELECT schedule_locked FROM units WHERE id = $1',
    [unitId]
  );
  if (lockResult.rows[0]?.schedule_locked) {
    throw new AllocationError(
      'This schedule has been finalised and locked. Unlock it first to apply the swap.',
      409
    );
  }

  const type = String(request.request_type || '').toLowerCase();
  const isChange = type.includes('change') && !type.includes('swap');

  const currentSessionId = await resolveSessionId(
    client, unitId, request.current_session_id, request.current_session
  );
  // Which session the tutor moves to:
  //  - Suggested request (tutor accepting the coordinator's suggestion):
  //    ONLY the suggested session. It must never fall back to the tutor's own
  //    preferred session, which used to move them somewhere the UC did not pick.
  //  - Otherwise (UC/Admin approving the request as submitted): the tutor's
  //    preferred session. Old suggestion text left in review_notes is ignored.
  const isAcceptingSuggestion = String(request.status || '').toLowerCase() === 'suggested';
  const targetSessionId = isAcceptingSuggestion
    ? await resolveSessionId(client, unitId, request.suggested_session_id, request.review_notes)
    : await resolveSessionId(client, unitId, request.preferred_session_id, request.preferred_swap_to);

  if (!currentSessionId) {
    throw new AllocationError("Could not match the tutor's current session on the timetable");
  }

  const currentTutors = await getActiveTutorIds(client, currentSessionId);
  if (!currentTutors.includes(tutorId)) {
    throw new AllocationError('This tutor is no longer assigned to the current session', 409);
  }

  // Session change: drop this tutor from the current session only.
  if (isChange) {
    await unassignTutor(client, currentSessionId, tutorId);
    return { action: 'unassigned', fromSessionId: currentSessionId };
  }

  if (!targetSessionId) {
    throw new AllocationError(isAcceptingSuggestion
      ? 'The suggested session could not be found on the timetable. Ask the unit coordinator to suggest it again.'
      : 'This swap has no target session. The tutor must choose a preferred session, or use Suggest first.'
    );
  }

  if (targetSessionId === currentSessionId) {
    return { action: 'unchanged', fromSessionId: currentSessionId };
  }

  const targetSession = await assertSameSessionType(client, unitId, currentSessionId, targetSessionId);
  const targetTutors = await getActiveTutorIds(client, targetSessionId);
  const requiredTutors = Number(targetSession.required_tutors || 1);

  // Already on Friday: still remove the original session from this tutor.
  if (targetTutors.includes(tutorId)) {
    await unassignTutor(client, currentSessionId, tutorId);
    return { action: 'already_on_target', fromSessionId: currentSessionId, toSessionId: targetSessionId };
  }

  // Target already full (e.g. another tutor is there and required_tutors is 1).
  // Do NOT force-swap the other tutor onto this tutor's old session.
  if (targetTutors.length >= requiredTutors) {
    throw new AllocationError(
      'This session already has a tutor and is full. Suggest an unassigned session, or free a space first.',
      409
    );
  }

  await assertNoOverlap(client, tutorId, targetSession, currentSessionId);
  await assertHoursAndRole(client, tutorId, targetSession, unitId, currentSessionId);

  // Remove this tutor from the original session, then add them to the target.
  await unassignTutor(client, currentSessionId, tutorId);
  // The tutor asked for this session or accepted it, so it is already confirmed.
  await assignTutor(client, targetSessionId, tutorId, true);
  await client.query(
    `
    INSERT INTO unit_memberships (unit_id, user_id, role)
    VALUES ($1, $2, 'tutor')
    ON CONFLICT (unit_id, user_id, role) DO NOTHING
    `,
    [unitId, tutorId]
  );

  return { action: 'moved', fromSessionId: currentSessionId, toSessionId: targetSessionId };
};

// Resolves the session a coordinator/admin is suggesting. Prefers the id the
// page sends; falls back to reading the label. Throws if it cannot be found,
// is not in this unit, or is a different session type from the current one.
const resolveSuggestedSession = async (client, request, { suggestedSessionId, reviewNotes }) => {
  const targetId = suggestedSessionId
    || await resolveSessionId(client, request.unit_id, null, reviewNotes);
  if (!targetId) {
    throw new AllocationError('Could not find the suggested session on the timetable. Please pick it again.');
  }
  const currentId = await resolveSessionId(
    client, request.unit_id, request.current_session_id, request.current_session
  );
  if (!currentId) {
    throw new AllocationError("Could not match the tutor's current session on the timetable");
  }
  if (targetId === currentId) {
    throw new AllocationError('The suggested session is the tutor\'s current session');
  }
  await assertSameSessionType(client, request.unit_id, currentId, targetId);
  return targetId;
};

module.exports = {
  AllocationError,
  resolveSuggestedSession,
  assertSameSessionType,
  applyApprovedChangeRequest,
  resolveSessionId,
  comparable,
  sessionComparable,
  sessionLoose,
  labelFromStored
};