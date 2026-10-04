// Cover claim rules added when the cover feature stopped writing to the old
// sessions.assigned_tutor_id column ("paper calendar") and started running
// the same clash checks as a normal assignment.
const c = require('../../utils/coverRules');

const cover = (extra = {}) => ({
  session_id: 'cover-session',
  day: 'MON',
  start_time: '09:00:00',
  end_time: '10:00:00',
  start_date: '2026-10-05',
  end_date: '2026-10-16',
  original_tutor_id: 'away',
  session_type: 'Tutorial',
  is_super_tutor: false,
  status: 'open',
  ...extra
});

describe('resolveOriginalTutors (who is away, read from session_tutors)', () => {
  const one = { id: 's1', active_tutor_ids: ['t1'] };
  const two = { id: 's2', active_tutor_ids: ['t1', 't2'] };
  const none = { id: 's3', active_tutor_ids: [] };

  test('LG-469: a single-tutor session uses that tutor', () => {
    expect(c.resolveOriginalTutors([one])).toEqual({ bySession: { s1: 't1' }, awayTutorIds: ['t1'] });
  });
  test('LG-470: a session with no tutor has no original tutor', () => {
    expect(c.resolveOriginalTutors([none])).toEqual({ bySession: { s3: null }, awayTutorIds: [] });
  });
  test('LG-471: a two-tutor session needs the UC to say who is away', () => {
    expect(c.resolveOriginalTutors([two]).error).toMatch(/more than one tutor/);
  });
  test('LG-472: naming the away tutor works for a two-tutor session', () => {
    expect(c.resolveOriginalTutors([two], 't2')).toEqual({ bySession: { s2: 't2' }, awayTutorIds: ['t2'] });
  });
  test('LG-473: the named tutor must hold every selected session', () => {
    expect(c.resolveOriginalTutors([one, two], 't2').error).toMatch(/not assigned to every selected session/);
  });
  test('LG-474: several sessions of the same tutor give one away tutor', () => {
    const other = { id: 's4', active_tutor_ids: ['t1'] };
    expect(c.resolveOriginalTutors([one, other]).awayTutorIds).toEqual(['t1']);
  });
});

describe('dateRangesOverlap', () => {
  test('LG-475: touching on one day overlaps', () => {
    expect(c.dateRangesOverlap('2026-10-01', '2026-10-05', '2026-10-05', '2026-10-09')).toBe(true);
  });
  test('LG-476: separate weeks do not overlap', () => {
    expect(c.dateRangesOverlap('2026-10-01', '2026-10-04', '2026-10-05', '2026-10-09')).toBe(false);
  });
  test('LG-477: a missing range means "every week" and always overlaps', () => {
    expect(c.dateRangesOverlap(null, null, '2026-10-05', '2026-10-09')).toBe(true);
  });
  test('LG-478: pg Date objects are compared by calendar day', () => {
    expect(c.dateRangesOverlap(new Date(2026, 9, 1), new Date(2026, 9, 4), '2026-10-04', '2026-10-04')).toBe(true);
  });
});

describe('toDateKey', () => {
  test('LG-479: a local-midnight Date keeps its calendar day', () => {
    expect(c.toDateKey(new Date(2026, 9, 4))).toBe('2026-10-04');
  });
  test('LG-480: an ISO string is cut to the day', () => {
    expect(c.toDateKey('2026-10-04T13:00:00Z')).toBe('2026-10-04');
  });
});

describe('findCoverClash (cover vs what the tutor already does)', () => {
  test('LG-481: overlapping weekly assignment blocks the claim (409)', () => {
    const clash = c.findCoverClash(cover(), [
      { session_id: 'mine', day: 'MON', start_time: '09:30:00', end_time: '10:30:00', unit_code: 'CAB201' }
    ]);
    expect(clash).toEqual({ status: 409, error: 'You already have an overlapping session in CAB201 at that time.' });
  });
  test('LG-482: a different day is fine', () => {
    expect(c.findCoverClash(cover(), [
      { session_id: 'mine', day: 'TUE', start_time: '09:00:00', end_time: '10:00:00', unit_code: 'CAB201' }
    ])).toBeNull();
  });
  test('LG-483: back-to-back times are fine (10:00 end, 10:00 start)', () => {
    expect(c.findCoverClash(cover(), [
      { session_id: 'mine', day: 'MON', start_time: '10:00:00', end_time: '11:00:00', unit_code: 'CAB201' }
    ])).toBeNull();
  });
  test('LG-484: another cover at the same time in a different fortnight is fine', () => {
    expect(c.findCoverClash(cover(), [
      { session_id: 'x', day: 'MON', start_time: '09:00:00', end_time: '10:00:00', unit_code: 'IFB102',
        start_date: '2026-11-02', end_date: '2026-11-06' }
    ])).toBeNull();
  });
  test('LG-485: another cover at the same time in the same week clashes', () => {
    expect(c.findCoverClash(cover(), [
      { session_id: 'x', day: 'MON', start_time: '09:00:00', end_time: '10:00:00', unit_code: 'IFB102',
        start_date: '2026-10-12', end_date: '2026-10-12' }
    ])).not.toBeNull();
  });
  test('LG-486: the cover session itself is ignored', () => {
    expect(c.findCoverClash(cover(), [
      { session_id: 'cover-session', day: 'MON', start_time: '09:00:00', end_time: '10:00:00', unit_code: 'CAB201' }
    ])).toBeNull();
  });
  test('LG-487: nothing booked means no clash', () => {
    expect(c.findCoverClash(cover(), [])).toBeNull();
    expect(c.findCoverClash(cover(), undefined)).toBeNull();
  });
});

describe('checkCoverClaim (extra rules)', () => {
  const today = new Date(2026, 9, 4);
  test('LG-488: a tutor who already teaches the session cannot cover it', () => {
    expect(c.checkCoverClaim(cover({ already_teaches_session: true }), 'me', today))
      .toEqual({ status: 400, error: 'You already teach this session, so you cannot cover it.' });
  });
  test('LG-489: a claimed request cannot be claimed again', () => {
    expect(c.checkCoverClaim(cover({ status: 'claimed' }), 'me', today).status).toBe(409);
  });
  test('LG-490: a cancelled request cannot be claimed', () => {
    expect(c.checkCoverClaim(cover({ status: 'cancelled' }), 'me', today).status).toBe(409);
  });
  test('LG-491: a cover period that already ended cannot be claimed', () => {
    expect(c.checkCoverClaim(cover({ end_date: '2026-10-03' }), 'me', today))
      .toEqual({ status: 409, error: 'This cover period has already ended.' });
  });
  test('LG-492: a cover ending today can still be claimed', () => {
    expect(c.checkCoverClaim(cover({ end_date: '2026-10-04' }), 'me', today)).toBeNull();
  });
  test('LG-493: a Consultation needs a Super Tutor, and a Super Tutor may claim it', () => {
    expect(c.checkCoverClaim(cover({ session_type: 'Consultation' }), 'me', today).status).toBe(403);
    expect(c.checkCoverClaim(cover({ session_type: 'Consultation', is_super_tutor: true }), 'me', today)).toBeNull();
  });
  test('LG-494: own-session check still wins first', () => {
    expect(c.checkCoverClaim(cover({ original_tutor_id: 'me', already_teaches_session: true }), 'me', today).status).toBe(400);
  });
});
