// Sessions page: every tutor and running cover is shown, and Request Cover
// sends the dates and the away tutor (the old version sent neither).
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Sessions from './Sessions';
import { sessionsAPI, coverAPI } from '../config/api';

jest.mock('../config/api', () => ({
  sessionsAPI: { getAll: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
  coverAPI: { broadcast: jest.fn() }
}));
// One stable object, like the real context (a new object every render
// would make the page reload its sessions forever).
const mockUnitContext = {
  activeUnit: { id: 'unit1', unitCode: 'CAB201', enrolmentSize: 60 },
  activeUnitId: 'unit1',
  setActiveUnitId: () => {},
  isLoading: false
};
jest.mock('../context/ActiveUnitContext', () => ({ useActiveUnit: () => mockUnitContext }));
jest.mock('../components/UCSidebar', () => () => null);
jest.mock('../components/UCPageHeader', () => ({ title }) => <h1>{title}</h1>);

const base = { day: 'MON', startTime: '09:00:00', endTime: '10:00:00', location: 'P-1', campus: 'GP', sessionType: 'Tutorial', capacity: 60, status: 'Confirmed', declinedTutors: [] };
const sessions = [
  { ...base, id: 's1', sessionCode: 'TUT01', requiredTutors: 2,
    tutors: [{ tutorId: 'ann', tutorName: 'Ann Lee', confirmed: true }, { tutorId: 'ben', tutorName: 'Ben Wu', confirmed: true }],
    activeCovers: [{ claimedByName: 'Cam Ng', startDate: '2026-10-05', endDate: '2026-10-09' }] },
  { ...base, id: 's2', sessionCode: 'TUT02', day: 'TUE', requiredTutors: 1, tutors: [], activeCovers: [] }
];

beforeEach(() => {
  jest.clearAllMocks();
  sessionsAPI.getAll.mockResolvedValue(sessions);
  coverAPI.broadcast.mockResolvedValue({ notifiedCount: 3 });
});

const renderPage = () => render(<MemoryRouter><Sessions /></MemoryRouter>);

test('FE-30 both tutors of a two-tutor session and the running cover are shown', async () => {
  renderPage();
  const row = (await screen.findByText('TUT01')).closest('tr');
  expect(within(row).getByText('Ann Lee, Ben Wu')).toBeInTheDocument();
  expect(within(row).getByText('Cover: Cam Ng (5 Oct - 9 Oct)')).toBeInTheDocument();
  expect(within((await screen.findByText('TUT02')).closest('tr')).getByText('Unassigned')).toBeInTheDocument();
});

test('FE-31 the second tutor of a shared session can be chosen in Request Cover', async () => {
  renderPage();
  await screen.findByText('TUT01');
  fireEvent.click(screen.getByRole('button', { name: 'Request Cover' }));
  const options = within(document.querySelector('.ss-cover-modal select')).getAllByRole('option').map(o => o.textContent);
  expect(options).toEqual(expect.arrayContaining(['Ann Lee', 'Ben Wu']));
});

test('FE-32 Send passes the dates and which tutor is away', async () => {
  renderPage();
  await screen.findByText('TUT01');
  fireEvent.click(screen.getByRole('button', { name: 'Request Cover' }));
  const modal = document.querySelector('.ss-cover-modal');
  fireEvent.change(modal.querySelector('select'), { target: { value: 'ben' } });
  fireEvent.click(within(modal).getByLabelText(/TUT01/));
  const day = within(modal).getAllByRole('button', { name: '20' })[0];
  fireEvent.click(day);
  fireEvent.click(day);
  fireEvent.click(within(modal).getByRole('button', { name: 'Send (1)' }));
  await waitFor(() => expect(coverAPI.broadcast).toHaveBeenCalled());
  const [ids, , start, end, away] = coverAPI.broadcast.mock.calls[0];
  expect(ids).toEqual(['s1']);
  expect(start).toMatch(/^\d{4}-\d{2}-20$/);
  expect(end).toBe(start);
  expect(away).toBe('ben');
  expect(await screen.findByText(/Broadcast sent to 3 tutors/)).toBeInTheDocument();
});

test('FE-33 "Unassigned only" keeps a two-tutor session that still has a free seat', async () => {
  sessionsAPI.getAll.mockResolvedValue([{ ...sessions[0], tutors: [sessions[0].tutors[0]] }, sessions[1]]);
  renderPage();
  await screen.findByText('TUT01');
  fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
  fireEvent.click(screen.getByLabelText(/unassigned/i));
  expect(screen.getByText('TUT01')).toBeInTheDocument();
  expect(screen.getByText('TUT02')).toBeInTheDocument();
});
