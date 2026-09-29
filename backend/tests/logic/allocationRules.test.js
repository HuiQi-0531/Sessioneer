const {
  findOverlappingSessions,
  calcHoursIfAssigned,
  exceedsMaxHours,
  violatesSuperTutorRule
} = require('../../utils/allocationRules');

const session = { day: 'MON', start_time: '10:00:00', end_time: '12:00:00' };

describe('findOverlappingSessions', () => {
  test('LG-198: same day with overlapping times is a clash', () => {
    const other = { day: 'MON', start_time: '11:00:00', end_time: '13:00:00', unit_code: 'CAB201' };
    expect(findOverlappingSessions(session, [other])).toEqual([other]);
  });
  test('LG-199: same times on a different day is not a clash', () => {
    expect(findOverlappingSessions(session, [{ day: 'TUE', start_time: '10:00:00', end_time: '12:00:00' }])).toEqual([]);
  });
  test('LG-200: back-to-back sessions (12:00 end, 12:00 start) are not a clash', () => {
    expect(findOverlappingSessions(session, [{ day: 'MON', start_time: '12:00:00', end_time: '14:00:00' }])).toEqual([]);
  });
  test('LG-201: tutor with no other sessions has no clash', () => {
    expect(findOverlappingSessions(session, [])).toEqual([]);
  });
  test('LG-202: every clashing session is returned, not just the first', () => {
    const a = { day: 'MON', start_time: '09:00:00', end_time: '11:00:00' };
    const b = { day: 'MON', start_time: '11:30:00', end_time: '12:30:00' };
    const c = { day: 'MON', start_time: '13:00:00', end_time: '14:00:00' };
    expect(findOverlappingSessions(session, [a, b, c])).toEqual([a, b]);
  });
});

describe('calcHoursIfAssigned', () => {
  test('LG-203: adds this session to the hours already assigned', () => {
    const others = [
      { start_time: '09:00:00', end_time: '11:00:00' },
      { start_time: '13:00:00', end_time: '14:00:00' }
    ];
    expect(calcHoursIfAssigned(session, others)).toBe(5);
  });
  test('LG-204: no other sessions gives just this session', () => {
    expect(calcHoursIfAssigned(session, [])).toBe(2);
  });
});

describe('exceedsMaxHours', () => {
  test('LG-205: no maximum set never exceeds', () => {
    expect(exceedsMaxHours(null, 40)).toBe(false);
  });
  test('LG-206: reaching exactly the maximum is allowed', () => {
    expect(exceedsMaxHours(10, 10)).toBe(false);
  });
  test('LG-207: going over the maximum is blocked', () => {
    expect(exceedsMaxHours(10, 11)).toBe(true);
  });
});

describe('violatesSuperTutorRule', () => {
  test('LG-208: a normal tutor cannot take a Lecture', () => {
    expect(violatesSuperTutorRule('Lecture', false, false)).toBe(true);
  });
  test('LG-209: a Super Tutor can take a Lecture', () => {
    expect(violatesSuperTutorRule('Lecture', true, false)).toBe(false);
  });
  test('LG-210: a coordinator assigning themselves skips the rule', () => {
    expect(violatesSuperTutorRule('Consultation', false, true)).toBe(false);
  });
});
