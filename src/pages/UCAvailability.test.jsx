import React from 'react';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import UCAvailability from './UCAvailability';
import { availabilityAPI, unitsAPI } from '../config/api';
import { useActiveUnit } from '../context/ActiveUnitContext';

// ---------- Mocks ----------

jest.mock('../config/api', () => ({
  availabilityAPI: { get: jest.fn() },
  unitsAPI: { lockAvailability: jest.fn(), unlockAvailability: jest.fn() },
}));

jest.mock('../context/ActiveUnitContext', () => ({ useActiveUnit: jest.fn() }));
jest.mock('../components/UCSidebar', () => () => null);
jest.mock('../components/UCPageHeader', () => ({ title }) => title);

// ---------- Test data ----------

const availabilityData = {
  tutors: [
    { id: 't1', name: 'Jayden Biden', icon: 'star' },
    { id: 't2', name: 'John Wick', icon: 'flag' },
    { id: 't3', name: 'Charles Oden' },
  ],
  availability: {
    MON: {
      t1: { '8:00am': 'preferred', '9:00am': 'available' },
      t2: { '8:00am': 'avoid' },
    },
    TUE: {
      t3: { '10:00am': 'preferred' },
    },
  },
  submissionStatus: [
    { tutorId: 't1', submitted: true },
    { tutorId: 't2', submitted: false },
    // t3 has no entry at all -> treated as not submitted
  ],
};

const mockRefreshUnits = jest.fn();

// Set what the ActiveUnit context returns. The unit object is created once per
// test so it stays the same between renders (like the real context).
const setupUnit = (unitOverrides = {}, { isLoading = false, noUnit = false } = {}) => {
  const activeUnit = noUnit
    ? null
    : { id: 'u1', unitCode: 'FIT1001', availabilityLocked: false, availabilityDeadline: null, ...unitOverrides };
  useActiveUnit.mockReturnValue({ activeUnit, isLoading, refreshUnits: mockRefreshUnits });
};

// ---------- Helpers ----------

const renderAndWait = async (props = {}) => {
  render(<UCAvailability {...props} />);
  await screen.findByText('Jayden Biden');
};

// Finds the grid cell for a tutor (column) at a time slot (row)
const getCell = (tutorName, slot) => {
  const headers = screen.getAllByRole('columnheader');
  const col = headers.findIndex(h => h.textContent.includes(tutorName));
  const row = screen.getByText(slot).closest('tr');
  return row.children[col];
};

const tutorColumns = () =>
  screen.getAllByRole('columnheader').slice(1).map(h => h.textContent);

// ---------- Setup ----------

