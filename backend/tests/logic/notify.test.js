// notify.js loads the database connection at the top of the file.
// Replace it with a fake so this test never touches the shared database.
jest.mock('../../db', () => ({ query: jest.fn() }));

const { getPreferenceColumn } = require('../../utils/notify');

describe('getPreferenceColumn', () => {
  test('LG-98: session_ types are controlled by the session updates setting', () => {
    expect(getPreferenceColumn('session_assigned')).toBe('notify_session_updates');
  });
  test('LG-99: request_ types are controlled by the request updates setting', () => {
    expect(getPreferenceColumn('request_approved')).toBe('notify_request_updates');
  });
  test('LG-100: other types have no setting, so they are always sent', () => {
    expect(getPreferenceColumn('cover_request')).toBeNull();
  });
  test('LG-101: prefix must be at the start and lowercase', () => {
    expect(getPreferenceColumn('SESSION_assigned')).toBeNull();
    expect(getPreferenceColumn('new_session_')).toBeNull();
  });
  test('LG-102: missing type throws (records current behaviour)', () => {
    // createNotification catches this error, so a notification with no type
    // is silently not created instead of crashing the request.
    expect(() => getPreferenceColumn(undefined)).toThrow(TypeError);
  });
});
