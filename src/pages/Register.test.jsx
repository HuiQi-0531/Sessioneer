// Register page: client-side checks, server errors (e.g. short password), success.
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Register from './Register';
import { authAPI } from '../config/api';

jest.mock('../config/api', () => ({ authAPI: { register: jest.fn() } }));

const renderRegister = () => render(
  <MemoryRouter initialEntries={['/register']}>
    <Routes>
      <Route path="/register" element={<Register />} />
      <Route path="/login" element={<p>login page</p>} />
    </Routes>
  </MemoryRouter>
);
const fill = (container, values) => {
  Object.entries(values).forEach(([name, value]) => {
    fireEvent.change(container.querySelector(`[name="${name}"]`), { target: { name, value } });
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
};
const good = { firstName: 'Ann', lastName: 'Lee', email: 'ann@uni.test', password: 'Secret12', confirmPassword: 'Secret12' };

beforeEach(() => jest.clearAllMocks());

test('FE-17 a missing field is caught before calling the server', () => {
  const { container } = renderRegister();
  fill(container, { ...good, lastName: '' });
  expect(screen.getByText('Please fill in all fields')).toBeInTheDocument();
  expect(authAPI.register).not.toHaveBeenCalled();
});

test('FE-18 mismatched passwords are caught', () => {
  const { container } = renderRegister();
  fill(container, { ...good, confirmPassword: 'other12' });
  expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
});

test('FE-19 a weak password is caught before calling the server (bug 9 rule)', () => {
  const { container } = renderRegister();
  fill(container, { ...good, password: '123', confirmPassword: '123' });
  expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
  expect(authAPI.register).not.toHaveBeenCalled();
});

test('FE-19b an error from the server is shown', async () => {
  authAPI.register.mockRejectedValue(new Error('An account with this email already exists'));
  const { container } = renderRegister();
  fill(container, good);
  expect(await screen.findByText('An account with this email already exists')).toBeInTheDocument();
});

test('FE-20 a good form registers (as Tutor by default) and goes to login', async () => {
  authAPI.register.mockResolvedValue({ user: {} });
  const { container } = renderRegister();
  fill(container, good);
  expect(await screen.findByText('login page')).toBeInTheDocument();
  expect(authAPI.register).toHaveBeenCalledWith(expect.objectContaining({ email: 'ann@uni.test', role: 'Tutor' }));
});