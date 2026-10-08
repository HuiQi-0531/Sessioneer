import React from 'react';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import TutorAvailability from './TutorAvailability';
import { availabilityAPI } from '../config/api';
import { useActiveUnit } from '../context/ActiveUnitContext';

// ---------- Mocks ----------

jest.mock('../config/api', () => ({
  availabilityAPI: { get: jest.fn(), submit: jest.fn() },
}));

jest.mock('../context/ActiveUnitContext', () => ({ useActiveUnit: jest.fn() }));

jest.mock('../utils/roles', () => ({
  unitHasTutorAccess: (unit) => Boolean(unit && unit.roles && unit.roles.includes('tutor')),
}));

jest.mock('lucide-react', () => ({ Info: () => null }));
jest.mock('../components/TutorSidebar', () => () => null);
jest.mock('../components/UCPageHeader', () => ({ title }) => title);

// ---------- Test data ----------

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const TIMES = [
  '8:00am', '9:00am', '10:00am', '11:00am', '12:00pm', '1:00pm', '2:00pm',
  '3:00pm', '4:00pm', '5:00pm', '6:00pm', '7:00pm', '8:00pm', '9:00pm',
];

const u1 = { id: 'u1', unitCode: 'FIT1001', roles: ['tutor'] };
const u2 = { id: 'u2', unitCode: 'FIT2002', roles: ['tutor'] };
const u3 = { id: 'u3', unitCode: 'FIT3003', roles: ['coordinator'] }; // not a tutor here
const lockedUnit = { id: 'u4', unitCode: 'FIT4004', roles: ['tutor'], availabilityLocked: true };
const pastDeadlineUnit = { id: 'u5', unitCode: 'FIT5005', roles: ['tutor'], availabilityDeadline: '2020-01-01T00:00:00Z' };

const defaultUnits = [u1, u2, u3];

// What the server returns when this tutor already submitted
const serverData = {
  availability: {
    MON: {
      tutor1: { '8:00am': 'preferred', '9:00am': 'avoid' },
      someoneElse: { '11:00am': 'preferred' }, // another tutor, should be ignored
    },
    TUE: {
      tutor1: { '10:00am': 'available' },
    },
  },
};

const setupUnits = (units = defaultUnits, isLoading = false) => {
  useActiveUnit.mockReturnValue({ allUnits: units, isLoading });
};

// ---------- Helpers ----------

const renderAndWait = async () => {
  render(<TutorAvailability />);
  await waitFor(() =>
    expect(screen.queryByText('Loading latest availability...')).not.toBeInTheDocument()
  );
};

// The slot button for a day (column) and time (row)
const slot = (day, time) =>
  screen.getByText(time).closest('tr').children[DAYS.indexOf(day) + 1].querySelector('button');

const paintBtn = (name) =>
  within(document.querySelector('.paint-toolbar')).getByRole('button', { name });

const bulkMenu = () => within(document.querySelector('.bulk-fill-menu'));

const chooseUnit = async (unitId) => {
  await userEvent.selectOptions(screen.getByLabelText('Submit to:'), unitId);
  await waitFor(() =>
    expect(screen.queryByText('Loading latest availability...')).not.toBeInTheDocument()
  );
};

// ---------- Setup ----------

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('currentUser', JSON.stringify({ id: 'tutor1' }));
  setupUnits();
  availabilityAPI.get.mockResolvedValue({ availability: {} });
  availabilityAPI.submit.mockResolvedValue({});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------- Tests ----------

