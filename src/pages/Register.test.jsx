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
const good = { firstName: 'Ann', lastName: 'Lee', email: 'ann@uni.test', password: 'secret1', confirmPassword: 'secret1' };

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

test('FE-19 the server\'s password rule is shown', async () => {
  authAPI.register.mockRejectedValue(new Error('Password must be at least 6 characters'));
  const { container } = renderRegister();
  fill(container, { ...good, password: '123', confirmPassword: '123' });
  expect(await screen.findByText('Password must be at least 6 characters')).toBeInTheDocument();
});

test('FE-20 a good form registers (as Tutor by default) and goes to login', async () => {
  authAPI.register.mockResolvedValue({ user: {} });
  const { container } = renderRegister();
  fill(container, good);
  expect(await screen.findByText('login page')).toBeInTheDocument();
  expect(authAPI.register).toHaveBeenCalledWith(expect.objectContaining({ email: 'ann@uni.test', role: 'Tutor' }));
});
