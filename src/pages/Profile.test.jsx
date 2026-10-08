import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import Profile from './Profile';
import { profileAPI } from '../config/api';
import { useActiveUnit } from '../context/ActiveUnitContext';

// ---------- Mocks ----------

jest.mock('../config/api', () => ({
  profileAPI: {
    get: jest.fn(),
    update: jest.fn(),
    uploadAvatar: jest.fn(),
    changePassword: jest.fn(),
    updateNotifications: jest.fn(),
  },
}));

jest.mock('../context/ActiveUnitContext', () => ({ useActiveUnit: jest.fn() }));
jest.mock('../components/UCSidebar', () => () => 'UC Sidebar');
jest.mock('../components/TutorSidebar', () => () => 'Tutor Sidebar');
jest.mock('../components/UCPageHeader', () => ({ title }) => title);
jest.mock('../utils/userName', () => ({
  getAvatarLetter: (p) => ((p && p.firstName) || '?').charAt(0),
  getDisplayName: (p) => (p ? `${p.firstName || ''} ${p.lastName || ''}`.trim() : ''),
}));

// The real 3D badge uses three.js, which doesn't run in tests, so use a simple stand-in.
// Setting mockLanyardShouldThrow = true makes it crash, to test the fallback message.
let mockLanyardShouldThrow = false;
jest.mock('../components/ProfileLanyard', () => ({
  __esModule: true,
  default: ({ roleLabel }) => {
    if (mockLanyardShouldThrow) throw new Error('WebGL not supported');
    return `Lanyard: ${roleLabel}`;
  },
}));

// ---------- Test data ----------

const profile = {
  firstName: 'Alice', lastName: 'Smith', email: 'alice@uni.edu', phoneNumber: '0400 000 001',
  workExperience: '2 years tutoring', maximumHours: 10, contractType: 'Casual',
  notifySessionUpdates: true, notifyRequestUpdates: false, avatarUrl: null,
};

const updatedProfile = {
  ...profile, firstName: 'Alicia', name: 'Alicia Smith', displayName: 'Alicia S',
  avatarUrl: 'https://example.com/new-avatar.png',
};

// ---------- Helpers ----------

const renderAndWait = async () => {
  render(<Profile />);
  await screen.findByText('Profile Details');
};

// Inputs sit in a .pf-field box after their label
const field = (label) =>
  Array.from(document.querySelectorAll('.pf-field'))
    .find(box => box.querySelector('label').textContent === label)
    ?.querySelector('input, select');

const toggle = (label) =>
  Array.from(document.querySelectorAll('.pf-toggle-row'))
    .find(row => row.querySelector('.pf-toggle-label').textContent === label)
    .querySelector('input');

const avatarInput = () => document.querySelector('.pf-avatar-upload input[type="file"]');
const uploadAvatar = (file) => fireEvent.change(avatarInput(), { target: { files: [file] } });

const savedUser = () => JSON.parse(localStorage.getItem('currentUser'));

// ---------- Setup ----------

