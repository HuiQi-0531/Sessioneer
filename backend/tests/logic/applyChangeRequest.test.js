const {
  comparable,
  sessionComparable,
  sessionLoose,
  labelFromStored,
  resolveSessionId
} = require('../../utils/applyChangeRequest');

test('M-13 an admin display label with a session type resolves to the target ID', async () => {
  const client = { query: jest.fn().mockResolvedValue({ rows: [{
    id: 'target', day: 'MON', start_time: '09:00:00', end_time: '10:00:00', location: 'GP-P-101', session_type: 'Tutorial'
  }] }) };
  expect(await resolveSessionId(client, 'unit', null, 'Tutorial - MON 09:00 - 10:00 | GP-P-101')).toBe('target');
});

describe('comparable', () => {
  test('LG-103: spaces around a hyphen are removed', () => {
    expect(comparable('Mon 10:00 - 12:00')).toBe('MON 10:00-12:00');
  });
  test('LG-104: en dash (–) is treated the same as a hyphen', () => {
    expect(comparable('Mon 10:00 – 12:00')).toBe('MON 10:00-12:00');
  });
  test('LG-105: spaces around | are removed', () => {
    expect(comparable('MON 10:00-12:00 | GP-P512')).toBe('MON 10:00-12:00|GP-P512');
  });
  test('LG-106: repeated spaces become one and text becomes uppercase', () => {
    expect(comparable('  mon    10:00-12:00  ')).toBe('MON 10:00-12:00');
  });
  test('LG-107: missing value gives empty string', () => {
    expect(comparable(null)).toBe('');
    expect(comparable(undefined)).toBe('');
  });
});

describe('sessionComparable', () => {
  const session = { day: 'MON', start_time: '10:00:00', end_time: '12:00:00', location: 'GP-P512' };

  test('LG-108: builds the label DAY START-END|ROOM', () => {
    expect(sessionComparable(session)).toBe('MON 10:00-12:00|GP-P512');
  });
  test('LG-109: seconds are cut from database times', () => {
    expect(sessionComparable({ ...session, start_time: '09:30:00', end_time: '10:30:00' }))
      .toBe('MON 09:30-10:30|GP-P512');
  });
  test('LG-110: missing times become TBC', () => {
    expect(sessionComparable({ day: 'TUE', location: 'Online' })).toBe('TUE TBC-TBC|ONLINE');
  });
  test('LG-111: missing day becomes TBC and missing room becomes TBA', () => {
    expect(sessionComparable({ start_time: '10:00:00', end_time: '11:00:00' }))
      .toBe('TBC 10:00-11:00|TBA');
  });
});

describe('sessionLoose', () => {
  const session = { day: 'MON', start_time: '10:00:00', end_time: '12:00:00', location: 'GP-P512' };

  test('LG-112: builds the label with a space before the room instead of |', () => {
    expect(sessionLoose(session)).toBe('MON 10:00-12:00 GP-P512');
  });
  test('LG-113: matches a label a tutor typed with extra spaces and lowercase', () => {
    expect(sessionLoose(session)).toBe(comparable('mon 10:00  -  12:00   gp-p512'));
  });
});

describe('labelFromStored', () => {
  test('LG-114: removes the id part before ::', () => {
    expect(labelFromStored('abc-123::MON 10:00-12:00|GP-P512')).toBe('MON 10:00-12:00|GP-P512');
  });
  test('LG-115: with more than one ::, keeps only the last part', () => {
    expect(labelFromStored('a::b::MON 10:00-12:00')).toBe('MON 10:00-12:00');
  });
  test('LG-116: value without :: is returned as it is', () => {
    expect(labelFromStored('MON 10:00-12:00')).toBe('MON 10:00-12:00');
  });
  test('LG-117: missing value gives empty string', () => {
    expect(labelFromStored(null)).toBe('');
    expect(labelFromStored('')).toBe('');
  });
});

describe('stored label matches the session on the timetable', () => {
  test('LG-118: a stored request label finds the right session', () => {
    const session = { day: 'WED', start_time: '14:00:00', end_time: '16:00:00', location: 'Z-411' };
    const stored = 'f3b1c2::Wed 14:00 – 16:00 | Z-411';
    expect(comparable(labelFromStored(stored))).toBe(sessionComparable(session));
  });
});
