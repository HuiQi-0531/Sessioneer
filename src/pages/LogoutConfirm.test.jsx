import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import LogoutConfirm from './LogoutConfirm';
import { disconnectSocket } from '../utils/socket';

// ---------- Mocks ----------

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('../utils/socket', () => ({ disconnectSocket: jest.fn() }));
jest.mock('../utils/userName', () => ({
  getDisplayName: (user, fallback) => (user && user.name) || fallback,
}));

// ---------- Setup ----------

beforeEach(() => {
  mockNavigate.mockReset();
  localStorage.clear();
  localStorage.setItem('currentUser', JSON.stringify({ id: 'me', name: 'Alice Smith' }));
  localStorage.setItem('token', 'abc.def.ghi');
  localStorage.setItem('theme', 'dark'); // something unrelated that should be kept
});

// ---------- Tests ----------

describe('LogoutConfirm', () => {
  test('asks to confirm and shows who is signed in', () => {
    render(<LogoutConfirm />);

    expect(screen.getByRole('heading', { name: 'Log out of Sessioneer?' })).toBeInTheDocument();
    expect(screen.getByText(
      "You're signed in as Alice Smith. You'll need to log back in to access your account."
    )).toBeInTheDocument();
  });

  test('leaves out the name when nobody is saved as signed in', () => {
    localStorage.removeItem('currentUser');
    render(<LogoutConfirm />);

    expect(screen.getByText("You'll need to log back in to access your account.")).toBeInTheDocument();
    expect(screen.queryByText(/signed in as/i)).not.toBeInTheDocument();
  });

  test('leaves out the name when the saved user has no name', () => {
    localStorage.setItem('currentUser', JSON.stringify({ id: 'me' }));
    render(<LogoutConfirm />);

    expect(screen.queryByText(/signed in as/i)).not.toBeInTheDocument();
  });

  test('"Log Out" disconnects, clears the login and goes to the login page', async () => {
    render(<LogoutConfirm />);
    await userEvent.click(screen.getByRole('button', { name: 'Log Out' }));

    expect(disconnectSocket).toHaveBeenCalled();
    expect(localStorage.getItem('currentUser')).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('theme')).toBe('dark'); // other settings are kept
    // replace: true means the Back button can't return to this page
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
  });

  test('"Cancel" goes back without logging out', async () => {
    render(<LogoutConfirm />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockNavigate).toHaveBeenCalledWith(-1);
    expect(disconnectSocket).not.toHaveBeenCalled();
    expect(localStorage.getItem('currentUser')).not.toBeNull();
    expect(localStorage.getItem('token')).toBe('abc.def.ghi');
  });
});