beforeEach(() => {
  mockLanyardShouldThrow = false;
  localStorage.clear();
  localStorage.setItem('currentUser', JSON.stringify({ id: 'me', role: 'coordinator', name: 'Alice Smith' }));
  useActiveUnit.mockReturnValue({ activeViewRole: null });

  profileAPI.get.mockResolvedValue(profile);
  profileAPI.update.mockResolvedValue(updatedProfile);
  profileAPI.uploadAvatar.mockResolvedValue(updatedProfile);
  profileAPI.changePassword.mockResolvedValue({});
  profileAPI.updateNotifications.mockResolvedValue({});

  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(window, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------- Tests ----------

describe('Profile', () => {
  describe('showing the profile', () => {
    test('shows a loading message while the profile loads', () => {
      profileAPI.get.mockReturnValue(new Promise(() => {}));
      render(<Profile />);
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    test('a coordinator sees the coordinator sidebar and no tutor fields', async () => {
      await renderAndWait();

      expect(screen.getByText('UC Sidebar')).toBeInTheDocument();
      expect(screen.getByText('Unit Coordinator')).toBeInTheDocument();
      expect(field('Work experience')).toBeUndefined();
      expect(field('Maximum hours / week')).toBeUndefined();
    });

    test('a tutor sees the tutor sidebar and their tutor details', async () => {
      useActiveUnit.mockReturnValue({ activeViewRole: 'tutor' });
      await renderAndWait();

      expect(screen.getByText('Tutor Sidebar')).toBeInTheDocument();
      expect(screen.getByText('Tutor')).toBeInTheDocument();
      expect(field('Work experience')).toHaveValue('2 years tutoring');
      expect(field('Maximum hours / week')).toHaveValue(10);
      expect(field('Contract type')).toHaveValue('Casual');
    });

    test('uses the saved user\'s role when no view role is chosen', async () => {
      localStorage.setItem('currentUser', JSON.stringify({ id: 'me', role: 'tutor' }));
      await renderAndWait();
      expect(screen.getByText('Tutor Sidebar')).toBeInTheDocument();
    });

    test('fills in the form, with the email locked', async () => {
      await renderAndWait();

      expect(field('Email')).toHaveValue('alice@uni.edu');
      expect(field('Email')).toBeDisabled();
      expect(field('First name')).toHaveValue('Alice');
      expect(field('Last name')).toHaveValue('Smith');
      expect(field('Phone number')).toHaveValue('0400 000 001');
      expect(screen.getByText('Alice Smith', { selector: '.pf-avatar-name' })).toBeInTheDocument();
    });

    test('uses the old "name" field when there is no first name', async () => {
      profileAPI.get.mockResolvedValue({ email: 'legacy@uni.edu', name: 'Legacy Name' });
      await renderAndWait();
      expect(field('First name')).toHaveValue('Legacy Name');
    });

    test('shows the profile picture, or the first letter when there is none', async () => {
      profileAPI.get.mockResolvedValue({ ...profile, avatarUrl: 'https://example.com/me.png' });
      const { unmount } = render(<Profile />);
      expect(await screen.findByRole('img', { name: 'Alice Smith' })).toHaveAttribute('src', 'https://example.com/me.png');
      unmount();

      profileAPI.get.mockResolvedValue(profile);
      await renderAndWait();
      expect(screen.queryByRole('img')).not.toBeInTheDocument();
      expect(document.querySelector('.pf-avatar-upload')).toHaveTextContent('A');
    });
  });

  describe('3D badge', () => {
    test('shows the badge with the user\'s role', async () => {
      await renderAndWait();
      expect(await screen.findByText('Lanyard: Unit Coordinator')).toBeInTheDocument();
    });

    test('shows a friendly message if the badge cannot load', async () => {
      mockLanyardShouldThrow = true;
      await renderAndWait();

      expect(await screen.findByText('3D badge could not load on this browser.')).toBeInTheDocument();
      expect(screen.getByText('Profile Details')).toBeInTheDocument(); // the rest of the page still works
    });
  });

  describe('saving profile details', () => {
    test('saves the changes and updates the saved user', async () => {
      useActiveUnit.mockReturnValue({ activeViewRole: 'tutor' });
      const userUpdated = jest.fn();
      window.addEventListener('sessioneer-user-updated', userUpdated);
      await renderAndWait();

      await userEvent.clear(field('Phone number'));
      await userEvent.type(field('Phone number'), '0411 111 111');
      await userEvent.clear(field('Maximum hours / week'));
      await userEvent.type(field('Maximum hours / week'), '12');
      await userEvent.selectOptions(field('Contract type'), 'Sessional');
      await userEvent.click(screen.getByRole('button', { name: 'Save Profile' }));

      expect(profileAPI.update).toHaveBeenCalledWith({
        firstName: 'Alice',
        lastName: 'Smith',
        phoneNumber: '0411 111 111',
        workExperience: '2 years tutoring',
        maximumHours: 12,
        contractType: 'Sessional',
      });
      expect(await screen.findByText('Profile updated successfully.')).toHaveClass('pf-success');
      expect(savedUser()).toMatchObject({
        id: 'me', name: 'Alicia Smith', firstName: 'Alicia', displayName: 'Alicia S',
        avatarUrl: 'https://example.com/new-avatar.png',
      });
      expect(userUpdated).toHaveBeenCalled();
      window.removeEventListener('sessioneer-user-updated', userUpdated);
    });

    test('an empty maximum hours is saved as "not set"', async () => {
      useActiveUnit.mockReturnValue({ activeViewRole: 'tutor' });
      await renderAndWait();
      await userEvent.clear(field('Maximum hours / week'));
      await userEvent.click(screen.getByRole('button', { name: 'Save Profile' }));

      expect(profileAPI.update).toHaveBeenCalledWith(expect.objectContaining({ maximumHours: null }));
    });

    test('shows the error if saving fails', async () => {
      profileAPI.update.mockRejectedValue(new Error('Phone number is invalid'));
      await renderAndWait();
      await userEvent.click(screen.getByRole('button', { name: 'Save Profile' }));

      expect(await screen.findByText('Phone number is invalid')).toHaveClass('pf-error');
    });

    test('shows "Saving..." while saving', async () => {
      profileAPI.update.mockReturnValue(new Promise(() => {}));
      await renderAndWait();
      await userEvent.click(screen.getByRole('button', { name: 'Save Profile' }));

      expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
    });
  });

  describe('profile picture', () => {
    test('only image files are accepted', async () => {
      await renderAndWait();
      uploadAvatar(new File(['x'], 'notes.pdf', { type: 'application/pdf' }));

      expect(screen.getByText('Please choose an image file.')).toHaveClass('pf-error');
      expect(profileAPI.uploadAvatar).not.toHaveBeenCalled();
    });

    test('images over 2 MB are rejected', async () => {
      const big = new File(['x'], 'big.png', { type: 'image/png' });
      Object.defineProperty(big, 'size', { value: 3 * 1024 * 1024 });
      await renderAndWait();
      uploadAvatar(big);

      expect(screen.getByText('Please choose an image under 2 MB.')).toBeInTheDocument();
      expect(profileAPI.uploadAvatar).not.toHaveBeenCalled();
    });

    test('uploads a new picture and shows it', async () => {
      const photo = new File(['img'], 'me.png', { type: 'image/png' });
      await renderAndWait();
      uploadAvatar(photo);

      expect(profileAPI.uploadAvatar).toHaveBeenCalledWith(photo);
      expect(await screen.findByText('Profile picture updated successfully.')).toBeInTheDocument();
      expect(document.querySelector('.pf-avatar-img')).toHaveAttribute('src', 'https://example.com/new-avatar.png');
      expect(savedUser().avatarUrl).toBe('https://example.com/new-avatar.png');
    });

    test('shows the error if the upload fails', async () => {
      profileAPI.uploadAvatar.mockRejectedValue(new Error('Upload failed'));
      await renderAndWait();
      uploadAvatar(new File(['img'], 'me.png', { type: 'image/png' }));

      expect(await screen.findByText('Upload failed')).toHaveClass('pf-error');
    });

    test('shows "Uploading..." while the picture uploads', async () => {
      profileAPI.uploadAvatar.mockReturnValue(new Promise(() => {}));
      await renderAndWait();
      uploadAvatar(new File(['img'], 'me.png', { type: 'image/png' }));

      expect(await screen.findByText('Uploading...')).toBeInTheDocument();
      expect(avatarInput()).toBeDisabled();
    });
  });

  describe('changing password', () => {
    const fillPasswords = async (current, next, confirm = next) => {
      if (current) await userEvent.type(field('Current password'), current);
      if (next) await userEvent.type(field('New password'), next);
      if (confirm) await userEvent.type(field('Confirm new password'), confirm);
    };

    test('"Update Password" stays disabled until current and new passwords are filled', async () => {
      await renderAndWait();
      const button = screen.getByRole('button', { name: 'Update Password' });
      expect(button).toBeDisabled();

      await userEvent.type(field('Current password'), 'oldpass');
      expect(button).toBeDisabled();

      await userEvent.type(field('New password'), 'newpass1');
      expect(button).toBeEnabled();
    });

    test('the new password and confirmation must match', async () => {
      await renderAndWait();
      await fillPasswords('oldpass', 'newpass1', 'newpass2');
      await userEvent.click(screen.getByRole('button', { name: 'Update Password' }));

      expect(screen.getByText("New password and confirmation don't match.")).toHaveClass('pf-error');
      expect(profileAPI.changePassword).not.toHaveBeenCalled();
    });

    test('changes the password and clears the fields', async () => {
      await renderAndWait();
      await fillPasswords('oldpass', 'newpass1');
      await userEvent.click(screen.getByRole('button', { name: 'Update Password' }));

      expect(profileAPI.changePassword).toHaveBeenCalledWith('oldpass', 'newpass1');
      expect(await screen.findByText('Password updated successfully.')).toHaveClass('pf-success');
      expect(field('Current password')).toHaveValue('');
      expect(field('New password')).toHaveValue('');
      expect(field('Confirm new password')).toHaveValue('');
    });

    test('shows the error if the password change fails', async () => {
      profileAPI.changePassword.mockRejectedValue(new Error('Current password is incorrect'));
      await renderAndWait();
      await fillPasswords('wrongpass', 'newpass1');
      await userEvent.click(screen.getByRole('button', { name: 'Update Password' }));

      expect(await screen.findByText('Current password is incorrect')).toHaveClass('pf-error');
      expect(field('Current password')).toHaveValue('wrongpass'); // not cleared
    });

    test('shows "Updating..." while saving', async () => {
      profileAPI.changePassword.mockReturnValue(new Promise(() => {}));
      await renderAndWait();
      await fillPasswords('oldpass', 'newpass1');
      await userEvent.click(screen.getByRole('button', { name: 'Update Password' }));

      expect(screen.getByRole('button', { name: 'Updating...' })).toBeDisabled();
    });
  });

  describe('notification settings', () => {
    test('the switches match the saved preferences', async () => {
      await renderAndWait();
      expect(toggle('Schedule & session updates')).toBeChecked();
      expect(toggle('Swap & change requests')).not.toBeChecked();
    });

    test('flipping a switch saves both preferences', async () => {
      await renderAndWait();
      await userEvent.click(toggle('Swap & change requests'));

      expect(profileAPI.updateNotifications).toHaveBeenCalledWith(true, true);
      expect(toggle('Swap & change requests')).toBeChecked();
    });

    test('if saving fails, shows an alert and goes back to the saved settings', async () => {
      profileAPI.updateNotifications.mockRejectedValue(new Error('Server error'));
      await renderAndWait();
      await userEvent.click(toggle('Swap & change requests'));

      await waitFor(() =>
        expect(window.alert).toHaveBeenCalledWith('Failed to save notification preference. Please try again.')
      );
      await waitFor(() => expect(profileAPI.get).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(toggle('Swap & change requests')).not.toBeChecked());
    });
  });
});