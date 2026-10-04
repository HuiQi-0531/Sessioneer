// Rules for editing a session, accepting a session, and showing covers on
// the timetable (sessionRules.js).
const r = require('../../utils/sessionRules');

describe('checkSessionEdit (PUT /units/:unitId/sessions/:sessionId)', () => {
  const current = { start_time: '09:00:00', end_time: '10:00:00', assigned_count: 2 };

  test('LG-495: nothing changed is fine', () => {
    expect(r.checkSessionEdit(current, {})).toBeNull();
  });
  test('LG-496: a new end time before the stored start is refused', () => {
    expect(r.checkSessionEdit(current, { endTime: '08:00' })).toEqual({ status: 400, error: 'End time must be after start time' });
  });
  test('LG-497: a new start after the stored end is refused', () => {
    expect(r.checkSessionEdit(current, { startTime: '11:00' }).status).toBe(400);
  });
  test('LG-498: moving both times together is fine', () => {
    expect(r.checkSessionEdit(current, { startTime: '13:00', endTime: '14:00' })).toBeNull();
  });
  test('LG-499: tutors required cannot drop below the tutors already assigned', () => {
    expect(r.checkSessionEdit(current, { requiredTutors: 1 }))
      .toEqual({ status: 409, error: 'Tutors required cannot be lower than the number already assigned' });
  });
  test('LG-500: tutors required equal to the assigned count is fine', () => {
    expect(r.checkSessionEdit(current, { requiredTutors: '2' })).toBeNull();
  });
  test('LG-501: capacity 0, negative or text is refused', () => {
    expect(r.checkSessionEdit(current, { capacity: 0 }).status).toBe(400);
    expect(r.checkSessionEdit(current, { capacity: -3 }).status).toBe(400);
    expect(r.checkSessionEdit(current, { capacity: 'lots' }).status).toBe(400);
  });
  test('LG-502: an unknown day is refused', () => {
    expect(r.checkSessionEdit(current, { day: 'Funday' }).status).toBe(400);
  });
  test('LG-503: empty optional fields are ignored', () => {
    expect(r.checkSessionEdit(current, { capacity: '', requiredTutors: null })).toBeNull();
  });
});

describe('findAcceptClash (PATCH .../confirm with confirmed: true)', () => {
  const session = { id: 'new', day: 'MON', start_time: '08:00:00', end_time: '10:00:00' };

  test('LG-504: overlapping an already-accepted session is refused', () => {
    expect(r.findAcceptClash(session, [
      { session_id: 'old', day: 'MON', start_time: '09:00:00', end_time: '11:00:00', unit_code: 'CAB201' }
    ])).toBe('You have already accepted an overlapping session in CAB201. Decline one of them first.');
  });
  test('LG-505: a session on another day is fine', () => {
    expect(r.findAcceptClash(session, [
      { session_id: 'old', day: 'TUE', start_time: '08:00:00', end_time: '10:00:00', unit_code: 'CAB201' }
    ])).toBeNull();
  });
  test('LG-506: a cover the tutor is doing at the same time is a clash', () => {
    expect(r.findAcceptClash(session, [
      { session_id: 'c', day: 'MON', start_time: '08:00:00', end_time: '09:00:00', unit_code: 'IFB102',
        start_date: '2026-10-05', end_date: '2026-10-09' }
    ])).toMatch(/IFB102/);
  });
  test('LG-507: the session being accepted is not compared with itself', () => {
    expect(r.findAcceptClash(session, [
      { session_id: 'new', day: 'MON', start_time: '08:00:00', end_time: '10:00:00', unit_code: 'CAB201' }
    ])).toBeNull();
  });
  test('LG-508: no other commitments means no clash', () => {
    expect(r.findAcceptClash(session, [])).toBeNull();
  });
});

describe('formatSessionRow: covers and tutors come from one place', () => {
  const base = {
    id: 's1', day: 'MON', start_time: '09:00:00', end_time: '10:00:00',
    tutors: [
      { tutorId: 't1', tutorName: 'Ann', confirmed: true },
      { tutorId: 't2', tutorName: 'Ben', confirmed: null }
    ]
  };
  test('LG-509: activeCovers is passed through for the timetable', () => {
    const covers = [{ coverRequestId: 'c1', claimedById: 't9', claimedByName: 'Cam', startDate: '2026-10-05', endDate: '2026-10-09' }];
    expect(r.formatSessionRow({ ...base, active_covers: covers }).activeCovers).toEqual(covers);
  });
  test('LG-510: no covers gives an empty list, not undefined', () => {
    expect(r.formatSessionRow(base).activeCovers).toEqual([]);
  });
  test('LG-511: assignedTutorId is derived from tutors[], never a separate column', () => {
    // A stray old column on the row must be ignored.
    const row = r.formatSessionRow({ ...base, assigned_tutor_id: 'stale-old-value' });
    expect(row.assignedTutorId).toBe('t1');
    expect(row.tutors.map(t => t.tutorId)).toEqual(['t1', 't2']);
  });
});

describe('endsAfterStart is exported for admin and coordinator edits', () => {
  test('LG-512: same time is not after', () => {
    expect(r.endsAfterStart('09:00', '09:00')).toBe(false);
  });
  test('LG-513: seconds are understood', () => {
    expect(r.endsAfterStart('09:00:00', '09:30:00')).toBe(true);
  });
});
