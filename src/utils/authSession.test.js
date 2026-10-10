import { installAuthExpiryHandler, AUTH_ERROR_CODE, clearLocalSession } from './authSession';

jest.mock('./socket', () => ({ disconnectSocket: jest.fn() }));

const jsonResponse = (status, body) => ({
  status,
  clone: () => ({ json: async () => body })
});

describe('auth expiry handler', () => {
  test('a 401 with the AUTH_INVALID code on an authenticated request triggers logout', async () => {
    const target = { fetch: jest.fn().mockResolvedValue(jsonResponse(401, { code: AUTH_ERROR_CODE })) };
    const onExpired = jest.fn();
    installAuthExpiryHandler(target, onExpired);
    await target.fetch('/profile', { headers: { Authorization: 'Bearer x' } });
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  test('other 401s (e.g. wrong current password) do not log the user out', async () => {
    const target = { fetch: jest.fn().mockResolvedValue(jsonResponse(401, { error: 'Current password is incorrect' })) };
    const onExpired = jest.fn();
    installAuthExpiryHandler(target, onExpired);
    await target.fetch('/profile/password', { headers: { Authorization: 'Bearer x' } });
    expect(onExpired).not.toHaveBeenCalled();
  });

  test('a failed login (no token sent) is not treated as an expired session', async () => {
    const target = { fetch: jest.fn().mockResolvedValue(jsonResponse(401, { code: AUTH_ERROR_CODE })) };
    const onExpired = jest.fn();
    installAuthExpiryHandler(target, onExpired);
    await target.fetch('/auth/login', { headers: { 'Content-Type': 'application/json' } });
    expect(onExpired).not.toHaveBeenCalled();
  });

  test('clearLocalSession removes the saved token and user', () => {
    localStorage.setItem('token', 't');
    localStorage.setItem('currentUser', '{}');
    clearLocalSession();
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('currentUser')).toBeNull();
  });
});

describe('installAccountSwitchGuard', () => {
  const makeTarget = (pathname = '/profile') => {
    const listeners = {};
    return {
      location: { pathname, replace: jest.fn() },
      addEventListener: (type, fn) => { listeners[type] = fn; },
      fire: (event) => listeners.storage(event)
    };
  };

  test('another tab logging in as someone else reloads this tab', () => {
    const { installAccountSwitchGuard } = require('./authSession');
    const target = makeTarget('/profile');
    const reload = jest.fn();
    installAccountSwitchGuard(target, reload);
    target.fire({ key: 'token', oldValue: 'alex-token', newValue: 'tom-token' });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test('unrelated keys and unchanged tokens are ignored; login pages are left alone', () => {
    const { installAccountSwitchGuard } = require('./authSession');
    const target = makeTarget('/login');
    const reload = jest.fn();
    installAccountSwitchGuard(target, reload);
    target.fire({ key: 'activeUnitId', oldValue: 'a', newValue: 'b' });
    target.fire({ key: 'token', oldValue: 'same', newValue: 'same' });
    target.fire({ key: 'token', oldValue: 'a', newValue: 'b' });
    expect(reload).not.toHaveBeenCalled();
  });
});