// A tutor who is doing a cover right now is busy at that time, so Assign
// Staff must warn about it and the assignment must be refused, not only
// caught later when the tutor tries to accept.
const { findCoverConflicts, describeCoverConflict } = require('../../utils/allocationRules');
const { scoreCandidate } = require('../../utils/candidateScoring');

const session = { id: 'weekly', day: 'MON', start_time: '09:00:00', end_time: '10:00:00', session_type: 'Tutorial' };
const cover = (extra = {}) => ({
  tutor_id: 't1', session_id: 'covered', day: 'MON', start_time: '09:30:00', end_time: '10:30:00',
  unit_code: 'IFB102', end_date: '2026-10-16', ...extra
});

describe('findCoverConflicts', () => {
  test('LG-577: a running cover at the same time is a conflict', () => {
    expect(findCoverConflicts(session, [cover()])).toHaveLength(1);
  });
  test('LG-578: a cover on another day is not', () => {
    expect(findCoverConflicts(session, [cover({ day: 'TUE' })])).toHaveLength(0);
  });
  test('LG-579: covering this very session is not counted here', () => {
    expect(findCoverConflicts(session, [cover({ session_id: 'weekly' })])).toHaveLength(0);
  });
  test('LG-580: the message names the unit and the last day of the cover', () => {
    expect(describeCoverConflict(cover())).toBe('Covering an overlapping session in IFB102 until 2026-10-16');
    expect(describeCoverConflict(cover({ end_date: new Date(2026, 9, 16) }))).toMatch(/until 2026-10-16$/);
  });
});

describe('scoreCandidate with running covers', () => {
  const ctx = (activeCovers) => ({
    session, coveredSlots: ['9am'], thisDuration: 1, availRows: [], otherSessions: [],
    sessionNeedsSuperTutor: false, currentTutorIds: new Set(), activeCovers
  });
  const tutor = { id: 't1', name: 'Ann', membership_role: 'tutor', maximum_hours: 10 };

  test('LG-581: a tutor covering at that time is hard-blocked with the reason', () => {
    const c = scoreCandidate(tutor, ctx([cover()]));
    expect(c.hardBlocked).toBe(true);
    expect(c.coverConflict).toBe(true);
    expect(c.warnings).toContain('Covering an overlapping session in IFB102 until 2026-10-16');
  });
  test('LG-582: someone else\'s cover does not block this tutor', () => {
    expect(scoreCandidate(tutor, ctx([cover({ tutor_id: 'other' })])).hardBlocked).toBe(false);
  });
  test('LG-583: no covers passed in still works (older callers)', () => {
    const { activeCovers, ...rest } = ctx([]);
    expect(scoreCandidate(tutor, rest).coverConflict).toBe(false);
  });
});
