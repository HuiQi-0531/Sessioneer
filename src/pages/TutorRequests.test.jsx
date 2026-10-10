// Tutor Requests page: claiming a cover, and the message the tutor sees when it fails.
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TutorRequests from './TutorRequests';
import { coverAPI, requestsAPI, sessionsAPI } from '../config/api';

jest.mock('../config/api', () => ({
  requestsAPI: { getAll: jest.fn(), create: jest.fn(), delete: jest.fn(), update: jest.fn() },
  sessionsAPI: { getMyAssigned: jest.fn().mockResolvedValue([]), getAll: jest.fn().mockResolvedValue([]), getSwapTargets: jest.fn().mockResolvedValue([]) },
  coverAPI: { getOpen: jest.fn(), claim: jest.fn() }
}));
const mockUnitContext = {
    allUnits: [
      { id: 'unit2027', unitCode: 'CAB201', semester: 'Semester 2', year: 2027, roles: ['tutor'] },
      { id: 'unit1', unitCode: 'CAB201', semester: 'Semester 2', year: 2026, roles: ['tutor'] }
    ],
    activeUnit: { id: 'unit1', unitCode: 'CAB201', semester: 'Semester 2', year: 2026, roles: ['tutor'] },
    isLoading: false
  };
jest.mock('../context/ActiveUnitContext', () => ({ useActiveUnit: () => mockUnitContext }));
jest.mock('../components/TutorSidebar', () => () => null);
jest.mock('../components/UCPageHeader', () => ({ title }) => <h1>{title}</h1>);

const openCover = {
  id: 'c1', unitId: 'unit1', unitCode: 'CAB201', unitName: 'Software', sessionCode: 'TUT01', day: 'MON',
  startTime: '09:00:00', endTime: '10:00:00', startDate: '2026-10-05', endDate: '2026-10-05',
  location: 'P-1', sessionType: 'Tutorial', originalTutorName: 'Tia Tutor', reason: 'conference', occurrenceCount: 1
};
const conflict = (message) => Object.assign(new Error(message), { status: 409 });

beforeEach(() => {
  jest.clearAllMocks();
  requestsAPI.getAll.mockResolvedValue([]);
  coverAPI.getOpen.mockResolvedValue([openCover]);
  sessionsAPI.getMyAssigned.mockResolvedValue([]);
  sessionsAPI.getAll.mockResolvedValue([]);
  sessionsAPI.getSwapTargets.mockResolvedValue([]);
});

test('M-2 preferred swaps come from the backend for the chosen session and reset when it changes', async () => {
  const session = (id, sessionType, day) => ({ id, sessionType, day, startTime: '09:00', endTime: '10:00', location: 'P-1' });
  const mine = [session('tutorial', 'Tutorial', 'MON'), session('practical', 'Practical', 'TUE')];
  sessionsAPI.getMyAssigned.mockResolvedValue(mine);
  sessionsAPI.getSwapTargets.mockImplementation(async (_unitId, currentId) => (
    currentId === 'tutorial' ? [session('other-tutorial', 'Tutorial', 'WED')] : []
  ));
  const { container } = render(<TutorRequests />);
  fireEvent.click(screen.getByRole('button', { name: '+ Request' }));
  await waitFor(() => expect(container.querySelector('select[name="currentSession"]').options.length).toBe(3));
  const current = container.querySelector('select[name="currentSession"]');
  const preferred = container.querySelector('select[name="preferredSwapTo"]');
  fireEvent.change(current, { target: { value: current.options[1].value } });
  await waitFor(() => expect(preferred.options.length).toBe(2));
  expect(sessionsAPI.getSwapTargets).toHaveBeenCalledWith('unit1', 'tutorial');
  fireEvent.change(preferred, { target: { value: preferred.options[1].value } });
  fireEvent.change(current, { target: { value: current.options[2].value } });
  expect(preferred.value).toBe('');
  await waitFor(() => expect(preferred.options.length).toBe(1));
  expect(preferred.options[0].text).toMatch(/No other Practical with space/);
});

test('BUG-1ii the unit is locked to the Active Unit and shows its semester (no CAB201 dropdown)', async () => {
  const { container } = render(<TutorRequests />);
  fireEvent.click(screen.getByRole('button', { name: '+ Request' }));
  expect(container.querySelector('select[name="selectedUnit"]')).toBeNull();
  expect(screen.getByDisplayValue('CAB201 · Semester 2, 2026')).toBeDisabled();
  await waitFor(() => expect(sessionsAPI.getMyAssigned).toHaveBeenCalledWith('unit1'));
  expect(sessionsAPI.getMyAssigned).not.toHaveBeenCalledWith('unit2027');
});

test('BUG-1ii a request from another semester of the same unit code is not listed', async () => {
  requestsAPI.getAll.mockResolvedValue([
    { id: 'r26', unitId: 'unit1', unitCode: 'CAB201', status: 'Pending', requestType: 'Session swap', currentSession: 'CAB201::TUE 09:00-10:00|GP-P-102', reason: 'from 2026', submittedDate: new Date().toISOString() },
    { id: 'r27', unitId: 'unit2027', unitCode: 'CAB201', status: 'Pending', requestType: 'Session swap', currentSession: 'CAB201::MON 09:00-10:00|GP-P-101', reason: 'from 2027', submittedDate: new Date().toISOString() }
  ]);
  render(<TutorRequests />);
  fireEvent.click(screen.getByRole('button', { name: /Pending Status/ }));
  expect(await screen.findByText('from 2026')).toBeInTheDocument();
  expect(screen.queryByText('from 2027')).toBeNull();
});