describe('TutorAvailability', () => {
  describe('page states', () => {
    test('shows a loading message while units load', () => {
      setupUnits(defaultUnits, true);
      render(<TutorAvailability />);
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    test('shows a message when the user is not a tutor in any unit', () => {
      setupUnits([u3]);
      render(<TutorAvailability />);
      expect(screen.getByText(/once you're linked to a tutor unit/i)).toBeInTheDocument();
      expect(availabilityAPI.get).not.toHaveBeenCalled();
    });
  });

  describe('loading availability', () => {
    test('starts with an empty, editable grid when nothing is submitted', async () => {
      await renderAndWait();

      expect(availabilityAPI.get).toHaveBeenCalledWith('FIT1001');
      expect(availabilityAPI.get).toHaveBeenCalledWith('FIT2002');
      expect(availabilityAPI.get).not.toHaveBeenCalledWith('FIT3003');

      expect(screen.getByText('Applies to all tutor units')).toBeInTheDocument();
      expect(screen.getAllByText('UNSELECTED')).toHaveLength(70); // 5 days x 14 times
      expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
      expect(screen.getByText(/pick a status/i)).toBeInTheDocument();
    });

    test('shows this tutor\'s submitted availability from the server as read-only', async () => {
      availabilityAPI.get.mockImplementation(code =>
        Promise.resolve(code === 'FIT1001' ? serverData : { availability: {} })
      );
      await renderAndWait();

      expect(slot('Monday', '8:00am')).toHaveTextContent('PREFERRED');
      expect(slot('Monday', '9:00am')).toHaveTextContent('AVOID');
      expect(slot('Tuesday', '10:00am')).toHaveTextContent('AVAILABLE');
      expect(slot('Monday', '11:00am')).toHaveTextContent('UNSELECTED'); // other tutor's data

      expect(screen.getByText('SUBMITTED')).toBeInTheDocument();
      expect(screen.getByText('PREFERRED: 1')).toBeInTheDocument();
      expect(screen.getByText('AVAILABLE: 1')).toBeInTheDocument();
      expect(screen.getByText('AVOID: 1')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
      expect(slot('Monday', '8:00am')).toBeDisabled();

      expect(availabilityAPI.get).toHaveBeenCalledTimes(1); // stops at the first unit with data
      expect(JSON.parse(localStorage.getItem('availabilityData_tutor1_shared'))).toEqual({
        'Monday-8:00am': 'preferred',
        'Monday-9:00am': 'avoid',
        'Tuesday-10:00am': 'available',
      });
    });

    test('shows availability saved on this device', async () => {
      localStorage.setItem('availabilityData_tutor1_shared', JSON.stringify({ 'Wednesday-1:00pm': 'avoid' }));
      await renderAndWait();

      expect(slot('Wednesday', '1:00pm')).toHaveTextContent('AVOID');
      expect(screen.getByText('SUBMITTED')).toBeInTheDocument();
    });

    test('shows an error if the server cannot be reached', async () => {
      availabilityAPI.get.mockRejectedValue(new Error('Server down'));
      await renderAndWait();

      expect(screen.getByText(/could not load the latest availability/i)).toBeInTheDocument();
    });
  });

  describe('painting slots', () => {
    test('tapping a slot applies Preferred by default, and tapping again clears it', async () => {
      await renderAndWait();
      expect(paintBtn('Preferred')).toHaveClass('active');

      await userEvent.click(slot('Monday', '8:00am'));
      expect(slot('Monday', '8:00am')).toHaveTextContent('PREFERRED');
      expect(slot('Monday', '8:00am')).toHaveClass('preferred');

      await userEvent.click(slot('Monday', '8:00am'));
      expect(slot('Monday', '8:00am')).toHaveTextContent('UNSELECTED');
    });

    test('picking a different status paints with that status', async () => {
      await renderAndWait();
      await userEvent.click(paintBtn('Avoid'));

      expect(paintBtn('Avoid')).toHaveClass('active');
      expect(paintBtn('Preferred')).not.toHaveClass('active');

      await userEvent.click(slot('Friday', '5:00pm'));
      expect(slot('Friday', '5:00pm')).toHaveTextContent('AVOID');
    });

    test('painting over a slot with a different status replaces it', async () => {
      await renderAndWait();
      await userEvent.click(slot('Monday', '8:00am'));

      await userEvent.click(paintBtn('Available'));
      await userEvent.click(slot('Monday', '8:00am'));

      expect(slot('Monday', '8:00am')).toHaveTextContent('AVAILABLE');
    });

    test('the Eraser clears a slot', async () => {
      await renderAndWait();
      await userEvent.click(slot('Monday', '8:00am'));

      await userEvent.click(paintBtn('Eraser'));
      await userEvent.click(slot('Monday', '8:00am'));

      expect(slot('Monday', '8:00am')).toHaveTextContent('UNSELECTED');
    });
  });

  describe('bulk fill', () => {
    test('a day header fills the whole day', async () => {
      await renderAndWait();
      await userEvent.click(screen.getByRole('button', { name: 'Fill all of Monday' }));

      expect(bulkMenu().getByText('Set all of Monday to:')).toBeInTheDocument();
      await userEvent.click(bulkMenu().getByRole('button', { name: 'Available' }));

      TIMES.forEach(time => expect(slot('Monday', time)).toHaveTextContent('AVAILABLE'));
      expect(slot('Tuesday', '8:00am')).toHaveTextContent('UNSELECTED');
      expect(document.querySelector('.bulk-fill-menu')).not.toBeInTheDocument();
    });

    test('a time label fills that time on every day', async () => {
      await renderAndWait();
      await userEvent.click(screen.getByRole('button', { name: 'Fill all of 9:00am' }));
      await userEvent.click(bulkMenu().getByRole('button', { name: 'Avoid' }));

      DAYS.forEach(day => expect(slot(day, '9:00am')).toHaveTextContent('AVOID'));
      expect(slot('Monday', '10:00am')).toHaveTextContent('UNSELECTED');
    });

    test('"Clear" empties the whole day', async () => {
      await renderAndWait();
      await userEvent.click(screen.getByRole('button', { name: 'Fill all of Monday' }));
      await userEvent.click(bulkMenu().getByRole('button', { name: 'Preferred' }));

      await userEvent.click(screen.getByRole('button', { name: 'Fill all of Monday' }));
      await userEvent.click(bulkMenu().getByRole('button', { name: 'Clear' }));

      TIMES.forEach(time => expect(slot('Monday', time)).toHaveTextContent('UNSELECTED'));
    });

    test('clicking outside closes the menu', async () => {
      await renderAndWait();
      await userEvent.click(screen.getByRole('button', { name: 'Fill all of Monday' }));
      expect(document.querySelector('.bulk-fill-menu')).toBeInTheDocument();

      fireEvent.mouseDown(document.body);

      expect(document.querySelector('.bulk-fill-menu')).not.toBeInTheDocument();
    });
  });

  describe('submitting', () => {
    test('submits to every open unit and shows the saved summary', async () => {
      await renderAndWait();
      await userEvent.click(slot('Monday', '8:00am'));
      await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

      const expected = { 'Monday-8:00am': 'preferred' };
      expect(availabilityAPI.submit).toHaveBeenCalledWith('FIT1001', expected);
      expect(availabilityAPI.submit).toHaveBeenCalledWith('FIT2002', expected);
      expect(availabilityAPI.submit).toHaveBeenCalledTimes(2);

      expect(await screen.findByText('Availability saved successfully!')).toBeInTheDocument();
      expect(screen.getByText('PREFERRED: 1')).toBeInTheDocument();
      expect(slot('Monday', '8:00am')).toBeDisabled();
      expect(JSON.parse(localStorage.getItem('availabilityData_tutor1_shared'))).toEqual(expected);
    });

    test('skips closed units and says so', async () => {
      setupUnits([u1, lockedUnit]);
      await renderAndWait();

      expect(screen.getByText(/1 unit is already closed and will keep the previous submission/)).toBeInTheDocument();

      await userEvent.click(slot('Monday', '8:00am'));
      await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

      expect(availabilityAPI.submit).toHaveBeenCalledTimes(1);
      expect(availabilityAPI.submit).toHaveBeenCalledWith('FIT1001', { 'Monday-8:00am': 'preferred' });
    });

    test('shows "Submitting..." while saving', async () => {
      availabilityAPI.submit.mockReturnValue(new Promise(() => {}));
      await renderAndWait();
      await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

      expect(screen.getByRole('button', { name: 'Submitting...' })).toBeDisabled();
    });

    test('shows an error and stays editable if submitting fails', async () => {
      availabilityAPI.submit.mockRejectedValue(new Error('Server error'));
      await renderAndWait();
      await userEvent.click(slot('Monday', '8:00am'));
      await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

      expect(await screen.findByText('Server error')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Submit' })).toBeEnabled();
      expect(slot('Monday', '8:00am')).toBeEnabled();
    });

    test('"Edit" makes a submitted grid editable again', async () => {
      await renderAndWait();
      await userEvent.click(screen.getByRole('button', { name: 'Submit' }));
      await screen.findByText('Availability saved successfully!');

      await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

      expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
      expect(slot('Monday', '8:00am')).toBeEnabled();
    });
  });

  describe('choosing a specific unit', () => {
    test('lists only tutor units and loads just the chosen one', async () => {
      await renderAndWait();
      const options = within(screen.getByLabelText('Submit to:')).getAllByRole('option');
      expect(options.map(o => o.textContent)).toEqual(['All Units', 'FIT1001', 'FIT2002']);

      availabilityAPI.get.mockClear();
      await chooseUnit('u2');

      expect(screen.getByText('Applies to FIT2002 only')).toBeInTheDocument();
      expect(availabilityAPI.get).toHaveBeenCalledTimes(1);
      expect(availabilityAPI.get).toHaveBeenCalledWith('FIT2002');
    });

    test('submits only to the chosen unit', async () => {
      await renderAndWait();
      await chooseUnit('u2');
      await userEvent.click(slot('Monday', '8:00am'));
      await userEvent.click(screen.getByRole('button', { name: 'Submit' }));

      expect(availabilityAPI.submit).toHaveBeenCalledTimes(1);
      expect(availabilityAPI.submit).toHaveBeenCalledWith('FIT2002', { 'Monday-8:00am': 'preferred' });
      expect(await screen.findByText('Availability saved for FIT2002!')).toBeInTheDocument();
      expect(screen.getByText('SUBMITTED — FIT2002')).toBeInTheDocument();
      expect(localStorage.getItem('availabilityData_tutor1_unit_u2')).not.toBeNull();
    });

    test('each unit keeps its own saved availability', async () => {
      localStorage.setItem('availabilityData_tutor1_unit_u1', JSON.stringify({ 'Monday-8:00am': 'avoid' }));
      await renderAndWait();

      await chooseUnit('u1');
      expect(slot('Monday', '8:00am')).toHaveTextContent('AVOID');

      await chooseUnit('u2');
      expect(slot('Monday', '8:00am')).toHaveTextContent('UNSELECTED');
    });
  });

  describe('closed submissions', () => {
    test('when every unit is closed, the grid is read-only', async () => {
      setupUnits([lockedUnit, pastDeadlineUnit]);
      await renderAndWait();

      expect(screen.getByText(/submissions are closed for this unit/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Submit' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
      expect(screen.queryByText(/pick a status/i)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Fill all of Monday' })).not.toBeInTheDocument();
      expect(slot('Monday', '8:00am')).toBeDisabled();
    });

    test('choosing a closed unit shows it is closed', async () => {
      setupUnits([u1, lockedUnit]);
      await renderAndWait();
      await chooseUnit('u4');

      expect(screen.getByText(/submissions are closed for FIT4004/i)).toBeInTheDocument();
      expect(slot('Monday', '8:00am')).toBeDisabled();
    });
  });

  describe('help tooltip', () => {
    test('the info button shows instructions, and clicking outside hides them', async () => {
      await renderAndWait();
      await userEvent.click(screen.getByRole('button', { name: 'How to use the availability grid' }));

      expect(screen.getByText('2. Tap any time slot to apply it.')).toBeInTheDocument();

      fireEvent.mouseDown(document.body);

      expect(screen.queryByText('2. Tap any time slot to apply it.')).not.toBeInTheDocument();
    });
  });
});