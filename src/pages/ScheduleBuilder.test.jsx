// Schedule Builder > Assign Staff: blocked tutors cannot be picked, and the reason is shown.
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ScheduleBuilder from './ScheduleBuilder';
import { sessionsAPI, scheduleAPI } from '../config/api';

jest.mock('../config/api', () => ({
  sessionsAPI: { getAll: jest.fn() },
  scheduleAPI: { getCandidates: jest.fn(), assignTutor: jest.fn(), unassignTutor: jest.fn() },
  unitsAPI: { lockSchedule: jest.fn(), unlockSchedule: jest.fn(), releaseDraft: jest.fn(), unreleaseDraft: jest.fn() }
}));
const mockUnitContext = {
  activeUnit: { id: 'unit1', unitCode: 'CAB201', scheduleLocked: false },
  activeUnitId: 'unit1', setActiveUnitId: () => {}, isLoading: false, refreshUnits: () => {}
};
jest.mock('../context/ActiveUnitContext', () => ({ useActiveUnit: () => mockUnitContext }));
jest.mock('../components/UCSidebar', () => () => null);
jest.mock('../components/UCPageHeader', () => ({ title }) => <h1>{title}</h1>);
jest.mock('html2canvas', () => jest.fn());

const session = { id: 's1', sessionCode: 'TUT01', day: 'MON', startTime: '09:00:00', endTime: '10:00:00', location: 'P-1', sessionType: 'Tutorial', capacity: 30, requiredTutors: 1, tutors: [], declinedTutors: [], isAssigned: false };
const candidate = (id, name, extra = {}) => ({ id, name, roleLabel: 'Tutor', priorityTag: 'Standard', hardBlocked: false, warnings: [], score: 0, isAssignedToThisSession: false, ...extra });

beforeEach(() => {
  jest.clearAllMocks();
  sessionsAPI.getAll.mockResolvedValue([session]);
  scheduleAPI.getCandidates.mockResolvedValue({ candidates: [
    candidate('free', 'Free Tutor'),
    candidate('busy', 'Busy Tutor', { hardBlocked: true, warnings: ['Covering an overlapping session in IFB102 until 2026-10-16'] })
  ] });
  scheduleAPI.assignTutor.mockResolvedValue({ ...session, tutors: [{ tutorId: 'free', tutorName: 'Free Tutor', confirmed: null }], isAssigned: true });
});

const openAssign = async () => {
  render(<MemoryRouter><ScheduleBuilder /></MemoryRouter>);
  fireEvent.click(within((await screen.findByText('TUT01')).closest('tr')).getByRole('button', { name: 'Assign Staff' }));
  await screen.findByText('Free Tutor');
};

test('FE-34 a blocked tutor shows the reason and cannot be assigned', async () => {
  await openAssign();
  const busy = screen.getByText('Busy Tutor').closest('.sb-candidate-row');
  expect(within(busy).getByText(/Covering an overlapping session in IFB102/)).toBeInTheDocument();
  expect(within(busy).getByRole('button', { name: 'Assign' })).toBeDisabled();
});

test('FE-35 assigning a free tutor calls the API for that session', async () => {
  await openAssign();
  const free = screen.getByText('Free Tutor').closest('.sb-candidate-row');
  fireEvent.click(within(free).getByRole('button', { name: 'Assign' }));
  await waitFor(() => expect(scheduleAPI.assignTutor).toHaveBeenCalledWith('unit1', 's1', 'free'));
});

describe('List View shows each tutor\'s answer and who declined', () => {
  const listSessions = [
    { ...session, id: 'p', sessionCode: 'TUT02', isAssigned: true, requiredTutors: 2,
      tutors: [{ tutorId: 'a', tutorName: 'Ann Lee', confirmed: true }, { tutorId: 'b', tutorName: 'Ben Wu', confirmed: null }] },
    { ...session, id: 'd', sessionCode: 'TUT03', isAssigned: false, tutors: [],
      declinedTutors: [{ tutorId: 'c', tutorName: 'Cal Cover', confirmed: false, rejectReason: 'I have a lab then' }] },
    { ...session, id: 'h', sessionCode: 'TUT04', isAssigned: true, requiredTutors: 2,
      tutors: [{ tutorId: 'a', tutorName: 'Ann Lee', confirmed: true }] }
  ];
  const rowOf = async (code) => (await screen.findByText(code)).closest('tr');

  beforeEach(() => { sessionsAPI.getAll.mockResolvedValue(listSessions); });

  test('FE-38 each assigned tutor shows Confirmed or Awaiting', async () => {
    render(<MemoryRouter><ScheduleBuilder /></MemoryRouter>);
    const row = await rowOf('TUT02');
    expect(within(row).getByText('Ann Lee').closest('.sb-assigned-pill')).toHaveTextContent('Confirmed');
    expect(within(row).getByText('Ben Wu').closest('.sb-assigned-pill')).toHaveTextContent('Awaiting');
    expect(within(row).getByText('Ben Wu').closest('.sb-assigned-pill')).toHaveClass('pending');
  });

  test('FE-39 a declined session says who declined and why', async () => {
    render(<MemoryRouter><ScheduleBuilder /></MemoryRouter>);
    const row = await rowOf('TUT03');
    expect(within(row).getByText('Declined by Cal Cover: "I have a lab then"')).toBeInTheDocument();
    expect(within(row).getByRole('button', { name: 'Assign Staff' })).toBeInTheDocument();
  });

  test('FE-40 a two-tutor session with one tutor says it needs one more', async () => {
    render(<MemoryRouter><ScheduleBuilder /></MemoryRouter>);
    expect(within(await rowOf('TUT04')).getByText('Needs 1 more tutor')).toBeInTheDocument();
    expect(within(await rowOf('TUT02')).queryByText(/Needs/)).toBeNull();
  });

  test('FE-42 a session with one tutor still to answer counts as Awaiting, not Confirmed', async () => {
    render(<MemoryRouter><ScheduleBuilder /></MemoryRouter>);
    await rowOf('TUT02');
    const card = (label) => screen.getByText(label).closest('div').parentElement;
    // TUT02 (Ann confirmed, Ben awaiting) is awaiting; TUT04 (only Ann, confirmed) is confirmed.
    expect(card('Awaiting Confirmation')).toHaveTextContent('1');
    expect(card('Confirmed Sessions')).toHaveTextContent('1');
  });

  test('FE-41 Assign Staff warns about the tutor who declined this session', async () => {
    scheduleAPI.getCandidates.mockResolvedValue({ candidates: [candidate('c', 'Cal Cover'), candidate('free', 'Free Tutor')] });
    render(<MemoryRouter><ScheduleBuilder /></MemoryRouter>);
    fireEvent.click(within(await rowOf('TUT03')).getByRole('button', { name: 'Assign Staff' }));
    const cal = (await screen.findByText('Cal Cover', { selector: '.sb-candidate-name' })).closest('.sb-candidate-row');
    expect(within(cal).getByText('Declined this session: "I have a lab then"')).toBeInTheDocument();
    const free = screen.getByText('Free Tutor').closest('.sb-candidate-row');
    expect(within(free).queryByText(/Declined this session/)).toBeNull();
  });
});
