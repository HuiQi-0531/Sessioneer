// Admins change their own password on the Settings page.
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AdminSettings from './AdminSettings';
import { profileAPI } from '../config/api';

jest.mock('./AdminShell', () => ({ children }) => <div>{children}</div>);
jest.mock('../config/api', () => ({ profileAPI: { changePassword: jest.fn() } }));

const fill = (current, next, confirm) => {
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: current } });
  fireEvent.change(screen.getByLabelText(/^New password/), { target: { value: next } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: confirm } });
  fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
};

beforeEach(() => jest.clearAllMocks());

test('a valid new password is saved and the form is cleared', async () => {
  profileAPI.changePassword.mockResolvedValue({ success: true });
  render(<AdminSettings />);
  fill('OldPass1', 'NewPass2026', 'NewPass2026');
  expect(await screen.findByText(/Password updated/)).toBeInTheDocument();
  expect(profileAPI.changePassword).toHaveBeenCalledWith('OldPass1', 'NewPass2026');
  expect(screen.getByLabelText('Current password')).toHaveValue('');
});

test('a weak or mismatched password is stopped before calling the server', () => {
  render(<AdminSettings />);
  fill('OldPass1', 'weak', 'weak');
  expect(screen.getByRole('alert')).toHaveTextContent(/at least 8 characters/);
  fill('OldPass1', 'NewPass2026', 'NewPass2027');
  expect(screen.getByRole('alert')).toHaveTextContent(/don't match/);
  expect(profileAPI.changePassword).not.toHaveBeenCalled();
});

test('a wrong current password shows the server message', async () => {
  profileAPI.changePassword.mockRejectedValue(new Error('Current password is incorrect'));
  render(<AdminSettings />);
  fill('Wrong1234', 'NewPass2026', 'NewPass2026');
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Current password is incorrect'));
});