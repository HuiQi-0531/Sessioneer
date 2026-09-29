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
