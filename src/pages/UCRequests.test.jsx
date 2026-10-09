// UC Requests: approving and rejecting send the right review status.
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import UCRequests from './UCRequests';
import { ucAPI, sessionsAPI } from '../config/api';

jest.mock('../config/api', () => ({
  sessionsAPI: { getFresh: jest.fn().mockResolvedValue([]) },
  ucAPI: { getAllRequests: jest.fn(), getFreshRequests: jest.fn(), reviewRequest: jest.fn() }
}));
// The page only lists requests for the active unit, so the mock needs one.
const mockUnit = { id: 'unit1', unitCode: 'CAB201', roles: ['coordinator'] };
const mockUnitContext = { allUnits: [mockUnit], activeUnit: mockUnit };
jest.mock('../context/ActiveUnitContext', () => ({ useActiveUnit: () => mockUnitContext }));
jest.mock('../components/UCSidebar', () => () => null);
jest.mock('../components/UCPageHeader', () => ({ title }) => <h1>{title}</h1>);

const pending = {
  id: 'r1', requestType: 'Session swap', status: 'Pending', priority: 'Normal', reason: 'Clashes with my lab',
  tutorName: 'Tia Tutor', unitCode: 'CAB201', unitId: 'unit1', submittedDate: '2026-10-04T08:00:00Z',
  currentSession: 's2::TUE 13:00-14:00|P-1', preferredSwapTo: 's3::WED 15:00-16:00|P-1'
};

beforeEach(() => {
  jest.clearAllMocks();
  ucAPI.getAllRequests.mockResolvedValue([pending]);
  ucAPI.getFreshRequests.mockResolvedValue([pending]);
  ucAPI.reviewRequest.mockResolvedValue({});
  sessionsAPI.getFresh.mockResolvedValue([]);
});

test('M-2 UC suggestions only show matching session types even with spaced time labels', async () => {
  const request = { ...pending, currentSession: 'TUE 13:00 - 14:00 | P-1' };
  ucAPI.getAllRequests.mockResolvedValue([request]);
  ucAPI.getFreshRequests.mockResolvedValue([request]);
  sessionsAPI.getFresh.mockResolvedValue([
    { id: 's2', day: 'TUE', startTime: '13:00', endTime: '14:00', location: 'P-1', sessionType: 'Tutorial' },
    { id: 's3', day: 'WED', startTime: '15:00', endTime: '16:00', location: 'P-1', sessionType: 'Tutorial' },
    { id: 's4', day: 'FRI', startTime: '15:00', endTime: '16:00', location: 'P-1', sessionType: 'Lecture' }
  ]);
  const { container } = render(<UCRequests />);
  fireEvent.click(await screen.findByRole('button', { name: 'Suggest' }));
  await waitFor(() => expect(container.querySelectorAll('.uc-session-option').length).toBe(1));
  expect(container.querySelector('.uc-session-option')).toHaveTextContent('WED');
});

test('FE-36 a pending request shows who, what and why', async () => {
  render(<UCRequests />);
  expect(await screen.findByText('Tia Tutor')).toBeInTheDocument();
  expect(screen.getByText('Clashes with my lab')).toBeInTheDocument();
  expect(screen.getByText('TUE 13:00-14:00 | P-1')).toBeInTheDocument();
});

test('FE-37 Approve then Done sends status "accepted"', async () => {
  render(<UCRequests />);
  fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  await waitFor(() => expect(ucAPI.reviewRequest).toHaveBeenCalledWith('r1', 'accepted', expect.any(String)));
});
