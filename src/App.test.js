// Smoke test for the whole app shell (replaces the Create React App
// placeholder that looked for a "learn react" link and always failed).
import { render, screen } from '@testing-library/react';
import App from './App';

// Heavy 3D/visual pieces are not needed to check routing.
jest.mock('./components/ProfileLanyard.jsx', () => () => null);
jest.mock('./components/BotWidget.jsx', () => () => null);

beforeEach(() => {
  localStorage.clear();
  window.history.pushState({}, '', '/');
});

test('FE-01 a visitor who is not logged in is sent to the login page', async () => {
  render(<App />);
  expect(await screen.findByRole('heading', { name: /sessioneer login/i })).toBeInTheDocument();
  expect(window.location.pathname).toBe('/login');
});

test('FE-02 a protected page without a token also goes to login', async () => {
  window.history.pushState({}, '', '/uc-dashboard');
  render(<App />);
  expect(await screen.findByRole('heading', { name: /sessioneer login/i })).toBeInTheDocument();
});
