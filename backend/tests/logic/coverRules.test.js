const c = require('../../utils/coverRules');

describe('countWeekdayOccurrences (1 Oct 2026 is a Thursday)', () => {
  test('LG-333: one week has one Thursday', () => { expect(c.countWeekdayOccurrences('THU', '2026-10-01', '2026-10-07')).toBe(1); });
  test('LG-334: the start date itself counts', () => { expect(c.countWeekdayOccurrences('THU', '2026-10-01', '2026-10-01')).toBe(1); });
  test('LG-335: the end date itself counts', () => { expect(c.countWeekdayOccurrences('WED', '2026-10-01', '2026-10-07')).toBe(1); });
  test('LG-336: four weeks has four Thursdays', () => { expect(c.countWeekdayOccurrences('THU', '2026-10-01', '2026-10-28')).toBe(4); });
  test('LG-337: works across the end of a month', () => { expect(c.countWeekdayOccurrences('THU', '2026-10-26', '2026-11-10')).toBe(2); });
  test('LG-338: lowercase day works', () => { expect(c.countWeekdayOccurrences('thu', '2026-10-01', '2026-10-07')).toBe(1); });
  test('LG-339: start after end gives 0', () => { expect(c.countWeekdayOccurrences('THU', '2026-10-10', '2026-10-01')).toBe(0); });
  test('LG-340: unknown day gives 0', () => { expect(c.countWeekdayOccurrences('XYZ', '2026-10-01', '2026-10-31')).toBe(0); });
  test('LG-341: missing or invalid date gives 0', () => {
    expect(c.countWeekdayOccurrences('THU', null, '2026-10-31')).toBe(0);
    expect(c.countWeekdayOccurrences('THU', 'not-a-date', '2026-10-31')).toBe(0);
  });
});

describe('formatDateRange', () => {
  test('LG-342: same month', () => { expect(c.formatDateRange('2026-10-01', '2026-10-14')).toBe('1 Oct - 14 Oct'); });
  test('LG-343: across months', () => { expect(c.formatDateRange('2026-10-26', '2026-11-10')).toBe('26 Oct - 10 Nov'); });
});

describe('formatTimeRange', () => {
  test('LG-344: seconds are cut', () => { expect(c.formatTimeRange('10:00:00', '12:00:00')).toBe('10:00 - 12:00'); });
});

describe('formatCoverSession', () => {
  test('LG-345: with location', () => {
    expect(c.formatCoverSession({ day: 'MON', start_time: '10:00:00', end_time: '12:00:00', location: 'GP-P512' })).toBe('MON 10:00 - 12:00 at GP-P512');
  });
  test('LG-346: without location', () => {
    expect(c.formatCoverSession({ day: 'MON', start_time: '10:00:00', end_time: '12:00:00' })).toBe('MON 10:00 - 12:00');
  });
  test('LG-347: camelCase fields from the frontend also work', () => {
    expect(c.formatCoverSession({ day: 'TUE', startTime: '09:00', endTime: '10:00' })).toBe('TUE 09:00 - 10:00');
  });
});

describe('validateCoverDates', () => {
  test('LG-348: missing date is refused', () => {
    expect(c.validateCoverDates('2026-10-01', '')).toBe('Select the date range this cover request applies to.');
  });
  test('LG-349: start after end is refused', () => {
    expect(c.validateCoverDates('2026-10-10', '2026-10-01')).toBe('Start date must be before the end date.');
  });
  test('LG-350: a one-day range is fine', () => {
    expect(c.validateCoverDates('2026-10-01', '2026-10-01')).toBeNull();
  });
});

describe('getCoverRecipients', () => {
  const tutors = [{ id: 't1' }, { id: 't2' }, { id: 't3' }];
  test('LG-351: the tutor who cannot make it is not notified', () => {
    expect(c.getCoverRecipients(tutors, [{ assigned_tutor_id: 't1' }]).map(t => t.id)).toEqual(['t2', 't3']);
  });
  test('LG-352: several sessions exclude each original tutor', () => {
    expect(c.getCoverRecipients(tutors, [{ assigned_tutor_id: 't1' }, { assigned_tutor_id: 't3' }]).map(t => t.id)).toEqual(['t2']);
  });
  test('LG-353: sessions with no tutor notify everyone', () => {
    expect(c.getCoverRecipients(tutors, [{ assigned_tutor_id: null }])).toHaveLength(3);
  });
});

describe('buildCoverSummary', () => {
  const s = { day: 'THU', start_time: '10:00:00', end_time: '12:00:00' };
  test('LG-354: one session over several weeks says "sessions"', () => {
    expect(c.buildCoverSummary([s], '2026-10-01', '2026-10-14')).toBe('1 Oct - 14 Oct · THU 10:00 - 12:00 (2 sessions)');
  });
  test('LG-355: one week says "session"', () => {
    expect(c.buildCoverSummary([s], '2026-10-01', '2026-10-07')).toBe('1 Oct - 7 Oct · THU 10:00 - 12:00 (1 session)');
  });
  test('LG-356: several sessions show the count', () => {
    expect(c.buildCoverSummary([s, s, s], '2026-10-01', '2026-10-07')).toBe('1 Oct - 7 Oct · 3 sessions');
  });
});

describe('checkCoverClaim', () => {
  test('LG-357: a tutor cannot claim their own session', () => {
    expect(c.checkCoverClaim({ original_tutor_id: 'me', session_type: 'Tutorial' }, 'me'))
      .toEqual({ status: 400, error: "You can't claim your own session." });
  });
  test('LG-358: a Lecture needs a Super Tutor', () => {
    expect(c.checkCoverClaim({ original_tutor_id: 'x', session_type: 'Lecture', is_super_tutor: false }, 'me'))
      .toEqual({ status: 403, error: 'Only Super Tutors can claim Lecture sessions.' });
  });
  test('LG-359: a normal claim is allowed', () => {
    expect(c.checkCoverClaim({ original_tutor_id: 'x', session_type: 'Tutorial', is_super_tutor: false }, 'me')).toBeNull();
  });
});
