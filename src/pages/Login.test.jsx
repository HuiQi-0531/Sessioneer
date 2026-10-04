// Login page: the form validates, shows server errors, and sends each role home.
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Login from './Login';
import { authAPI } from '../config/api';

jest.mock('../config/api', () => ({ authAPI: { login: jest.fn() } }));
jest.mock('../context/ActiveUnitContext', () => ({ useActiveUnit: () => ({ refreshUnits: jest.fn() }) }));

const renderLogin = () => render(
  <MemoryRouter initialEntries={['/login']}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/tutor-dashboard" element={<p>tutor home</p>} />
      <Route path="/uc-dashboard" element={<p>uc home</p>} />
      <Route path="/admin-dashboard" element={<p>admin home</p>} />
    </Routes>
  </MemoryRouter>
);
const fill = (container, email, password) => {
  fireEvent.change(container.querySelector('input[name="email"]'), { target: { name: 'email', value: email } });
  fireEvent.change(container.querySelector('input[name="password"]'), { target: { name: 'password', value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Log In' }));
};

beforeEach(() => { localStorage.clear(); jest.clearAllMocks(); });

test('FE-14 empty fields show a message and do not call the server', () => {
  const { container } = renderLogin();
  fill(container, '', '');
  expect(screen.getByText('Please enter your email and password')).toBeInTheDocument();
  expect(authAPI.login).not.toHaveBeenCalled();
});

test('FE-15 a server error is shown to the user', async () => {
  authAPI.login.mockRejectedValue(new Error('Invalid email or password'));
  const { container } = renderLogin();
  fill(container, 'a@b.test', 'nope');
  expect(await screen.findByText('Invalid email or password')).toBeInTheDocument();
});

test.each([
  ['tutor', 'tutor home'],
  ['coordinator', 'uc home'],
  ['admin', 'admin home']
])('FE-16 a %s is saved and sent to their own dashboard', async (role, home) => {
  authAPI.login.mockResolvedValue({ token: 'tok', user: { id: 'u1', role } });
  const { container } = renderLogin();
  fill(container, 'a@b.test', 'secret1');
  expect(await screen.findByText(home)).toBeInTheDocument();
  expect(localStorage.getItem('token')).toBe('tok');
  expect(JSON.parse(localStorage.getItem('currentUser')).role).toBe(role);
});
