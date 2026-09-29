const { scoreCandidate, sortCandidates } = require('../../utils/candidateScoring');
const { getHourlySlotsInRange, sessionDurationHours } = require('../../utils/normalise');

const session = { id: 's1', day: 'MON', start_time: '10:00:00', end_time: '12:00:00', session_type: 'Tutorial' };
const context = (overrides = {}) => ({
  session,
  coveredSlots: getHourlySlotsInRange(session.start_time, session.end_time),
  thisDuration: sessionDurationHours(session.start_time, session.end_time),
  availRows: [],
  otherSessions: [],
  sessionNeedsSuperTutor: false,
  currentTutorIds: new Set(),
  ...overrides
});
const tutor = (overrides = {}) => ({ id: 't1', name: 'Amy', membership_role: 'tutor', maximum_hours: null, priority_tag: null, ...overrides });
const avail = (preference, tutorId = 't1') => [
  { tutor_id: tutorId, day: 'MON', start_time: '10:00:00', preference },
  { tutor_id: tutorId, day: 'MON', start_time: '11:00:00', preference }
];

describe('scoreCandidate', () => {
  test('LG-211: preferred for the whole session scores +2 per hour and is allPreferred', () => {
    const c = scoreCandidate(tutor(), context({ availRows: avail('preferred') }));
    expect(c.score).toBe(4);
    expect(c.allPreferred).toBe(true);
    expect(c.hardBlocked).toBe(false);
  });
  test('LG-212: "avoid" gives a warning and −2 per hour', () => {
    const c = scoreCandidate(tutor(), context({ availRows: avail('avoid') }));
    expect(c.score).toBe(-4);
    expect(c.warnings).toContain('Marked "avoid" for this time');
  });
  test('LG-213: tutor with no availability gets a warning', () => {
    expect(scoreCandidate(tutor(), context()).warnings).toContain('No availability submitted');
  });
  test('LG-214: coordinator does not need availability', () => {
    const c = scoreCandidate(tutor({ membership_role: 'coordinator' }), context());
    expect(c.warnings).not.toContain('No availability submitted');
    expect(c.roleLabel).toBe('Unit Coordinator');
  });
  test('LG-215: coordinator is not blocked from Lecture sessions', () => {
    const c = scoreCandidate(tutor({ membership_role: 'coordinator' }), context({ sessionNeedsSuperTutor: true }));
    expect(c.hardBlocked).toBe(false);
  });
  test('LG-216: clash with a confirmed session blocks and names the unit', () => {
    const other = { tutor_id: 't1', day: 'MON', start_time: '11:00:00', end_time: '13:00:00', tutor_confirmed: true, unit_code: 'CAB201' };
    const c = scoreCandidate(tutor(), context({ otherSessions: [other] }));
    expect(c.hardBlocked).toBe(true);
    expect(c.warnings).toContain('Already confirmed on an overlapping session in CAB201');
  });
  test('LG-217: clash with a pending session is marked tentative', () => {
    const other = { tutor_id: 't1', day: 'MON', start_time: '11:00:00', end_time: '13:00:00', tutor_confirmed: null, unit_code: 'IFB104' };
    const c = scoreCandidate(tutor(), context({ otherSessions: [other] }));
    expect(c.tentativeConflict).toBe(true);
    expect(c.warnings.some(w => w.startsWith('Tentatively assigned to an overlapping session in IFB104'))).toBe(true);
  });
  test('LG-218: going over max hours blocks the tutor', () => {
    const other = { tutor_id: 't1', day: 'TUE', start_time: '09:00:00', end_time: '12:00:00', tutor_confirmed: true };
    const c = scoreCandidate(tutor({ maximum_hours: 4 }), context({ otherSessions: [other] }));
    expect(c.hardBlocked).toBe(true);
    expect(c.warnings).toContain('Would exceed max hours (5/4 hrs)');
  });
  test('LG-219: normal tutor is blocked from a Super Tutor–only session', () => {
    const c = scoreCandidate(tutor(), context({ sessionNeedsSuperTutor: true, session: { ...session, session_type: 'Lecture' } }));
    expect(c.hardBlocked).toBe(true);
    expect(c.warnings).toContain('Only Super Tutors can be assigned to Lecture sessions');
  });
  test('LG-220: Preferred priority adds +2', () => {
    expect(scoreCandidate(tutor({ priority_tag: 'Preferred' }), context()).score).toBe(2);
  });
  test('LG-221: Backup priority gives −1', () => {
    expect(scoreCandidate(tutor({ priority_tag: 'Backup' }), context()).score).toBe(-1);
  });
  test('LG-222: Risk priority gives −1 and a warning', () => {
    const c = scoreCandidate(tutor({ priority_tag: 'Risk' }), context());
    expect(c.score).toBe(-1);
    expect(c.warnings).toContain('Flagged as risk');
  });
});

describe('sortCandidates', () => {
  test('LG-223: tutor already on this session is listed first', () => {
    const list = [
      { id: 'a', isAssignedToThisSession: false, hardBlocked: false, score: 10 },
      { id: 'b', isAssignedToThisSession: true, hardBlocked: false, score: 0 }
    ];
    expect(sortCandidates(list).map(c => c.id)).toEqual(['b', 'a']);
  });
  test('LG-224: blocked tutors go last, the rest by highest score', () => {
    const list = [
      { id: 'blocked', isAssignedToThisSession: false, hardBlocked: true, score: 99 },
      { id: 'low', isAssignedToThisSession: false, hardBlocked: false, score: 1 },
      { id: 'high', isAssignedToThisSession: false, hardBlocked: false, score: 4 }
    ];
    expect(sortCandidates(list).map(c => c.id)).toEqual(['high', 'low', 'blocked']);
  });
});
