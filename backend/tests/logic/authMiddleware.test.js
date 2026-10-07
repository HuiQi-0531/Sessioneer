// auth.js loads the database connection at the top of the file.
// Replace it with a fake so this test never touches the shared database.
jest.mock('../../db', () => ({ query: jest.fn() }));

const { getBlockedAccountResponse } = require('../../middleware/auth');

describe('getBlockedAccountResponse', () => {
  test('LG-119: disabled account is blocked with 403', () => {
    const result = getBlockedAccountResponse('disabled');
    expect(result.code).toBe(403);
    expect(result.error).toMatch(/disabled/);
  });
  test('LG-120: pending account is blocked with 403', () => {
    const result = getBlockedAccountResponse('pending');
    expect(result.code).toBe(403);
    expect(result.error).toMatch(/pending/);
  });
  test('LG-121: active account and unknown status are not blocked', () => {
    expect(getBlockedAccountResponse('active')).toBeNull();
    expect(getBlockedAccountResponse(undefined)).toBeNull();
  });
});

describe('token version (server-side logout)', () => {
  const { tokenVersionMatches } = require('../../middleware/auth');

  test('LG-653: a token with the current version is accepted', () => {
    expect(tokenVersionMatches({ tv: 2 }, { token_version: 2 })).toBe(true);
  });
  test('LG-654: a token from before a logout (older version) is refused', () => {
    expect(tokenVersionMatches({ tv: 1 }, { token_version: 2 })).toBe(false);
  });
  test('LG-655: a token without a version counts as version 0', () => {
    expect(tokenVersionMatches({}, { token_version: 0 })).toBe(true);
    expect(tokenVersionMatches({}, { token_version: 1 })).toBe(false);
  });
});
