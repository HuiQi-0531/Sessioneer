// UC Requests: approving and rejecting send the right review status.
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import UCRequests from './UCRequests';
import { ucAPI } from '../config/api';

jest.mock('../config/api', () => ({
  sessionsAPI: { getFresh: jest.fn().mockResolvedValue([]) },
  ucAPI: { getAllRequests: jest.fn(), getFreshRequests: jest.fn(), reviewRequest: jest.fn() }
}));
const mockUnitContext = { allUnits: [{ id: 'unit1', unitCode: 'CAB201', roles: ['coordinator'] }] };
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
