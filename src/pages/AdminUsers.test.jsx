import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AdminUsers from './AdminUsers';
import { adminAPI } from '../config/api';

jest.mock('./AdminShell', () => ({ children, actions }) => <div>{actions}{children}</div>);
jest.mock('../config/api', () => ({
  adminAPI: {
    getUsers: jest.fn(),
    getUnits: jest.fn(),
    getUserUnits: jest.fn(),
    addUserUnit: jest.fn()
  }
}));

const user = { id: 'user1', firstName: 'Alex', lastName: 'Coordinator', displayName: 'Alex Coordinator', email: 'alex@example.test', role: 'coordinator', accountStatus: 'active', unitCount: 0, unitSummary: '' };
const units = [
  { id: 'unit1', unitCode: 'CAB201', unitName: 'Programming Principles', semester: 'Semester 2', year: 2026 },
  { id: 'unit2', unitCode: 'CAB201', unitName: 'Programming Principles', semester: 'Semester 2', year: 2027 }
];

beforeEach(() => {
  jest.clearAllMocks();
  adminAPI.getUsers.mockResolvedValue([user]);
  adminAPI.getUnits.mockResolvedValue(units);
  adminAPI.getUserUnits.mockResolvedValue([]);
  adminAPI.addUserUnit.mockResolvedValue({
    access: { unitId: 'unit2', unitCode: 'CAB201', unitName: 'Programming Principles', semester: 'Semester 2', year: 2027, role: 'super_tutor', assignedSessionCount: 0 }
  });
});

const openAddAccess = async () => {
  render(<AdminUsers />);
  fireEvent.click(await screen.findByRole('button', { name: 'Units', exact: true }));
  const manageDialog = screen.getByRole('dialog', { name: 'Manage Unit Access' });
  await within(manageDialog).findByText('No unit access yet.');
  fireEvent.click(within(manageDialog).getByRole('button', { name: 'Add Unit' }));
  return { manageDialog, addDialog: screen.getByRole('dialog', { name: 'Add Unit Access' }) };
};

test('opens Add Unit Access outside the clipped parent dialog and makes the parent inert', async () => {
  const { manageDialog, addDialog } = await openAddAccess();
  expect(manageDialog.contains(addDialog)).toBe(false);
  expect(manageDialog).toHaveAttribute('inert');
  expect(manageDialog).toHaveAttribute('aria-hidden', 'true');
  expect(within(addDialog).getByRole('heading', { name: 'Add Unit Access' })).toBeInTheDocument();
  expect(within(addDialog).getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  expect(within(addDialog).getByRole('button', { name: 'Add Access' })).toBeInTheDocument();
});

test('cancel returns to the existing Manage Unit Access dialog without making changes', async () => {
  const { manageDialog, addDialog } = await openAddAccess();
  fireEvent.click(within(addDialog).getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog', { name: 'Add Unit Access' })).not.toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: 'Manage Unit Access' })).toBe(manageDialog);
  expect(manageDialog).not.toHaveAttribute('inert');
  expect(adminAPI.addUserUnit).not.toHaveBeenCalled();
});

test('searches by semester year and submits the selected offering with its access role', async () => {
  const { addDialog } = await openAddAccess();
  fireEvent.change(within(addDialog).getByPlaceholderText('Search code, name, semester or year'), { target: { value: '2027' } });
  const options = within(within(addDialog).getByRole('listbox', { name: 'Units' })).getAllByRole('button');
  expect(options).toHaveLength(1);
  expect(options[0]).toHaveTextContent('Semester 2, 2027');
  fireEvent.click(options[0]);
  fireEvent.change(within(addDialog).getByLabelText('Access'), { target: { value: 'super_tutor' } });
  fireEvent.click(within(addDialog).getByRole('button', { name: 'Add Access' }));
  await waitFor(() => expect(adminAPI.addUserUnit).toHaveBeenCalledWith(user.id, 'unit2', 'super_tutor'));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Add Unit Access' })).not.toBeInTheDocument());
  expect(screen.getByRole('dialog', { name: 'Manage Unit Access' })).toHaveTextContent('Super Tutor');
});

test('shows save errors inside the foreground dialog and leaves it open', async () => {
  adminAPI.addUserUnit.mockRejectedValue(new Error('This user already has coordinator access for this unit.'));
  const { addDialog } = await openAddAccess();
  fireEvent.click(within(addDialog).getByRole('button', { name: 'Add Access' }));
  const error = await within(addDialog).findByText('This user already has coordinator access for this unit.');
  expect(error).toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: 'Add Unit Access' })).toBe(addDialog);
});
