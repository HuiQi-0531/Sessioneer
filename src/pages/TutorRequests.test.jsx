// Tutor Requests page: claiming a cover, and the message the tutor sees when it fails.
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TutorRequests from './TutorRequests';
import { coverAPI, requestsAPI, sessionsAPI } from '../config/api';

jest.mock('../config/api', () => ({
  requestsAPI: { getAll: jest.fn(), create: jest.fn(), delete: jest.fn(), update: jest.fn() },
  sessionsAPI: { getMyAssigned: jest.fn().mockResolvedValue([]), getAll: jest.fn().mockResolvedValue([]) },
  coverAPI: { getOpen: jest.fn(), claim: jest.fn() }
}));
const mockUnitContext = {
    allUnits: [{ id: 'unit1', unitCode: 'CAB201', roles: ['tutor'] }],
    activeUnit: { id: 'unit1', unitCode: 'CAB201', roles: ['tutor'] },
    isLoading: false
  };
jest.mock('../context/ActiveUnitContext', () => ({ useActiveUnit: () => mockUnitContext }));
jest.mock('../components/TutorSidebar', () => () => null);
jest.mock('../components/UCPageHeader', () => ({ title }) => <h1>{title}</h1>);

const openCover = {
  id: 'c1', unitCode: 'CAB201', unitName: 'Software', sessionCode: 'TUT01', day: 'MON',
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
});

test('M-2 preferred swaps only list the current session type and reset when current session changes', async () => {
  const session = (id, sessionType, day) => ({ id, sessionType, day, startTime: '09:00', endTime: '10:00', location: 'P-1' });
  const mine = [session('tutorial', 'Tutorial', 'MON'), session('practical', 'Practical', 'TUE')];
  sessionsAPI.getMyAssigned.mockResolvedValue(mine);
  sessionsAPI.getAll.mockResolvedValue([...mine, session('other-tutorial', 'Tutorial', 'WED'), session('lecture', 'Lecture', 'THU')]);
  const { container } = render(<TutorRequests />);
  fireEvent.click(screen.getByRole('button', { name: '+ Request' }));
  fireEvent.change(container.querySelector('select[name="selectedUnit"]'), { target: { value: 'unit1' } });
  await waitFor(() => expect(container.querySelector('select[name="currentSession"]').options.length).toBe(3));
  const current = container.querySelector('select[name="currentSession"]');
  const preferred = container.querySelector('select[name="preferredSwapTo"]');
  fireEvent.change(current, { target: { value: current.options[1].value } });
  expect([...preferred.options].map(option => option.text)).not.toEqual(expect.arrayContaining([expect.stringMatching(/Lecture|Practical/)]));
  expect(preferred.options.length).toBe(2);
  fireEvent.change(preferred, { target: { value: preferred.options[1].value } });
  fireEvent.change(current, { target: { value: current.options[2].value } });
  expect(preferred.value).toBe('');
  expect(preferred.options.length).toBe(1);
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
