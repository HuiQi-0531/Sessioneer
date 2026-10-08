import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';

import ResetPasswordPage from './ResetPasswordPage';
import { authAPI } from '../config/api';

// ---------- Mocks ----------

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('../config/api', () => ({
  authAPI: { forgotPassword: jest.fn(), resetPassword: jest.fn() },
}));

// ---------- Helpers ----------

// Opens the page at a given address, e.g. with or without ?token=...
const renderAt = (url) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <ResetPasswordPage />
    </MemoryRouter>
  );

const renderRequestMode = () => renderAt('/reset-password');
const renderResetMode = () => renderAt('/reset-password?token=abc123');

const submitForm = () => fireEvent.submit(document.querySelector('form'));

const emailInput = () => screen.getByPlaceholderText('Enter your email address');
const newPasswordInput = () => screen.getByPlaceholderText('Enter new password');
const confirmInput = () => screen.getByPlaceholderText('Confirm new password');

const fillPasswords = async (password, confirm = password) => {
  await userEvent.type(newPasswordInput(), password);
  await userEvent.type(confirmInput(), confirm);
};

// ---------- Setup ----------

beforeEach(() => {
  mockNavigate.mockReset();
  authAPI.forgotPassword.mockResolvedValue({ message: 'If that email exists, a reset link is on its way.' });
  authAPI.resetPassword.mockResolvedValue({});
});

// ---------- Tests ----------

describe('ResetPasswordPage', () => {
  describe('asking for a reset link (no token in the address)', () => {
    test('shows the email form and a link back to login', () => {
      renderRequestMode();

      expect(screen.getByRole('heading', { name: 'Reset Password' })).toBeInTheDocument();
      expect(emailInput()).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Back to Login' })).toHaveAttribute('href', '/login');
      expect(screen.queryByPlaceholderText('Enter new password')).not.toBeInTheDocument();
    });

    test('an email is required', () => {
      renderRequestMode();
      submitForm();

      expect(screen.getByText('Please enter your email address')).toBeInTheDocument();
      expect(authAPI.forgotPassword).not.toHaveBeenCalled();
    });

    test('the email must look valid', async () => {
      renderRequestMode();
      await userEvent.type(emailInput(), 'not-an-email');
      submitForm();

      expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument();
      expect(authAPI.forgotPassword).not.toHaveBeenCalled();
    });

    test('sends the email (trimmed) and shows the server\'s message', async () => {
      renderRequestMode();
      await userEvent.type(emailInput(), '  alice@example.com  ');
      submitForm();

      expect(authAPI.forgotPassword).toHaveBeenCalledWith('alice@example.com');
      expect(await screen.findByText('If that email exists, a reset link is on its way.')).toHaveClass('success-message');
    });

    test('shows a default message if the server gives none', async () => {
      authAPI.forgotPassword.mockResolvedValue({});
      renderRequestMode();
      await userEvent.type(emailInput(), 'alice@example.com');
      submitForm();

      expect(await screen.findByText('Please check your email for the reset link.')).toBeInTheDocument();
    });

    test('shows the error if sending fails', async () => {
      authAPI.forgotPassword.mockRejectedValue(new Error('Too many requests. Try again later.'));
      renderRequestMode();
      await userEvent.type(emailInput(), 'alice@example.com');
      submitForm();

      expect(await screen.findByText('Too many requests. Try again later.')).toHaveClass('error-message');
    });

    test('shows "Sending..." while the request is in progress', async () => {
      authAPI.forgotPassword.mockReturnValue(new Promise(() => {}));
      renderRequestMode();
      await userEvent.type(emailInput(), 'alice@example.com');
      submitForm();

      expect(await screen.findByRole('button', { name: 'Sending...' })).toBeDisabled();
    });
  });

  describe('choosing a new password (token in the address)', () => {
    test('shows the new password form', () => {
      renderResetMode();

      expect(screen.getByRole('heading', { name: 'Create New Password' })).toBeInTheDocument();
      expect(newPasswordInput()).toHaveAttribute('type', 'password');
      expect(confirmInput()).toBeInTheDocument();
      expect(screen.queryByPlaceholderText('Enter your email address')).not.toBeInTheDocument();
    });

    test('a new password is required', () => {
      renderResetMode();
      submitForm();

      expect(screen.getByText('Please enter a new password')).toBeInTheDocument();
      expect(authAPI.resetPassword).not.toHaveBeenCalled();
    });

    test('the password must be at least 6 characters', async () => {
      renderResetMode();
      await fillPasswords('abc');
      submitForm();

      expect(screen.getByText('Password must be at least 6 characters')).toBeInTheDocument();
      expect(authAPI.resetPassword).not.toHaveBeenCalled();
    });

    test('the two passwords must match', async () => {
      renderResetMode();
      await fillPasswords('secret1', 'secret2');
      submitForm();

      expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
      expect(authAPI.resetPassword).not.toHaveBeenCalled();
    });

    test('resets the password, then "Go to Login" opens the login page', async () => {
      renderResetMode();
      await fillPasswords('secret1');
      submitForm();

      expect(authAPI.resetPassword).toHaveBeenCalledWith('abc123', 'secret1');
      expect(await screen.findByRole('heading', { name: 'Password Reset Successful!' })).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Go to Login' }));
      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });

    test('shows the error if resetting fails', async () => {
      authAPI.resetPassword.mockRejectedValue(new Error('This reset link has expired.'));
      renderResetMode();
      await fillPasswords('secret1');
      submitForm();

      expect(await screen.findByText('This reset link has expired.')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Create New Password' })).toBeInTheDocument();
    });

    test('shows "Resetting..." while saving', async () => {
      authAPI.resetPassword.mockReturnValue(new Promise(() => {}));
      renderResetMode();
      await fillPasswords('secret1');
      submitForm();

      expect(await screen.findByRole('button', { name: 'Resetting...' })).toBeDisabled();
    });

    test('each eye button shows or hides only its own password', async () => {
      renderResetMode();
      const [showNew] = screen.getAllByRole('button', { name: 'Show password' });

      await userEvent.click(showNew);

      expect(newPasswordInput()).toHaveAttribute('type', 'text');
      expect(confirmInput()).toHaveAttribute('type', 'password');
      expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Hide password' }));
      expect(newPasswordInput()).toHaveAttribute('type', 'password');
    });
  });
});