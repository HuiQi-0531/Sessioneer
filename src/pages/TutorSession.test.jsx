import React from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import TutorSession from './TutorSession';
import { sessionsAPI } from '../config/api';
import { useActiveUnit } from '../context/ActiveUnitContext';

// ---------- Mocks ----------

let mockParams = {};
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => mockParams,
}));

jest.mock('../config/api', () => ({
  sessionsAPI: { getAll: jest.fn() },
}));

jest.mock('../context/ActiveUnitContext', () => ({ useActiveUnit: jest.fn() }));

// Simple stand-in: a unit gives tutor access if its roles include "tutor"
jest.mock('../utils/roles', () => ({
  unitHasTutorAccess: (unit) => Boolean(unit && unit.roles && unit.roles.includes('tutor')),
}));

jest.mock('../components/TutorSidebar', () => () => 'TutorSidebar');
jest.mock('../components/UCPageHeader', () => ({ title }) => title);

// ---------- Test data ----------

const defaultUnits = [
  { id: 'u1', unitCode: 'FIT1001', roles: ['tutor'] },
  { id: 'u2', unitCode: 'FIT2002', roles: ['tutor'] },
  { id: 'u3', unitCode: 'FIT3003', roles: ['coordinator'] },
];

// Monday 9-11, one confirmed tutor and one pending -> "confirmed" block
const s1 = {
  id: 's1', day: 'MON', startTime: '09:00:00', endTime: '11:00:00',
  sessionCode: 'T01', location: 'Room 101',
  tutors: [{ tutorName: 'Alice', confirmed: true }, { tutorName: 'Carl', confirmed: false }],
};
// Tuesday 10-12, only a pending tutor, no code or location -> "pending" block
const s2 = {
  id: 's2', day: 'TUE', startTime: '10:00:00', endTime: '12:00:00',
  sessionType: 'Lab',
  tutors: [{ tutorName: 'Bob', confirmed: false }],
};
// Wednesday 1-2pm, no tutors, no code or type -> "unassigned" block
const s3 = { id: 's3', day: 'WED', startTime: '13:00:00', endTime: '14:00:00', tutors: [] };
// Saturday -> hidden from grid
const s4 = { id: 's4', day: 'SAT', startTime: '10:00:00', endTime: '11:00:00', tutors: [] };
// Starts before 8am -> hidden from grid
const s5 = { id: 's5', day: 'MON', startTime: '07:00:00', endTime: '08:00:00', tutors: [] };
// Friday 8-9pm, the last slot -> still shown
const s6 = { id: 's6', day: 'FRI', startTime: '20:00:00', endTime: '21:00:00', sessionCode: 'T06', tutors: [] };

const allSessions = [s1, s2, s3, s4, s5, s6];

const mockSetActiveUnitId = jest.fn();

// A fake context that remembers which unit is active, like the real one
const setupContext = ({ units = defaultUnits, activeUnitId = 'u1', isLoading = false } = {}) => {
  useActiveUnit.mockImplementation(() => {
    const [id, setId] = React.useState(activeUnitId);
    return {
      activeUnit: units.find(u => u.id === id) || null,
      activeUnitId: id,
      allUnits: units,
      setActiveUnitId: (newId) => {
        mockSetActiveUnitId(newId);
        setId(newId);
      },
      isLoading,
    };
  });
};

// ---------- Helpers ----------

const renderAndWait = async () => {
  render(<TutorSession />);
  await screen.findByText('09:00 - 11:00');
};

// Finds a session block on the grid by its time text
const getBlock = (timeText) => screen.getByText(timeText).closest('.sb-grid-block');

// ---------- Setup ----------

