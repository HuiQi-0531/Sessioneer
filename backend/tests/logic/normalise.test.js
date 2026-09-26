// Logic unit tests for backend/utils/normalise.js
// Pure functions only: no database, no network, safe to run anytime.
// Run with: npm run test:logic

const {
  normaliseDay,
  normaliseTime,
  isUnitActive,
  timeToMinutes,
  timeToSlot,
  getHourlySlotsInRange,
  sessionDurationHours,
  timeRangesOverlap,
} = require('../../utils/normalise');

// ─── timeRangesOverlap ──────────────────────────────────────────────
// Core of clash detection: used by the 409 block on assign and by the
// hard-block flag on the candidate list (sessions.routes.js).
describe('timeRangesOverlap', () => {
  test.each([
    ['partial overlap',        '10:00:00', '12:00:00', '11:00:00', '13:00:00', true],
    ['one inside the other',   '10:00:00', '14:00:00', '11:00:00', '12:00:00', true],
    ['identical times',        '10:00:00', '12:00:00', '10:00:00', '12:00:00', true],
    ['back-to-back (A then B)', '10:00:00', '11:00:00', '11:00:00', '12:00:00', false],
    ['back-to-back (B then A)', '11:00:00', '12:00:00', '10:00:00', '11:00:00', false],
    ['completely separate',    '08:00:00', '09:00:00', '13:00:00', '14:00:00', false],
    ['1-minute overlap',       '10:00:00', '11:01:00', '11:00:00', '12:00:00', true],
  ])('%s', (_label, sA, eA, sB, eB, expected) => {
    expect(timeRangesOverlap(sA, eA, sB, eB)).toBe(expected);
  });

  test('gives the same answer whichever session is passed first', () => {
    expect(timeRangesOverlap('10:00:00', '12:00:00', '11:00:00', '13:00:00'))
      .toBe(timeRangesOverlap('11:00:00', '13:00:00', '10:00:00', '12:00:00'));
  });
});

// ─── sessionDurationHours ───────────────────────────────────────────
// Feeds the max-hours check on assign.
describe('sessionDurationHours', () => {
  test.each([
    ['10:00:00', '12:00:00', 2],
    ['10:00:00', '11:30:00', 1.5],
    ['09:00:00', '09:00:00', 0],
  ])('%s to %s = %p hours', (start, end, expected) => {
    expect(sessionDurationHours(start, end)).toBe(expected);
  });

  // Documents current behaviour: no validation here, so callers must make
  // sure end_time is after start_time. A negative duration would reduce a
  // tutor's total hours and could let them slip past their max hours.
  test('returns a negative number when end is before start', () => {
    expect(sessionDurationHours('14:00:00', '12:00:00')).toBe(-2);
  });
});

// ─── timeToMinutes ──────────────────────────────────────────────────
describe('timeToMinutes', () => {
  test.each([
    ['00:00:00', 0],
    ['08:30:00', 510],
    ['23:59:00', 1439],
  ])('%s -> %i', (time, expected) => {
    expect(timeToMinutes(time)).toBe(expected);
  });
});

// ─── timeToSlot ─────────────────────────────────────────────────────
// Matches DB times to the availability grid labels.
describe('timeToSlot', () => {
  test.each([
    ['00:00:00', '12am'],
    ['08:00:00', '8am'],
    ['11:30:00', '11am'],
    ['12:00:00', '12pm'],
    ['13:00:00', '1pm'],
    ['23:00:00', '11pm'],
  ])('%s -> %s', (time, expected) => {
    expect(timeToSlot(time)).toBe(expected);
  });
});

// ─── getHourlySlotsInRange ──────────────────────────────────────────
// Decides which availability slots a session needs to check.
describe('getHourlySlotsInRange', () => {
  test.each([
    ['10:00:00', '12:00:00', ['10am', '11am']],
    ['11:00:00', '13:00:00', ['11am', '12pm']],
    ['10:00:00', '11:30:00', ['10am', '11am']],
    ['10:00:00', '10:00:00', []],
  ])('%s to %s', (start, end, expected) => {
    expect(getHourlySlotsInRange(start, end)).toEqual(expected);
  });
});

// ─── normaliseDay ───────────────────────────────────────────────────
// Used by CSV timetable import.
describe('normaliseDay', () => {
  test.each([
    ['Monday', 'MON'],
    ['mon', 'MON'],
    ['  TUES  ', 'TUE'],
    ['Thurs', 'THU'],
    ['sunday', 'SUN'],
  ])('%p -> %s', (input, expected) => {
    expect(normaliseDay(input)).toBe(expected);
  });

  test.each([[''], [null], [undefined], ['Funday'], ['Mo']])(
    'returns null for %p', (input) => {
      expect(normaliseDay(input)).toBeNull();
    }
  );
});

// ─── normaliseTime ──────────────────────────────────────────────────
// Used by CSV timetable import. Output must be a valid Postgres TIME.
describe('normaliseTime', () => {
  describe('accepts common formats', () => {
    test.each([
      ['3pm', '15:00:00'],
      ['3 pm', '15:00:00'],
      [' 3PM ', '15:00:00'],
      ['12pm', '12:00:00'],
      ['12am', '00:00:00'],
      ['3:30 pm', '15:30:00'],
      ['9:05am', '09:05:00'],
      ['12:30am', '00:30:00'],
      ['8:00', '08:00:00'],
      ['15:00', '15:00:00'],
      ['1500', '15:00:00'],
      ['800', '08:00:00'],
      [1500, '15:00:00'],
    ])('%p -> %s', (input, expected) => {
      expect(normaliseTime(input)).toBe(expected);
    });
  });

  describe('rejects unrecognised input', () => {
    test.each([[''], [null], ['noon'], ['25:00'], ['2400']])(
      'returns null for %p', (input) => {
        expect(normaliseTime(input)).toBeNull();
      }
    );
  });

  // Out-of-range values should be rejected, not turned into an invalid time
  // that Postgres will refuse when the session is saved.
  describe('rejects out-of-range values', () => {
    test.each([
      ['13pm'],   // 13 is not a valid 12-hour clock hour
      ['3:75pm'], // 75 minutes
      ['8:60'],   // 60 minutes
      ['1275'],   // 75 minutes
    ])('returns null for %p', (input) => {
      expect(normaliseTime(input)).toBeNull();
    });
  });
});

// ─── isUnitActive ───────────────────────────────────────────────────
// Depends on today's date, so the clock is frozen for repeatable results.
describe('isUnitActive (clock fixed to 26 Sep 2026)', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-26T10:00:00'));
  });
  afterAll(() => jest.useRealTimers());

  test.each([
    ['Semester 2', 2026, true],
    ['Semester 2', '2026', true],
    ['Semester 1', 2026, false],
    ['Semester 2', 2025, false],
    ['Semester 2', 2027, false],
    [null, 2026, true],
    ['Semester 2', null, true],
  ])('%p %p -> %p', (semester, year, expected) => {
    expect(isUnitActive(semester, year)).toBe(expected);
  });
});