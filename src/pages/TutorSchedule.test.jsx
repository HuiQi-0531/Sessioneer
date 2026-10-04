// My Schedule: shows each offer's status, confirm/decline, and declined sessions with the reason.
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import TutorSchedule from './TutorSchedule';
import { sessionsAPI } from '../config/api';

jest.mock('../config/api', () => ({ sessionsAPI: { getMyAssigned: jest.fn(), confirmSession: jest.fn() } }));
const mockUnitContext = { allUnits: [{ id: 'unit1', unitCode: 'CAB201', roles: ['tutor'] }], isLoading: false };
jest.mock('../context/ActiveUnitContext', () => ({ useActiveUnit: () => mockUnitContext }));
jest.mock('../components/TutorSidebar', () => () => null);
jest.mock('../components/UCPageHeader', () => ({ title }) => <h1>{title}</h1>);
jest.mock('html2canvas', () => jest.fn());

const me = 'me';
const session = (code, day, mine, extra = {}) => ({
  id: code, sessionCode: code, day, startTime: '09:00:00', endTime: '10:00:00', location: 'P-1', sessionType: 'Tutorial',
  tutors: mine.confirmed === false ? [] : [{ tutorId: me, tutorName: 'Me', ...mine }],
  declinedTutors: mine.confirmed === false ? [{ tutorId: me, tutorName: 'Me', ...mine }] : [],
  ...extra
});

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.setItem('currentUser', JSON.stringify({ id: me, role: 'tutor' }));
  sessionsAPI.getMyAssigned.mockResolvedValue([
    session('TUT01', 'MON', { confirmed: null }),
    session('TUT02', 'TUE', { confirmed: true }),
    session('TUT03', 'WED', { confirmed: false, rejectReason: 'Clashes with my lab' })
  ]);
  sessionsAPI.confirmSession.mockResolvedValue({});
});

const row = async (code) => (await screen.findByText(code)).closest('tr');

test('FE-21 each session shows the tutor\'s own status, including declined with the reason', async () => {
  render(<TutorSchedule />);
  expect(within(await row('TUT01')).getByText('Awaiting response')).toBeInTheDocument();
  expect(within(await row('TUT02')).getByText('Confirmed')).toBeInTheDocument();
  const declined = await row('TUT03');
  expect(within(declined).getByText('Declined')).toBeInTheDocument();
  expect(within(declined).getByText('"Clashes with my lab"')).toBeInTheDocument();
});

test('FE-22 My Schedule asks the API for declined sessions too', async () => {
  render(<TutorSchedule />);
  await row('TUT01');
  expect(sessionsAPI.getMyAssigned).toHaveBeenCalledWith('unit1', { includeDeclined: true });
});

test('FE-23 only the unanswered offer has Confirm / Decline buttons', async () => {
  render(<TutorSchedule />);
  expect(within(await row('TUT01')).getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
  expect(within(await row('TUT02')).queryByRole('button', { name: 'Confirm' })).toBeNull();
  expect(within(await row('TUT03')).queryByRole('button', { name: 'Decline' })).toBeNull();
});

test('FE-24 Confirm sends confirmed=true for that session', async () => {
  render(<TutorSchedule />);
  fireEvent.click(within(await row('TUT01')).getByRole('button', { name: 'Confirm' }));
  await waitFor(() => expect(sessionsAPI.confirmSession).toHaveBeenCalledWith('unit1', 'TUT01', true, null));
});

test('FE-25 Decline needs a reason, then sends it trimmed', async () => {
  render(<TutorSchedule />);
  fireEvent.click(within(await row('TUT01')).getByRole('button', { name: 'Decline' }));
  const modalButton = screen.getAllByRole('button', { name: 'Decline' }).pop();
  fireEvent.click(modalButton);
  expect(screen.getByText('Please provide a reason for declining.')).toBeInTheDocument();
  expect(sessionsAPI.confirmSession).not.toHaveBeenCalled();
  fireEvent.change(screen.getByPlaceholderText(/explain why/), { target: { value: '  sick  ' } });
  fireEvent.click(modalButton);
  await waitFor(() => expect(sessionsAPI.confirmSession).toHaveBeenCalledWith('unit1', 'TUT01', false, 'sick'));
});