beforeEach(() => {
  mockParams = {};
  mockSetActiveUnitId.mockReset();
  setupContext();
  sessionsAPI.getAll.mockResolvedValue(allSessions);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------- Tests ----------

describe('TutorSession', () => {
  describe('page states', () => {
    test('shows a loading message while units are loading', () => {
      setupContext({ isLoading: true });
      render(<TutorSession />);
      expect(screen.getByText('Loading sessions...')).toBeInTheDocument();
    });

    test('shows a message when the tutor has no units, without calling the API', () => {
      setupContext({ units: [], activeUnitId: null });
      render(<TutorSession />);
      expect(screen.getByText(/no unit selected/i)).toBeInTheDocument();
      expect(sessionsAPI.getAll).not.toHaveBeenCalled();
    });

    test('shows a waiting message when the user only coordinates units', () => {
      setupContext({ units: [defaultUnits[2]], activeUnitId: 'u3' });
      render(<TutorSession />);
      expect(screen.getByText('Loading your tutor units...')).toBeInTheDocument();
      expect(sessionsAPI.getAll).not.toHaveBeenCalled();
    });
  });

  describe('choosing the unit', () => {
    test('picks the first tutor unit when none is active', async () => {
      setupContext({ activeUnitId: null });
      render(<TutorSession />);

      expect(await screen.findByRole('heading', { name: 'FIT1001 - Session Schedule' })).toBeInTheDocument();
      expect(mockSetActiveUnitId).toHaveBeenCalledWith('u1');
      expect(sessionsAPI.getAll).toHaveBeenCalledWith('u1');
    });

    test('switches away from a unit the user only coordinates', async () => {
      setupContext({ activeUnitId: 'u3' });
      render(<TutorSession />);

      expect(await screen.findByRole('heading', { name: 'FIT1001 - Session Schedule' })).toBeInTheDocument();
      expect(mockSetActiveUnitId).toHaveBeenCalledWith('u1');
    });

    test('uses the unit from the URL', async () => {
      mockParams = { unitId: 'u2' };
      render(<TutorSession />);

      expect(await screen.findByRole('heading', { name: 'FIT2002 - Session Schedule' })).toBeInTheDocument();
      expect(mockSetActiveUnitId).toHaveBeenCalledWith('u2');
      expect(sessionsAPI.getAll).toHaveBeenCalledWith('u2');
    });

    test('ignores a URL unit the user is not a tutor in', async () => {
      mockParams = { unitId: 'u3' };
      await renderAndWait();

      expect(screen.getByRole('heading', { name: 'FIT1001 - Session Schedule' })).toBeInTheDocument();
      expect(mockSetActiveUnitId).not.toHaveBeenCalled();
    });
  });

  describe('session states', () => {
    test('shows a loading message while sessions load', () => {
      sessionsAPI.getAll.mockReturnValue(new Promise(() => {}));
      render(<TutorSession />);

      expect(screen.getByRole('heading', { name: 'FIT1001 - Session Schedule' })).toBeInTheDocument();
      expect(screen.getByText('Loading sessions...')).toBeInTheDocument();
    });

    test('shows a message when the schedule has not been released', async () => {
      sessionsAPI.getAll.mockResolvedValue({ released: false, sessions: [] });
      render(<TutorSession />);
      expect(await screen.findByText(/hasn't released the schedule yet/i)).toBeInTheDocument();
    });

    test('shows a message when the unit has no sessions', async () => {
      sessionsAPI.getAll.mockResolvedValue([]);
      render(<TutorSession />);
      expect(await screen.findByText('No sessions have been added to this unit yet.')).toBeInTheDocument();
    });
  });

  describe('schedule grid', () => {
    test('shows the weekdays and hours from 8am to 8pm', async () => {
      await renderAndWait();
      ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].forEach(day => {
        expect(screen.getByText(day)).toBeInTheDocument();
      });
      ['8am', '11am', '12pm', '1pm', '8pm'].forEach(hour => {
        expect(screen.getByText(hour)).toBeInTheDocument();
      });
      expect(screen.queryByText('9pm')).not.toBeInTheDocument();
    });

    test('a session with a confirmed tutor is shown as confirmed', async () => {
      await renderAndWait();
      const block = getBlock('09:00 - 11:00');

      expect(block).toHaveClass('assigned');
      expect(within(block).getByText('T01 · Room 101')).toBeInTheDocument();
      expect(within(block).getByText('Alice')).toBeInTheDocument();
      expect(within(block).getByText('Carl (pending)')).toBeInTheDocument();
    });

    test('a session with only unconfirmed tutors is shown as pending', async () => {
      await renderAndWait();
      const block = getBlock('10:00 - 12:00');

      expect(block).toHaveClass('pending');
      expect(within(block).getByText('Lab')).toBeInTheDocument();
      expect(within(block).getByText('Bob (pending)')).toBeInTheDocument();
    });

    test('a session with no tutors is shown as unassigned', async () => {
      await renderAndWait();
      const block = getBlock('13:00 - 14:00');

      expect(block).toHaveClass('unassigned');
      expect(within(block).getByText('Session')).toBeInTheDocument();
      expect(within(block).getByText('Unassigned')).toBeInTheDocument();
    });

    test('places sessions in the right day column and hour rows', async () => {
      await renderAndWait();

      const monday = getBlock('09:00 - 11:00');
      expect(monday.style.gridColumn).toBe('2');
      expect(monday.style.gridRow).toBe('3 / 5');

      const fridayEvening = getBlock('20:00 - 21:00');
      expect(fridayEvening.style.gridColumn).toBe('6');
      expect(fridayEvening.style.gridRow).toBe('14 / 15');
    });

    test('hides weekend and out-of-hours sessions and says how many', async () => {
      await renderAndWait();

      expect(screen.queryByText('10:00 - 11:00')).not.toBeInTheDocument(); // Saturday
      expect(screen.queryByText('07:00 - 08:00')).not.toBeInTheDocument(); // before 8am
      expect(screen.getByText('2 sessions not shown here (outside Mon-Fri 8am-9pm).')).toBeInTheDocument();
    });

    test('uses "session" (singular) when only one is hidden', async () => {
      sessionsAPI.getAll.mockResolvedValue([s1, s4]);
      await renderAndWait();
      expect(screen.getByText('1 session not shown here (outside Mon-Fri 8am-9pm).')).toBeInTheDocument();
    });

    test('shows no note when every session fits on the grid', async () => {
      sessionsAPI.getAll.mockResolvedValue([s1, s2]);
      await renderAndWait();
      expect(screen.queryByText(/not shown here/i)).not.toBeInTheDocument();
    });
  });

  describe('fullscreen', () => {
    test('fullscreen hides the sidebar and header and makes rows taller', async () => {
      await renderAndWait();
      const grid = () => document.querySelector('.sb-grid');

      expect(screen.getByText('TutorSidebar')).toBeInTheDocument();
      expect(screen.getByText('Sessions')).toBeInTheDocument();
      expect(grid().style.gridTemplateRows).toBe('auto repeat(13, 44px)');

      await userEvent.click(screen.getByRole('button', { name: 'Fullscreen' }));

      expect(screen.queryByText('TutorSidebar')).not.toBeInTheDocument();
      expect(screen.queryByText('Sessions')).not.toBeInTheDocument();
      expect(grid().style.gridTemplateRows).toBe('auto repeat(13, 60px)');

      await userEvent.click(screen.getByRole('button', { name: 'Exit Fullscreen' }));

      expect(screen.getByText('TutorSidebar')).toBeInTheDocument();
      expect(grid().style.gridTemplateRows).toBe('auto repeat(13, 44px)');
    });
  });
});