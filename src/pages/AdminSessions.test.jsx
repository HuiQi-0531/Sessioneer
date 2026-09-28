import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AdminSessions from './AdminSessions';
import { adminAPI } from '../config/api';

jest.mock('./AdminShell', () => ({ children }) => <div>{children}</div>);
jest.mock('../config/api', () => ({
  adminAPI: {
    getSessions: jest.fn(),
    getUnits: jest.fn(),
    getSessionAssignments: jest.fn(),
    assignSessionTutor: jest.fn(),
    unassignSessionTutor: jest.fn(),
    deleteSession: jest.fn()
  }
}));

const session = {
  id: '11111111-1111-1111-1111-111111111111',
  unitId: '33333333-3333-3333-3333-333333333333',
  unitCode: 'IFN501',
  unitName: 'Digital Future',
  semester: 'Semester 2',
  year: 2027,
  day: 'MON',
  startTime: '10:00:00',
  endTime: '11:00:00',
  location: 'GP-P-419',
  campus: 'GP',
  sessionType: 'Tutorial',
  capacity: 25,
  requiredTutors: 1,
  status: 'Confirmed',
  assignedTutorCount: 0,
  assignedTutors: '',
  tutorConfirmationState: 'Unassigned',
  scheduleLocked: false
};

beforeEach(() => {
  jest.clearAllMocks();
  adminAPI.getSessions.mockResolvedValue([session]);
  adminAPI.getUnits.mockResolvedValue([
    { id: session.unitId, unitCode: 'IFN501', unitName: 'Digital Future', semester: 'Semester 2', year: 2027 },
    { id: '4', unitCode: 'CAB201', semester: 'Semester 2', year: 2026 },
    { id: '5', unitCode: 'CAB202', semester: 'Semester 1', year: 2027 },
    { id: '6', unitCode: 'CAB203', semester: 'Summer', year: 2027 }
  ]);
  adminAPI.getSessionAssignments.mockResolvedValue({
    scheduleLocked: false,
    requiredTutors: 1,
    assigned: [],
    candidates: [{ id: '22222222-2222-2222-2222-222222222222', name: 'Taylor Staff', email: 'taylor@example.com', role: 'tutor' }]
  });
  adminAPI.assignSessionTutor.mockResolvedValue({ success: true });
});

test('sorts semesters by year and term rather than label text', async () => {
  render(<AdminSessions />);
  await screen.findByText('IFN501 · Digital Future');

  const terms = within(screen.getByLabelText('Semester filter'))
    .getAllByRole('option')
    .map(option => option.textContent);
  expect(terms).toEqual([
    'All semesters', 'Summer, 2027', 'Semester 2, 2027',
    'Semester 1, 2027', 'Semester 2, 2026'
  ]);
  expect(screen.getByRole('button', { name: 'Modify' })).toHaveClass('admin-action-btn');
  expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('admin-action-btn');
});

test('opens tutor management from Modify and assigns an eligible staff member', async () => {
  render(<AdminSessions />);
  fireEvent.click(await screen.findByRole('button', { name: 'Modify' }));
  fireEvent.click(screen.getByRole('tab', { name: 'Tutors' }));

  await screen.findByText('Assigned staff');
  expect(screen.queryByPlaceholderText('Search unit staff')).not.toBeInTheDocument();
  expect(within(screen.getByLabelText('Staff to assign')).getByRole('option', { name: 'Taylor Staff · Tutor' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Staff to assign'), {
    target: { value: '22222222-2222-2222-2222-222222222222' }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Assign' }));

  await waitFor(() => expect(adminAPI.assignSessionTutor).toHaveBeenCalledWith(
    session.id, '22222222-2222-2222-2222-222222222222'
  ));
  await waitFor(() => expect(adminAPI.getSessionAssignments).toHaveBeenCalledTimes(2));
});

test('sends an assigned session to tutor management instead of offering deletion', async () => {
  adminAPI.getSessions.mockResolvedValue([{ ...session, assignedTutorCount: 1, assignedTutors: 'Taylor Staff' }]);
  render(<AdminSessions />);
  fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));

  expect(screen.getByText(/Unassign them before deleting/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Delete session' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Manage tutors' }));
  expect(screen.getByRole('tab', { name: 'Tutors' })).toHaveAttribute('aria-selected', 'true');
  await screen.findByText('Assigned staff');
});
