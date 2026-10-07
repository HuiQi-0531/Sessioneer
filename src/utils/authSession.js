// Keeps the browser in step with the server-side login.
//
// The backend answers 401 with { code: 'AUTH_INVALID' } when a token is no
// longer valid (logged out, password changed, expired). When that happens the
// saved login is cleared and the user is sent back to the login page. Other
// 401s (for example "Current password is incorrect") are left alone.
import { disconnectSocket } from './socket';

export const AUTH_ERROR_CODE = 'AUTH_INVALID';

export const clearLocalSession = () => {
  disconnectSocket();
  localStorage.removeItem('currentUser');
  localStorage.removeItem('token');
};

const PUBLIC_PATHS = ['/login', '/register', '/reset-password', '/apply'];

const isPublicPath = (pathname) =>
  PUBLIC_PATHS.includes(pathname) || pathname.startsWith('/activate/');

const sentAuthHeader = (init) => {
  const headers = init && init.headers;
  if (!headers) return false;
  if (typeof Headers !== 'undefined' && headers instanceof Headers) return headers.has('Authorization');
  return Object.keys(headers).some(key => key.toLowerCase() === 'authorization');
};

let redirecting = false;

export const handleExpiredLogin = (redirect = (path) => window.location.replace(path)) => {
  clearLocalSession();
  if (redirecting || isPublicPath(window.location.pathname)) return;
  redirecting = true;
  redirect('/login');
};

// Wraps window.fetch once. Returns the wrapper (handy for tests).
export const installAuthExpiryHandler = (target = window, onExpired = handleExpiredLogin) => {
  if (!target.fetch || target.fetch.__authExpiryHandler) return target.fetch;
  const originalFetch = target.fetch.bind(target);

  const wrapped = async (input, init) => {
    const response = await originalFetch(input, init);
    if (response && response.status === 401 && sentAuthHeader(init)) {
      try {
        const body = await response.clone().json();
        if (body && body.code === AUTH_ERROR_CODE) onExpired();
      } catch (error) {
        // Not JSON: not one of ours, leave it to the caller.
      }
    }
    return response;
  };
  wrapped.__authExpiryHandler = true;
  target.fetch = wrapped;
  return wrapped;
};
