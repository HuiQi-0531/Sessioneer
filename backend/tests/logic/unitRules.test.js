// isUnitActive has its own tests (normalise.test.js); here it is replaced by a fake
// so these tests only check what the unit functions themselves do.
jest.mock('../../utils/normalise', () => ({ isUnitActive: jest.fn(() => true) }));
jest.mock('../../db', () => ({ query: jest.fn() }));
const {
  formatUnit,
  formatUnitAccess,
  normaliseEmails,
  loadCoordinatorUsersByEmail,
  canLockSchedule,
  resolveDuplicateUnitName
} = require('../../utils/unitRules');
const { isUnitActive } = require('../../utils/normalise');

describe('formatUnit', () => {
  test('LG-417: maps a unit row', () => {
    expect(formatUnit({ id: 'u1', unit_code: 'CAB201', semester: 'Semester 2', year: 2026, schedule_locked: true }))
      .toMatchObject({ id: 'u1', unitCode: 'CAB201', semester: 'Semester 2', scheduleLocked: true });
  });
  test('LG-418: lock / release flags default to false', () => {
    expect(formatUnit({ id: 'u1' })).toMatchObject({ scheduleLocked: false, scheduleLockedAt: null, draftReleased: false });
  });
  test('LG-419: isActive comes from the semester and year', () => {
    isUnitActive.mockReturnValueOnce(false);
    expect(formatUnit({ id: 'u1', semester: 'Semester 1', year: 2025 }).isActive).toBe(false);
    expect(isUnitActive).toHaveBeenLastCalledWith('Semester 1', 2025);
  });
});

describe('formatUnitAccess', () => {
  test('LG-420: roles default to []', () => {
    expect(formatUnitAccess({ id: 'u1' }).roles).toEqual([]);
  });
});

describe('normaliseEmails', () => {
  test('LG-421: not a list gives []', () => { expect(normaliseEmails('a@x.com')).toEqual([]); });
  test('LG-422: emails are trimmed and lowercased', () => { expect(normaliseEmails([' A@X.com '])).toEqual(['a@x.com']); });
  test('LG-423: duplicates are removed', () => { expect(normaliseEmails(['a@x.com', 'A@x.com'])).toEqual(['a@x.com']); });
  test('LG-424: blanks are removed', () => { expect(normaliseEmails(['', null, 'a@x.com'])).toEqual(['a@x.com']); });
});

describe('loadCoordinatorUsersByEmail (fake database)', () => {
  const fakeClient = (rows) => ({ query: jest.fn().mockResolvedValue({ rows }) });

  test('LG-425: the current user\'s own email is ignored', async () => {
    const client = fakeClient([]);
    await loadCoordinatorUsersByEmail(['me@x.com', 'b@x.com'], 'ME@x.com', client);
    expect(client.query.mock.calls[0][1]).toEqual([['b@x.com']]);
  });
  test('LG-426: emails with no account are listed as missing', async () => {
    const result = await loadCoordinatorUsersByEmail(['b@x.com'], null, fakeClient([]));
    expect(result.missingEmails).toEqual(['b@x.com']);
  });
  test('LG-427: accounts that are not coordinators are listed separately', async () => {
    const result = await loadCoordinatorUsersByEmail(['b@x.com', 'c@x.com'], null, fakeClient([
      { id: 'b', email: 'b@x.com', role: 'coordinator' },
      { id: 'c', email: 'c@x.com', role: 'tutor' }
    ]));
    expect(result.users.map(u => u.id)).toEqual(['b']);
    expect(result.nonCoordinatorEmails).toEqual(['c@x.com']);
  });
  test('LG-428: no emails means no database query', async () => {
    const client = fakeClient([]);
    await expect(loadCoordinatorUsersByEmail([], null, client)).resolves.toEqual({ users: [], missingEmails: [], nonCoordinatorEmails: [] });
    expect(client.query).not.toHaveBeenCalled();
  });
});

describe('canLockSchedule', () => {
  test('LG-429: everything assigned and confirmed can be locked', () => { expect(canLockSchedule(0, 0, false)).toBe(true); });
  test('LG-430: unassigned or pending sessions block locking', () => {
    expect(canLockSchedule(2, 0, false)).toBe(false);
    expect(canLockSchedule(0, 1, false)).toBe(false);
  });
  test('LG-431: force locks anyway', () => { expect(canLockSchedule(2, 3, true)).toBe(true); });
});

describe('resolveDuplicateUnitName', () => {
  test('LG-432: a new name is used (trimmed)', () => { expect(resolveDuplicateUnitName('  New Name ', 'Old')).toBe('New Name'); });
  test('LG-433: blank name keeps the original unit name', () => { expect(resolveDuplicateUnitName('   ', 'Old')).toBe('Old'); });
});
