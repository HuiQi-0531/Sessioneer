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

test('each session shows its code, and the code is searchable', async () => {
  adminAPI.getSessions.mockResolvedValue([
    { ...session, sessionCode: 'TUT01' },
    { ...session, id: '99999999-9999-9999-9999-999999999999', sessionCode: 'LEC01', sessionType: 'Lecture' }
  ]);
  render(<AdminSessions />);
  expect(await screen.findByText('TUT01')).toBeInTheDocument();
  expect(screen.getByText('LEC01')).toBeInTheDocument();
  fireEvent.change(screen.getByPlaceholderText(/Search sessions/i), { target: { value: 'lec01' } });
  await waitFor(() => expect(screen.queryByText('TUT01')).toBeNull());
  expect(screen.getByText('LEC01')).toBeInTheDocument();
});

test('Modify: the session code field follows the type, and a hand-typed code is kept', async () => {
  const tut3 = { ...session, sessionCode: 'TUT03' };
  adminAPI.getSessions.mockResolvedValue([
    tut3,
    { ...session, id: 'p1', sessionCode: 'PRC01', sessionType: 'Practical' }
  ]);
  render(<AdminSessions />);
  const row = (await screen.findByText('TUT03')).closest('tr');
  fireEvent.click(within(row).getByRole('button', { name: /Modify/ }));
  const code = await screen.findByLabelText(/Session code/);
  const type = screen.getByLabelText(/^Type/);
  expect(code).toHaveValue('TUT03');
  fireEvent.change(type, { target: { value: 'Practical' } });
  expect(code).toHaveValue('PRC02');          // PRC01 is taken in this unit
  fireEvent.change(type, { target: { value: 'Tutorial' } });
  expect(code).toHaveValue('TUT03');          // back to its own code
  fireEvent.change(code, { target: { value: 'tut-lab' } });
  expect(code).toHaveValue('TUT-LAB');
  fireEvent.change(type, { target: { value: 'Lecture' } });
  expect(code).toHaveValue('TUT-LAB');        // typed by hand: not replaced
});