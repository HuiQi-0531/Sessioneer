const { timeRangesOverlap, sessionDurationHours } = require('./normalise');
const { requiresSuperTutor } = require('./roles');

class AllocationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const comparable = (value) => String(value || '')
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
    'SELECT id, day, start_time, end_time, location FROM sessions WHERE unit_id = $1',
    [unitId]
  );
  const target = comparable(labelFromStored(storedValue));
  const match = result.rows.find((session) =>
    sessionComparable(session) === target || sessionLoose(session) === target
  );
  return match?.id || null;
};

const syncAssignedTutorId = async (client, sessionId) => {
  const result = await client.query(
    `
    SELECT tutor_id
    FROM session_tutors
    WHERE session_id = $1 AND tutor_confirmed IS DISTINCT FROM false
    ORDER BY assigned_at ASC NULLS LAST
    LIMIT 1
    `,
    [sessionId]
  );
  const tutorId = result.rows[0]?.tutor_id || null;
  await client.query(
    'UPDATE sessions SET assigned_tutor_id = $1, is_assigned = $2 WHERE id = $3',
    [tutorId, Boolean(tutorId), sessionId]
  );
};

const unassignTutor = async (client, sessionId, tutorId) => {
  await client.query(
    'DELETE FROM session_tutors WHERE session_id = $1 AND tutor_id = $2',
    [sessionId, tutorId]
  );
};

const assignTutor = async (client, sessionId, tutorId) => {
  await client.query(
    `
    INSERT INTO session_tutors (session_id, tutor_id, tutor_confirmed, tutor_reject_reason)
    VALUES ($1, $2, NULL, NULL)
    ON CONFLICT (session_id, tutor_id)
    DO UPDATE SET tutor_confirmed = NULL, tutor_reject_reason = NULL
    `,
    [sessionId, tutorId]
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
    `,
    [tutorId, session.id, ignoreSessionId || null]
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
    `,
    [tutorId, session.id, ignoreSessionId || null]
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
  const targetSessionId = await resolveSessionId(
    client, unitId, request.suggested_session_id, request.review_notes
  ) || await resolveSessionId(
    client, unitId, request.preferred_session_id, request.preferred_swap_to
  );

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
    await syncAssignedTutorId(client, currentSessionId);
    return { action: 'unassigned', fromSessionId: currentSessionId };
  }

  if (!targetSessionId) {
    throw new AllocationError(
      'This swap has no target session. The tutor must choose a preferred session, or use Suggest first.'
    );
  }

  if (targetSessionId === currentSessionId) {
    return { action: 'unchanged', fromSessionId: currentSessionId };
  }

  const targetSession = await loadSession(client, targetSessionId, unitId);
  const targetTutors = await getActiveTutorIds(client, targetSessionId);
  const requiredTutors = Number(targetSession.required_tutors || 1);

  // Already on Friday: still remove the original session from this tutor.
  if (targetTutors.includes(tutorId)) {
    await unassignTutor(client, currentSessionId, tutorId);
    await syncAssignedTutorId(client, currentSessionId);
    await syncAssignedTutorId(client, targetSessionId);
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
  await assignTutor(client, targetSessionId, tutorId);
  await client.query(
    `
    INSERT INTO unit_memberships (unit_id, user_id, role)
    VALUES ($1, $2, 'tutor')
    ON CONFLICT (unit_id, user_id, role) DO NOTHING
    `,
    [unitId, tutorId]
  );
  await syncAssignedTutorId(client, currentSessionId);
  await syncAssignedTutorId(client, targetSessionId);

  return { action: 'moved', fromSessionId: currentSessionId, toSessionId: targetSessionId };
};

module.exports = {
  AllocationError,
  applyApprovedChangeRequest,
  resolveSessionId
};