beforeEach(() => {
  setupUnit();
  mockRefreshUnits.mockReset();
  mockRefreshUnits.mockResolvedValue();
  availabilityAPI.get.mockResolvedValue(availabilityData);
  unitsAPI.lockAvailability.mockResolvedValue({});
  unitsAPI.unlockAvailability.mockResolvedValue({});

  // jsdom has no real fullscreen support, so fake it
  HTMLElement.prototype.requestFullscreen = jest.fn();
  document.exitFullscreen = jest.fn();

  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(window, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  delete document.fullscreenElement;
});

// ---------- Tests ----------

describe('UCAvailability', () => {
  describe('page states', () => {
    test('shows a loading message while the unit is loading', () => {
      setupUnit({}, { isLoading: true });
      render(<UCAvailability />);
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    test('shows a message when no unit is selected, without calling the API', () => {
      setupUnit({}, { noUnit: true });
      render(<UCAvailability />);
      expect(screen.getByText(/no unit selected/i)).toBeInTheDocument();
      expect(availabilityAPI.get).not.toHaveBeenCalled();
    });

    test('shows a loading message while availability loads', () => {
      availabilityAPI.get.mockReturnValue(new Promise(() => {}));
      render(<UCAvailability />);
      expect(screen.getByText('Loading availability...')).toBeInTheDocument();
    });

    test('loads availability for the active unit', async () => {
      await renderAndWait();
      expect(availabilityAPI.get).toHaveBeenCalledWith('FIT1001');
    });

    test('shows an error with a Retry button that reloads the data', async () => {
      availabilityAPI.get.mockRejectedValueOnce(new Error('Server down'));
      render(<UCAvailability />);

      expect(await screen.findByText('Could not load availability. Please try again.')).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

      expect(await screen.findByText('Jayden Biden')).toBeInTheDocument();
      expect(availabilityAPI.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('availability grid', () => {
    test('shows one column per tutor and one row per time slot', async () => {
      await renderAndWait();
      expect(tutorColumns()).toEqual(['Jayden Biden', 'John Wick', 'Charles Oden']);
      expect(screen.getAllByRole('row')).toHaveLength(15); // 1 header + 14 time slots
      expect(screen.getByText('8:00am')).toBeInTheDocument();
      expect(screen.getByText('9:00pm')).toBeInTheDocument();
    });

    test('shows badges in the right cells for Monday', async () => {
      await renderAndWait();
      expect(within(getCell('Jayden Biden', '8:00am')).getByText('PREFERRED')).toHaveClass('badge--preferred');
      expect(within(getCell('Jayden Biden', '9:00am')).getByText('AVAILABLE')).toHaveClass('badge--available');
      expect(within(getCell('John Wick', '8:00am')).getByText('AVOID')).toHaveClass('badge--avoid');
      expect(getCell('Charles Oden', '8:00am')).toBeEmptyDOMElement();
    });

    test('switching day shows that day\'s availability', async () => {
      await renderAndWait();
      const tueTab = screen.getByRole('button', { name: 'TUE' });

      await userEvent.click(tueTab);

      expect(tueTab).toHaveClass('uca-day-tab--active');
      expect(screen.getByRole('button', { name: 'MON' })).not.toHaveClass('uca-day-tab--active');
      expect(within(getCell('Charles Oden', '10:00am')).getByText('PREFERRED')).toBeInTheDocument();
      expect(screen.queryByText('AVOID')).not.toBeInTheDocument();
      expect(screen.getAllByText('PREFERRED')).toHaveLength(1);
    });

    test('a day with no data shows an empty grid', async () => {
      await renderAndWait();
      await userEvent.click(screen.getByRole('button', { name: 'WED' }));

      expect(screen.queryByText('PREFERRED')).not.toBeInTheDocument();
      expect(screen.queryByText('AVAILABLE')).not.toBeInTheDocument();
      expect(screen.queryByText('AVOID')).not.toBeInTheDocument();
    });
  });

  describe('search', () => {
    const search = (text) => userEvent.type(screen.getByRole('textbox', { name: 'Search tutor by name' }), text);

    test('matches the start of any word in the name', async () => {
      await renderAndWait();
      await search('j');
      expect(tutorColumns()).toEqual(['Jayden Biden', 'John Wick']);
    });

    test('matches a surname', async () => {
      await renderAndWait();
      await search('oden');
      expect(tutorColumns()).toEqual(['Charles Oden']);
    });

    test('ignores upper/lower case', async () => {
      await renderAndWait();
      await search('JOHN');
      expect(tutorColumns()).toEqual(['John Wick']);
    });

    test('does not match letters in the middle of a word', async () => {
      await renderAndWait();
      await search('den'); // inside "Biden" and "Oden", but not at the start
      expect(screen.getByText('No tutors match "den"')).toBeInTheDocument();
    });

    test('the clear button shows all tutors again', async () => {
      await renderAndWait();
      await search('john');

      await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));

      expect(tutorColumns()).toHaveLength(3);
      expect(screen.getByRole('textbox', { name: 'Search tutor by name' })).toHaveValue('');
      expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();
    });
  });

  describe('reminders', () => {
    test('shows a reminder bell only for tutors who have not submitted', async () => {
      await renderAndWait();
      expect(screen.queryByRole('button', { name: 'Send reminder to Jayden Biden' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Send reminder to John Wick' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Send reminder to Charles Oden' })).toBeInTheDocument();
    });

    test('clicking the bell sends a reminder once and disables it', async () => {
      const onSendReminder = jest.fn();
      await renderAndWait({ onSendReminder });

      await userEvent.click(screen.getByRole('button', { name: 'Send reminder to John Wick' }));

      expect(onSendReminder).toHaveBeenCalledWith('t2');
      const sent = screen.getByRole('button', { name: 'Reminder sent to John Wick' });
      expect(sent).toBeDisabled();
      expect(sent).toHaveClass('uca-bell--sent');

      await userEvent.click(sent);
      expect(onSendReminder).toHaveBeenCalledTimes(1);
    });

    test('works even without an onSendReminder handler', async () => {
      await renderAndWait();
      await userEvent.click(screen.getByRole('button', { name: 'Send reminder to Charles Oden' }));
      expect(screen.getByRole('button', { name: 'Reminder sent to Charles Oden' })).toBeInTheDocument();
    });
  });

  describe('locking submissions', () => {
    test('an open unit shows "Lock Submissions" and no closed banner', async () => {
      await renderAndWait();
      expect(screen.getByRole('button', { name: 'Lock Submissions' })).toBeInTheDocument();
      expect(screen.queryByText(/submissions are closed/i)).not.toBeInTheDocument();
    });

    test('locking calls the API and refreshes the unit', async () => {
      await renderAndWait();
      await userEvent.click(screen.getByRole('button', { name: 'Lock Submissions' }));

      expect(unitsAPI.lockAvailability).toHaveBeenCalledWith('u1');
      await waitFor(() => expect(mockRefreshUnits).toHaveBeenCalled());
      expect(unitsAPI.unlockAvailability).not.toHaveBeenCalled();
    });

    test('a locked unit shows a banner and an Unlock button', async () => {
      setupUnit({ availabilityLocked: true });
      await renderAndWait();

      expect(screen.getByText('Submissions are closed for this unit (locked manually).')).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Unlock Submissions' }));
      expect(unitsAPI.unlockAvailability).toHaveBeenCalledWith('u1');
    });

    test('shows a closed banner when the deadline has passed', async () => {
      setupUnit({ availabilityDeadline: '2020-01-01T00:00:00Z' });
      await renderAndWait();
      expect(screen.getByText(/submissions are closed for this unit \(deadline passed/i)).toBeInTheDocument();
    });

    test('no banner when the deadline is in the future', async () => {
      setupUnit({ availabilityDeadline: '2099-01-01T00:00:00Z' });
      await renderAndWait();
      expect(screen.queryByText(/submissions are closed/i)).not.toBeInTheDocument();
    });

    test('shows "Updating..." and disables the button while saving', async () => {
      unitsAPI.lockAvailability.mockReturnValue(new Promise(() => {}));
      await renderAndWait();
      await userEvent.click(screen.getByRole('button', { name: 'Lock Submissions' }));

      expect(screen.getByRole('button', { name: 'Updating...' })).toBeDisabled();
    });

    test('shows an alert if locking fails', async () => {
      unitsAPI.lockAvailability.mockRejectedValue(new Error('Not allowed'));
      await renderAndWait();
      await userEvent.click(screen.getByRole('button', { name: 'Lock Submissions' }));

      await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Not allowed'));
      expect(screen.getByRole('button', { name: 'Lock Submissions' })).toBeEnabled();
    });
  });

  describe('zoom', () => {
    test('zoom in, zoom out and reset change the grid size', async () => {
      await renderAndWait();
      expect(screen.getByText('100%')).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
      expect(screen.getByText('110%')).toBeInTheDocument();
      expect(screen.getByRole('table')).toHaveStyle('transform: scale(1.1)');

      await userEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
      await userEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
      expect(screen.getByText('90%')).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Reset' }));
      expect(screen.getByText('100%')).toBeInTheDocument();
    });

    test('zoom stops at 200%', async () => {
      await renderAndWait();
      for (let i = 0; i < 12; i++) {
        await userEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
      }
      expect(screen.getByText('200%')).toBeInTheDocument();
    });

    test('zoom stops at 50%', async () => {
      await renderAndWait();
      for (let i = 0; i < 7; i++) {
        await userEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
      }
      expect(screen.getByText('50%')).toBeInTheDocument();
    });
  });

  describe('fullscreen', () => {
    test('entering fullscreen requests fullscreen on the grid card', async () => {
      await renderAndWait();
      await userEvent.click(screen.getByRole('button', { name: 'Enter fullscreen' }));

      expect(HTMLElement.prototype.requestFullscreen).toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Exit fullscreen' })).toBeInTheDocument();
      expect(document.querySelector('.uca-card')).toHaveClass('uca-card--fullscreen');
    });

    test('exiting fullscreen calls exitFullscreen', async () => {
      await renderAndWait();
      await userEvent.click(screen.getByRole('button', { name: 'Enter fullscreen' }));

      // Pretend the browser is now in fullscreen mode
      Object.defineProperty(document, 'fullscreenElement', {
        value: document.querySelector('.uca-card'),
        configurable: true,
      });
      await userEvent.click(screen.getByRole('button', { name: 'Exit fullscreen' }));

      expect(document.exitFullscreen).toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Enter fullscreen' })).toBeInTheDocument();
    });

    test('pressing Esc (browser leaves fullscreen) updates the button', async () => {
      await renderAndWait();
      await userEvent.click(screen.getByRole('button', { name: 'Enter fullscreen' }));

      // The browser fires "fullscreenchange" with no fullscreen element
      Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
      fireEvent(document, new Event('fullscreenchange'));

      expect(screen.getByRole('button', { name: 'Enter fullscreen' })).toBeInTheDocument();
    });
  });
});