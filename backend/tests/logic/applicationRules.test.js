const {
  normaliseInvitedRole,
  formatApplication,
  filterCustomAnswers,
  isInviteExpired,
  resolveInviteName
} = require('../../utils/applicationRules');

describe('normaliseInvitedRole', () => {
  test('LG-396: tutor stays tutor', () => { expect(normaliseInvitedRole('tutor')).toBe('tutor'); });
  test('LG-397: super_tutor stays super_tutor', () => { expect(normaliseInvitedRole('super_tutor')).toBe('super_tutor'); });
  test('LG-398: anything else (e.g. coordinator) becomes tutor', () => {
    expect(normaliseInvitedRole('coordinator')).toBe('tutor');
    expect(normaliseInvitedRole(undefined)).toBe('tutor');
  });
});

describe('formatApplication', () => {
  test('LG-399: full name joins first and last name', () => {
    expect(formatApplication({ name: 'Alex', last_name: 'Lee' }).fullName).toBe('Alex Lee');
  });
  test('LG-400: invite link is only shown while the status is "invited"', () => {
    expect(formatApplication({ status: 'invited', invite_token: 'tok' }).inviteToken).toBe('tok');
    expect(formatApplication({ status: 'accepted', invite_token: 'tok' }).inviteToken).toBeNull();
  });
  test('LG-401: defaults for invited role and custom answers', () => {
    expect(formatApplication({})).toMatchObject({ invitedRole: 'tutor', customAnswers: {}, hasResume: false });
  });
});

describe('filterCustomAnswers', () => {
  test('LG-402: answers for built-in fields are removed', () => {
    expect(filterCustomAnswers({ phoneNumber: '04', resume: 'x', uni: 'QUT' })).toEqual({ uni: 'QUT' });
  });
  test('LG-403: custom answers are kept', () => {
    expect(filterCustomAnswers({ uni: 'QUT', year: '3' })).toEqual({ uni: 'QUT', year: '3' });
  });
  test('LG-404: not an object gives {}', () => {
    expect(filterCustomAnswers(null)).toEqual({});
    expect(filterCustomAnswers('text')).toEqual({});
  });
});

describe('isInviteExpired (clock fixed at 1 Oct 2026, 12:00 UTC)', () => {
  beforeAll(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-01T12:00:00Z')); });
  afterAll(() => jest.useRealTimers());
  test('LG-405: before expiry is not expired', () => { expect(isInviteExpired('2026-10-02T00:00:00Z')).toBe(false); });
  test('LG-406: after expiry is expired', () => { expect(isInviteExpired('2026-09-30T00:00:00Z')).toBe(true); });
  test('LG-407: exactly at expiry is not yet expired', () => { expect(isInviteExpired('2026-10-01T12:00:00Z')).toBe(false); });
});

describe('resolveInviteName', () => {
  test('LG-408: names from the application are used', () => {
    expect(resolveInviteName({ name: 'Alex', last_name: 'Lee' }, 'X', 'Y')).toEqual({ firstName: 'Alex', lastName: 'Lee' });
  });
  test('LG-409: direct invite (no name yet) uses the names typed in', () => {
    expect(resolveInviteName({ name: '', last_name: null }, 'Amy', 'Lee')).toEqual({ firstName: 'Amy', lastName: 'Lee' });
  });
  test('LG-410: last name comes from the application when present', () => {
    expect(resolveInviteName({ name: 'Alex', last_name: 'Lee' }, '', 'Other').lastName).toBe('Lee');
  });
  test('LG-411: an old full name "Alex Lee" is split, not repeated (LOGIC-B15)', () => {
    expect(resolveInviteName({ name: 'Alex Lee', last_name: null }, '', '')).toEqual({ firstName: 'Alex', lastName: 'Lee' });
  });
});
