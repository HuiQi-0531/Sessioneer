const { parseTimestampAsUtc } = require('../../utils/dbTypes');

describe('parseTimestampAsUtc (database TIMESTAMP read as UTC)', () => {
  test('LG-455: "2026-10-01 10:00:00" is read as 10:00 UTC', () => {
    expect(parseTimestampAsUtc('2026-10-01 10:00:00').toISOString()).toBe('2026-10-01T10:00:00.000Z');
  });
  test('LG-456: fractional seconds are kept', () => {
    expect(parseTimestampAsUtc('2026-10-01 10:00:00.123456').toISOString()).toBe('2026-10-01T10:00:00.123Z');
  });
});
