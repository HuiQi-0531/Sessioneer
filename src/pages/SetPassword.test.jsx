import React from 'react';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';

import SetPassword from './SetPassword';
import { tutorApplicationsAPI } from '../config/api';

// ---------- Mocks ----------

let mockParams = {};
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => mockParams,
  useNavigate: () => mockNavigate,
}));

jest.mock('../config/api', () => ({
  tutorApplicationsAPI: { verifyInvite: jest.fn(), acceptInvite: jest.fn() },
}));

// ---------- Test data ----------

// Someone who applied, so we already know their name
const knownInvitee = { name: 'Alice Smith', email: 'alice@example.com', requiresName: false };
// Someone invited by email only, who still needs to give their name
const newInvitee = { email: 'new@example.com', requiresName: true };

// ---------- Helpers ----------

const renderPage = () =>
  render(
    <MemoryRouter>
      <SetPassword />
    </MemoryRouter>
  );

const renderAndWait = async () => {
  renderPage();
  await screen.findByRole('button', { name: 'Set Password & Activate Account' });
};

// Inputs sit in a .ta-field box after their label
const input = (label) =>
  Array.from(document.querySelectorAll('.ta-field'))
    .find(box => box.querySelector('label').textContent === label)
    .querySelector('input');

const submitForm = () => fireEvent.submit(document.querySelector('form'));

const fillPasswords = async (password, confirm = password) => {
  await userEvent.type(input('New password'), password);
  await userEvent.type(input('Confirm password'), confirm);
};

// Runs the 2.5-second "go to login" timer straight away
const runRedirectTimer = () => {
  const calls = window.setTimeout.mock.calls.filter(call => call[1] === 2500);
  act(() => { calls[calls.length - 1][0](); });
};

// ---------- Setup ----------

beforeEach(() => {
  mockParams = { token: 'tok-123' };
  mockNavigate.mockReset();
  tutorApplicationsAPI.verifyInvite.mockResolvedValue(knownInvitee);
  tutorApplicationsAPI.acceptInvite.mockResolvedValue({});
  jest.spyOn(window, 'setTimeout');
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------- Tests ----------

describe('SetPassword', () => {
  describe('checking the invite link', () => {
    test('shows a message while the link is being checked', () => {
      tutorApplicationsAPI.verifyInvite.mockReturnValue(new Promise(() => {}));
      renderPage();

      expect(screen.getByText('Checking your invite link...')).toBeInTheDocument();
      expect(tutorApplicationsAPI.verifyInvite).toHaveBeenCalledWith('tok-123');
    });

    test('an invalid link shows the reason and a link to log in', async () => {
      tutorApplicationsAPI.verifyInvite.mockRejectedValue(new Error('This invite has expired.'));
      renderPage();

      expect(await screen.findByRole('heading', { name: 'Invite link not valid' })).toBeInTheDocument();
      expect(screen.getByText('This invite has expired.')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Go to login' })).toHaveAttribute('href', '/login');
    });

    test('an invalid link with no reason shows a general message', async () => {
      tutorApplicationsAPI.verifyInvite.mockRejectedValue({});
      renderPage();

      expect(await screen.findByText('This invite link is invalid.')).toBeInTheDocument();
    });
  });

  describe('the form', () => {
    test('welcomes a known invitee by name, without asking for their name', async () => {
      await renderAndWait();

      expect(screen.getByRole('heading', { name: 'Welcome, Alice Smith!' })).toBeInTheDocument();
      expect(screen.getByText('Set a password to activate your tutor account for alice@example.com.')).toBeInTheDocument();
      expect(screen.queryByText('First name')).not.toBeInTheDocument();
    });

    test('asks a new invitee for their name', async () => {
      tutorApplicationsAPI.verifyInvite.mockResolvedValue(newInvitee);
      await renderAndWait();

      expect(screen.getByRole('heading', { name: 'Welcome to Sessioneer!' })).toBeInTheDocument();
      expect(input('First name')).toBeInTheDocument();
      expect(input('Last name')).toBeInTheDocument();
    });
  });

  describe('checking answers', () => {
    test('a new invitee must give their first and last name', async () => {
      tutorApplicationsAPI.verifyInvite.mockResolvedValue(newInvitee);
      await renderAndWait();
      await userEvent.type(input('First name'), 'Jo');
      await fillPasswords('secret1');
      submitForm();

      expect(screen.getByText('First name and last name are required.')).toBeInTheDocument();
      expect(tutorApplicationsAPI.acceptInvite).not.toHaveBeenCalled();
    });

    test('the password must be at least 6 characters', async () => {
      await renderAndWait();
      await fillPasswords('abc');
      submitForm();

      expect(screen.getByText('Password must be at least 6 characters.')).toBeInTheDocument();
      expect(tutorApplicationsAPI.acceptInvite).not.toHaveBeenCalled();
    });

    test('the two passwords must match', async () => {
      await renderAndWait();
      await fillPasswords('secret1', 'secret2');
      submitForm();

      expect(screen.getByText("Passwords don't match.")).toBeInTheDocument();
      expect(tutorApplicationsAPI.acceptInvite).not.toHaveBeenCalled();
    });
  });

  describe('activating the account', () => {
    test('creates the account, then goes to the login page', async () => {
      await renderAndWait();
      await fillPasswords('secret1');
      submitForm();

      expect(tutorApplicationsAPI.acceptInvite).toHaveBeenCalledWith('tok-123', 'secret1', { firstName: '', lastName: '' });
      expect(await screen.findByRole('heading', { name: 'Account created!' })).toBeInTheDocument();
      expect(mockNavigate).not.toHaveBeenCalled(); // waits a moment first

      runRedirectTimer();
      expect(mockNavigate).toHaveBeenCalledWith('/login');
    });

    test('sends a new invitee\'s name, with extra spaces trimmed', async () => {
      tutorApplicationsAPI.verifyInvite.mockResolvedValue(newInvitee);
      await renderAndWait();
      await userEvent.type(input('First name'), '  Jo  ');
      await userEvent.type(input('Last name'), ' Bloggs ');
      await fillPasswords('secret1');
      submitForm();

      await waitFor(() => expect(tutorApplicationsAPI.acceptInvite).toHaveBeenCalledWith(
        'tok-123', 'secret1', { firstName: 'Jo', lastName: 'Bloggs' }
      ));
    });

    test('shows "Creating account..." while saving', async () => {
      tutorApplicationsAPI.acceptInvite.mockReturnValue(new Promise(() => {}));
      await renderAndWait();
      await fillPasswords('secret1');
      submitForm();

      expect(await screen.findByRole('button', { name: 'Creating account...' })).toBeDisabled();
    });

    test('shows the error and keeps the form if activation fails', async () => {
      tutorApplicationsAPI.acceptInvite.mockRejectedValue(new Error('This invite has already been used.'));
      await renderAndWait();
      await fillPasswords('secret1');
      submitForm();

      expect(await screen.findByText('This invite has already been used.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Set Password & Activate Account' })).toBeEnabled();
      expect(mockNavigate).not.toHaveBeenCalled();
    });
  });
});