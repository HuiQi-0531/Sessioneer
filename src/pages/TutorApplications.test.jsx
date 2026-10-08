import React from 'react';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import TutorApplications from './TutorApplications';
import { tutorApplicationsAPI } from '../config/api';
import { useActiveUnit } from '../context/ActiveUnitContext';

// ---------- Mocks ----------

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('../config/api', () => ({
  tutorApplicationsAPI: {
    getAll: jest.fn(),
    invite: jest.fn(),
    downloadResume: jest.fn(),
    directInvite: jest.fn(),
  },
}));

jest.mock('../context/ActiveUnitContext', () => ({ useActiveUnit: jest.fn() }));
jest.mock('../components/UCSidebar', () => () => null);
jest.mock('../components/UCPageHeader', () => ({ title }) => title);

// ---------- Test data ----------

const unit = { id: 'u1', unitCode: 'FIT1001' };

// Pending, full profile with custom form answers and a resume
const alice = {
  id: 'a1', fullName: 'Alice Smith', email: 'alice@uni.edu', status: 'pending',
  phoneNumber: '0400 000 001', workExperience: 'Tutored FIT1001', maximumHours: 10, contractType: 'Casual',
  customAnswers: { preferred_campus: 'GP', languages: ['English', 'Mandarin'], empty_one: '' },
  appliedAt: '2026-09-20T12:00:00Z', hasResume: true, resumeFilename: 'alice.pdf',
};
// Pending, almost nothing filled in
const unnamed = { id: 'a2', email: 'new@uni.edu', status: 'pending', appliedAt: '2026-09-21T12:00:00Z' };
// Invited as a super tutor, with a link
const bob = {
  id: 'a3', fullName: 'Bob Lee', email: 'bob@uni.edu', status: 'invited',
  invitedRole: 'super_tutor', inviteToken: 'tok-bob', appliedAt: '2026-09-15T12:00:00Z',
};
// Invited as a tutor, no link available
const cara = { id: 'a4', name: 'Cara Diaz', status: 'invited', invitedRole: 'tutor', appliedAt: '2026-09-14T12:00:00Z' };
// Joined
const dan = { id: 'a5', fullName: 'Dan Wu', status: 'accepted', appliedAt: '2026-09-10T12:00:00Z' };

const allApplications = [alice, unnamed, bob, cara, dan];

// ---------- Helpers ----------

const renderAndWait = async () => {
  render(<TutorApplications />);
  await screen.findByText('Alice Smith');
};

const card = (name) => screen.getByText(name).closest('.tap-card');
const tab = (name) => screen.getByRole('button', { name });
const modal = () => within(document.querySelector('.tap-modal-content'));

const openInviteFor = async (name) => {
  await userEvent.click(within(card(name)).getByRole('button', { name: 'Invite' }));
  return modal();
};

const openDirectInvite = async () => {
  await userEvent.click(screen.getByRole('button', { name: '+ Invite a known tutor directly' }));
  return modal();
};

// ---------- Setup ----------