test('BUG-1ii a cover request from another semester is not listed', async () => {
  coverAPI.getOpen.mockResolvedValue([{ ...openCover, id: 'c27', unitId: 'unit2027', reason: 'other semester' }]);
  render(<TutorRequests />);
  expect(await screen.findByText(/Nothing needs cover right now/)).toBeInTheDocument();
});

test('double-clicking Accept on a suggestion only sends it once', async () => {
  requestsAPI.getAll.mockResolvedValue([
    { id: 'r1', unitId: 'unit1', unitCode: 'CAB201', status: 'Suggested', reviewNotes: 'TUT03 · Tutorial - WED 11:00 - 12:00 | GP-P-103', requestType: 'Session swap', currentSession: 'CAB201::TUE 09:00-10:00|GP-P-102', reason: 'x', submittedDate: new Date().toISOString() }
  ]);
  let finish;
  requestsAPI.update.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  render(<TutorRequests />);
  fireEvent.click(screen.getByRole('button', { name: /Pending Status/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Accept Suggestion' }));
  const accept = screen.getByRole('button', { name: 'Accept' });
  fireEvent.click(accept);
  fireEvent.click(accept);
  expect(requestsAPI.update).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
  finish({});
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Saving...' })).toBeNull());
});

test('FE-26 an open cover is listed with who is away and why', async () => {
  render(<TutorRequests />);
  expect(await screen.findByText(/Originally Tia Tutor/)).toBeInTheDocument();
  expect(screen.getByText(/conference/)).toBeInTheDocument();
});

test('FE-27 claiming shows a success message and removes the card', async () => {
  coverAPI.claim.mockResolvedValue({ success: true });
  render(<TutorRequests />);
  fireEvent.click(await screen.findByRole('button', { name: 'Claim This Session' }));
  expect(await screen.findByText(/You're now covering TUT01 · CAB201/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Claim This Session' })).toBeNull();
});

test('FE-28 someone else got it first: "too slow" and the card goes away', async () => {
  coverAPI.claim.mockRejectedValue(conflict('Someone else already claimed this session.'));
  render(<TutorRequests />);
  fireEvent.click(await screen.findByRole('button', { name: 'Claim This Session' }));
  expect(await screen.findByText(/Too slow/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Claim This Session' })).toBeNull();
});

test('FE-29 a clash with your own session shows the real reason and keeps the card', async () => {
  coverAPI.claim.mockRejectedValue(conflict('You already have an overlapping session in IFB102 at that time.'));
  render(<TutorRequests />);
  fireEvent.click(await screen.findByRole('button', { name: 'Claim This Session' }));
  expect(await screen.findByText('You already have an overlapping session in IFB102 at that time.')).toBeInTheDocument();
  expect(screen.queryByText(/Too slow/)).toBeNull();
  expect(screen.getByRole('button', { name: 'Claim This Session' })).toBeInTheDocument();
});

const pendingSwap = { id: 'r1', unitId: 'unit1', unitCode: 'CAB201', status: 'Pending', requestType: 'Session swap', currentSession: 'CAB201::TUE 09:00-10:00|GP-P-102', reason: 'delete me', submittedDate: new Date().toISOString() };

test('deleting a request asks in an in-app dialog, then removes the card and says so', async () => {
  requestsAPI.getAll.mockResolvedValue([pendingSwap]);
  requestsAPI.delete.mockResolvedValue({});
  const confirmSpy = jest.spyOn(window, 'confirm');
  render(<TutorRequests />);
  fireEvent.click(screen.getByRole('button', { name: /Pending Status/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Delete request' }));
  expect(confirmSpy).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog', { name: 'Delete request' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(await screen.findByText(/Request deleted/)).toBeInTheDocument();
  expect(requestsAPI.delete).toHaveBeenCalledWith('r1');
  expect(screen.queryByText('delete me')).toBeNull();
  confirmSpy.mockRestore();
});

test('cancelling the delete dialog keeps the request', async () => {
  requestsAPI.getAll.mockResolvedValue([pendingSwap]);
  render(<TutorRequests />);
  fireEvent.click(screen.getByRole('button', { name: /Pending Status/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Delete request' }));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog', { name: 'Delete request' })).toBeNull();
  expect(requestsAPI.delete).not.toHaveBeenCalled();
  expect(screen.getByText('delete me')).toBeInTheDocument();
});

test('a failed delete shows the error inside the dialog and keeps the card', async () => {
  requestsAPI.getAll.mockResolvedValue([pendingSwap]);
  requestsAPI.delete.mockRejectedValue(new Error('Only pending requests can be deleted'));
  render(<TutorRequests />);
  fireEvent.click(screen.getByRole('button', { name: /Pending Status/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Delete request' }));
  fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  expect(await screen.findByText('Only pending requests can be deleted')).toBeInTheDocument();
  expect(screen.getByText('delete me')).toBeInTheDocument();
});

test('an approved request has no delete button (only waiting requests can be withdrawn)', async () => {
  requestsAPI.getAll.mockResolvedValue([{ ...pendingSwap, id: 'r9', status: 'accepted', reason: 'done deal' }]);
  render(<TutorRequests />);
  fireEvent.click(screen.getByRole('button', { name: /Confirmation Status/ }));
  expect(await screen.findByText('done deal')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Delete request' })).toBeNull();
});