beforeEach(() => {
  // jsdom has no clipboard, so give it a fake one we can check
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: jest.fn().mockResolvedValue() },
    configurable: true,
    writable: true,
  });

  mockNavigate.mockReset();
  useActiveUnit.mockReturnValue({ activeUnit: unit, isLoading: false });

  tutorApplicationsAPI.getAll.mockResolvedValue(allApplications);
  tutorApplicationsAPI.invite.mockResolvedValue({ fullName: 'Alice Smith', inviteToken: 'tok-new' });
  tutorApplicationsAPI.downloadResume.mockResolvedValue({});
  tutorApplicationsAPI.directInvite.mockResolvedValue({ email: 'new@example.com', inviteToken: 'tok-direct' });

  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(window, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------- Tests ----------

describe('TutorApplications', () => {
  describe('loading', () => {
    test('shows a loading message while applications load', () => {
      tutorApplicationsAPI.getAll.mockReturnValue(new Promise(() => {}));
      render(<TutorApplications />);
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    test('waits for the unit to finish loading before fetching', () => {
      useActiveUnit.mockReturnValue({ activeUnit: unit, isLoading: true });
      render(<TutorApplications />);
      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(tutorApplicationsAPI.getAll).not.toHaveBeenCalled();
    });

    test('shows an empty list when no unit is selected', async () => {
      useActiveUnit.mockReturnValue({ activeUnit: null, isLoading: false });
      render(<TutorApplications />);
      expect(await screen.findByText('No pending applications.')).toBeInTheDocument();
      expect(tutorApplicationsAPI.getAll).not.toHaveBeenCalled();
    });
  });

  describe('tabs and cards', () => {
    test('loads applications for the unit and counts them per tab', async () => {
      await renderAndWait();

      expect(tutorApplicationsAPI.getAll).toHaveBeenCalledWith('u1');
      expect(tab(/^pending/i)).toHaveClass('active');
      expect(within(tab(/^pending/i)).getByText('2')).toBeInTheDocument();
      expect(within(tab(/^invited/i)).getByText('2')).toBeInTheDocument();
      expect(within(tab(/^joined/i)).getByText('1')).toBeInTheDocument();
    });

    test('a pending card shows the applicant\'s details and form answers', async () => {
      await renderAndWait();
      const c = within(card('Alice Smith'));

      expect(c.getByText('alice@uni.edu')).toBeInTheDocument();
      expect(c.getByText('pending')).toHaveClass('tap-badge', 'pending');
      expect(c.getByText('0400 000 001')).toBeInTheDocument();
      expect(c.getByText('Tutored FIT1001')).toBeInTheDocument();
      expect(c.getByText('10 hrs/week')).toBeInTheDocument();
      expect(c.getByText('Casual')).toBeInTheDocument();
      expect(c.getByText('Preferred campus')).toBeInTheDocument();
      expect(c.getByText('English, Mandarin')).toBeInTheDocument();
      expect(c.queryByText('Empty one')).not.toBeInTheDocument(); // blank answers are hidden
      expect(c.getByText('Sep 20, 2026')).toBeInTheDocument();
      expect(c.getByRole('button', { name: 'View Resume' })).toBeInTheDocument();
    });

    test('a card with few details shows a placeholder name and no resume button', async () => {
      await renderAndWait();
      const c = within(card('Pending profile'));

      expect(c.getByText('new@uni.edu')).toBeInTheDocument();
      expect(c.queryByText('Phone')).not.toBeInTheDocument();
      expect(c.queryByRole('button', { name: 'View Resume' })).not.toBeInTheDocument();
      expect(c.getByRole('button', { name: 'Invite' })).toBeInTheDocument();
    });

    test('the Invited tab shows each invite\'s role and a copy link when available', async () => {
      await renderAndWait();
      await userEvent.click(tab(/^invited/i));

      expect(within(card('Bob Lee')).getByText('Invited as Super Tutor')).toBeInTheDocument();
      expect(within(card('Bob Lee')).getByRole('button', { name: 'Copy Link' })).toBeInTheDocument();

      expect(within(card('Cara Diaz')).getByText('Invited as Tutor')).toBeInTheDocument();
      expect(within(card('Cara Diaz')).queryByRole('button', { name: 'Copy Link' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Invite' })).not.toBeInTheDocument();
    });

    test('the Joined tab shows people who have joined', async () => {
      await renderAndWait();
      await userEvent.click(tab(/^joined/i));

      expect(within(card('Dan Wu')).getByText('accepted')).toHaveClass('accepted');
      expect(screen.queryByText('Alice Smith')).not.toBeInTheDocument();
    });

    test('each tab has its own empty message', async () => {
      tutorApplicationsAPI.getAll.mockResolvedValue([]);
      render(<TutorApplications />);

      expect(await screen.findByText('No pending applications.')).toBeInTheDocument();
      await userEvent.click(tab(/^invited/i));
      expect(screen.getByText('No pending invites.')).toBeInTheDocument();
      await userEvent.click(tab(/^joined/i));
      expect(screen.getByText('No one has joined yet.')).toBeInTheDocument();
    });
  });

  describe('resumes', () => {
    test('"View Resume" downloads the applicant\'s resume', async () => {
      await renderAndWait();
      await userEvent.click(within(card('Alice Smith')).getByRole('button', { name: 'View Resume' }));
      expect(tutorApplicationsAPI.downloadResume).toHaveBeenCalledWith('a1', 'alice.pdf');
    });

    test('shows an alert if the download fails', async () => {
      tutorApplicationsAPI.downloadResume.mockRejectedValue(new Error('Resume not found'));
      await renderAndWait();
      await userEvent.click(within(card('Alice Smith')).getByRole('button', { name: 'View Resume' }));

      await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Resume not found'));
    });
  });

  describe('inviting an applicant', () => {
    test('"Invite" asks which role to invite them as', async () => {
      await renderAndWait();
      const m = await openInviteFor('Alice Smith');

      expect(m.getByRole('heading', { name: 'Invite Alice Smith' })).toBeInTheDocument();
      expect(m.getByText('Choose what role to invite them as for FIT1001.')).toBeInTheDocument();
      expect(m.getByRole('combobox')).toHaveValue('tutor');
    });

    test('generating an invite shows the activation link and reloads', async () => {
      await renderAndWait();
      const m = await openInviteFor('Alice Smith');
      await userEvent.selectOptions(m.getByRole('combobox'), 'super_tutor');
      await userEvent.click(m.getByRole('button', { name: 'Generate Invite Link' }));

      expect(tutorApplicationsAPI.invite).toHaveBeenCalledWith('a1', 'u1', 'super_tutor');
      expect(await screen.findByRole('heading', { name: 'Invite link ready' })).toBeInTheDocument();
      expect(modal().getByText(/send it to Alice Smith yourself/)).toBeInTheDocument();
      expect(modal().getByRole('textbox')).toHaveValue('http://localhost/activate/tok-new');
      expect(tutorApplicationsAPI.getAll).toHaveBeenCalledTimes(2);
    });

    test('the link popup can copy the link and be closed', async () => {
      await renderAndWait();
      const m = await openInviteFor('Alice Smith');
      await userEvent.click(m.getByRole('button', { name: 'Generate Invite Link' }));
      await screen.findByRole('heading', { name: 'Invite link ready' });

      await userEvent.click(modal().getByRole('button', { name: 'Copy' }));
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://localhost/activate/tok-new');

      await userEvent.click(modal().getByRole('button', { name: 'Done' }));
      expect(screen.queryByRole('heading', { name: 'Invite link ready' })).not.toBeInTheDocument();
    });

    test('shows an alert and keeps the popup open if inviting fails', async () => {
      tutorApplicationsAPI.invite.mockRejectedValue(new Error('Applicant already invited'));
      await renderAndWait();
      const m = await openInviteFor('Alice Smith');
      await userEvent.click(m.getByRole('button', { name: 'Generate Invite Link' }));

      await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Applicant already invited'));
      expect(screen.getByRole('heading', { name: 'Invite Alice Smith' })).toBeInTheDocument();
    });

    test('shows "Generating..." while the invite is being created', async () => {
      tutorApplicationsAPI.invite.mockReturnValue(new Promise(() => {}));
      await renderAndWait();
      const m = await openInviteFor('Alice Smith');
      await userEvent.click(m.getByRole('button', { name: 'Generate Invite Link' }));

      expect(m.getByRole('button', { name: 'Generating...' })).toBeDisabled();
    });

    test('clicking outside the popup closes it', async () => {
      await renderAndWait();
      await openInviteFor('Alice Smith');
      await userEvent.click(document.querySelector('.tap-modal-overlay'));

      expect(screen.queryByRole('heading', { name: 'Invite Alice Smith' })).not.toBeInTheDocument();
      expect(tutorApplicationsAPI.invite).not.toHaveBeenCalled();
    });

    test('"Copy Link" on an invited card copies their activation link', async () => {
      await renderAndWait();
      await userEvent.click(tab(/^invited/i));
      await userEvent.click(within(card('Bob Lee')).getByRole('button', { name: 'Copy Link' }));

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://localhost/activate/tok-bob');
      expect(within(card('Bob Lee')).getByRole('button', { name: 'Copied!' })).toBeInTheDocument();
    });
  });

  describe('application link menu', () => {
    test('"Copy link" copies the public application link', async () => {
      await renderAndWait();
      await userEvent.click(screen.getByRole('button', { name: /application link/i }));
      await userEvent.click(screen.getByRole('button', { name: 'Copy link' }));

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://localhost/apply?unitId=u1');
      expect(screen.getByRole('button', { name: /link copied/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Copy link' })).not.toBeInTheDocument();
    });

    test('"Edit application form" opens the form editor', async () => {
      await renderAndWait();
      await userEvent.click(screen.getByRole('button', { name: /application link/i }));
      await userEvent.click(screen.getByRole('button', { name: 'Edit application form' }));

      expect(mockNavigate).toHaveBeenCalledWith('/tutor-applications/form');
    });

    test('clicking outside closes the menu', async () => {
      await renderAndWait();
      await userEvent.click(screen.getByRole('button', { name: /application link/i }));
      expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();

      fireEvent.mouseDown(document.body);

      expect(screen.queryByRole('button', { name: 'Copy link' })).not.toBeInTheDocument();
    });
  });

  describe('inviting a known tutor directly', () => {
    test('an email is required', async () => {
      await renderAndWait();
      const m = await openDirectInvite();
      await userEvent.click(m.getByRole('button', { name: 'Create Invite Link' }));

      expect(m.getByText('Tutor email is required.')).toBeInTheDocument();
      expect(tutorApplicationsAPI.directInvite).not.toHaveBeenCalled();
    });

    test('a new user gets an activation link', async () => {
      await renderAndWait();
      const m = await openDirectInvite();
      await userEvent.type(m.getByRole('textbox'), '  new@example.com  ');
      await userEvent.click(m.getByRole('button', { name: 'Create Invite Link' }));

      expect(tutorApplicationsAPI.directInvite).toHaveBeenCalledWith('new@example.com', 'u1', 'tutor');
      expect(await screen.findByRole('heading', { name: 'Invite link ready' })).toBeInTheDocument();
      expect(modal().getByText(/send it to new@example.com yourself/)).toBeInTheDocument();
      expect(modal().getByRole('textbox')).toHaveValue('http://localhost/activate/tok-direct');
    });

    test('an existing user is added straight away', async () => {
      tutorApplicationsAPI.directInvite.mockResolvedValue({
        addedExistingUser: true, fullName: 'Jo Bloggs', email: 'jo@example.com',
      });
      await renderAndWait();
      const m = await openDirectInvite();
      await userEvent.type(m.getByRole('textbox'), 'jo@example.com');
      await userEvent.selectOptions(m.getByRole('combobox'), 'super_tutor');
      await userEvent.click(m.getByRole('button', { name: 'Create Invite Link' }));

      expect(tutorApplicationsAPI.directInvite).toHaveBeenCalledWith('jo@example.com', 'u1', 'super_tutor');
      expect(await screen.findByRole('heading', { name: 'Tutor added' })).toBeInTheDocument();
      expect(screen.getByText('Jo Bloggs has been added as a Super Tutor for FIT1001.')).toBeInTheDocument();
    });

    test('says so if they are already a tutor for this unit', async () => {
      tutorApplicationsAPI.directInvite.mockResolvedValue({
        addedExistingUser: true, alreadyTutor: true, email: 'jo@example.com',
      });
      await renderAndWait();
      const m = await openDirectInvite();
      await userEvent.type(m.getByRole('textbox'), 'jo@example.com');
      await userEvent.click(m.getByRole('button', { name: 'Create Invite Link' }));

      expect(await screen.findByRole('heading', { name: 'Already added' })).toBeInTheDocument();
      expect(screen.getByText('jo@example.com is already a tutor for FIT1001.')).toBeInTheDocument();
    });

    test('shows the error and keeps the form open if inviting fails', async () => {
      tutorApplicationsAPI.directInvite.mockRejectedValue(new Error('Email looks invalid'));
      await renderAndWait();
      const m = await openDirectInvite();
      await userEvent.type(m.getByRole('textbox'), 'oops');
      await userEvent.click(m.getByRole('button', { name: 'Create Invite Link' }));

      expect(await m.findByText('Email looks invalid')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Invite a known tutor' })).toBeInTheDocument();
    });

    test('shows "Creating..." while the invite is being created', async () => {
      tutorApplicationsAPI.directInvite.mockReturnValue(new Promise(() => {}));
      await renderAndWait();
      const m = await openDirectInvite();
      await userEvent.type(m.getByRole('textbox'), 'jo@example.com');
      await userEvent.click(m.getByRole('button', { name: 'Create Invite Link' }));

      expect(m.getByRole('button', { name: 'Creating...' })).toBeDisabled();
    });
  });
});