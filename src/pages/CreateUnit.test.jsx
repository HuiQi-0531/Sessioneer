import React from 'react';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';

import CreateUnit from './CreateUnit';
import { unitsAPI } from '../config/api';

// ---------- Mocks ----------

let mockParams = {};
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => mockParams,
  useNavigate: () => mockNavigate,
}));

jest.mock('../config/api', () => ({
  unitsAPI: {
    getOne: jest.fn(),
    getCoordinators: jest.fn(),
    addCoordinator: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
}));

jest.mock('../utils/userName', () => ({
  getDisplayName: (user) => (user && user.name) || '',
  getAvatarLetter: (user) => ((user && user.name) || '?').charAt(0),
}));
jest.mock('../components/UCPageHeader', () => ({ title }) => title);

// ---------- Test data ----------

// The semester list is built from the current year, so the tests do the same
const year = new Date().getFullYear();

const existingUnit = {
  unitCode: 'FIT1001', unitName: 'Intro Programming', semester: 'Semester 1', year,
  enrolmentSize: 250, availabilityDeadline: '2026-10-01T00:00:00Z',
};

const existingCoordinators = [
  { id: 'c1', fullName: 'Sam Coordinator', email: 'sam@uni.edu', isMain: true },
  { id: 'c2', email: 'jo@uni.edu' }, // no name yet
];

// ---------- Helpers ----------

const renderPage = () =>
  render(
    <MemoryRouter>
      <CreateUnit />
    </MemoryRouter>
  );

const input = (name) => document.querySelector(`[name="${name}"]`);
const coordinatorInput = () => screen.getByPlaceholderText('coordinator@example.com');
const coordinatorToggle = () => screen.getByRole('button', { name: /unit coordinators/i });

const fillRequired = async () => {
  await userEvent.type(input('unitCode'), 'IFN501');
  await userEvent.type(input('unitName'), 'Digital Futures');
  await userEvent.selectOptions(input('semesterYear'), `Semester 2|${year}`);
};

const addDraftEmail = async (email) => {
  await userEvent.clear(coordinatorInput());
  if (email) await userEvent.type(coordinatorInput(), email);
  await userEvent.click(screen.getByRole('button', { name: 'Add' }));
};

const renderEditAndWait = async () => {
  mockParams = { id: 'u1' };
  renderPage();
  await waitFor(() => expect(input('unitCode')).toHaveValue('FIT1001'));
};

// ---------- Setup ----------

beforeEach(() => {
  mockParams = {};
  mockNavigate.mockReset();
  localStorage.clear();
  localStorage.setItem('currentUser', JSON.stringify({ id: 'me', name: 'Sam Coordinator', email: 'Sam@uni.edu' }));

  unitsAPI.getOne.mockResolvedValue(existingUnit);
  unitsAPI.getCoordinators.mockResolvedValue(existingCoordinators);
  unitsAPI.addCoordinator.mockResolvedValue({ coordinator: { id: 'c3', fullName: 'New Person', email: 'new@uni.edu' } });
  unitsAPI.create.mockResolvedValue({
    unitCode: 'IFN501', unitName: 'Digital Futures', semester: 'Semester 2', year, enrolmentSize: 300,
  });
  unitsAPI.update.mockResolvedValue({});

  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------- Tests ----------

describe('CreateUnit', () => {
  describe('creating a unit', () => {
    test('shows an empty form, the user, and semester options around this year', async () => {
      renderPage();

      expect(screen.getByRole('heading', { name: 'Create New Unit' })).toBeInTheDocument();
      expect(screen.getByText('Sam Coordinator')).toBeInTheDocument();
      expect(screen.getByText('New Unit')).toBeInTheDocument();

      const options = Array.from(input('semesterYear').options).map(o => o.textContent);
      expect(options).toHaveLength(13); // "-- Select --" + 4 years x 3 semesters
      expect(options[1]).toBe(`Semester 1, ${year - 1}`);
      expect(options[options.length - 1]).toBe(`Summer, ${year + 2}`);

      // The sidebar shows the unit code as it's typed
      await userEvent.type(input('unitCode'), 'IFN501');
      expect(screen.getByText('IFN501')).toBeInTheDocument();
      expect(unitsAPI.getOne).not.toHaveBeenCalled();
    });

    test('unit code, name and semester are required', async () => {
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: 'Create Unit' }));

      expect(screen.getByText('Please fill in Unit Code, Unit Name, and Semester.')).toHaveClass('cu-error');
      expect(unitsAPI.create).not.toHaveBeenCalled();
    });

    test('creates the unit and shows a summary', async () => {
      renderPage();
      await fillRequired();
      await userEvent.type(input('enrolmentSize'), '300');
      fireEvent.change(input('availabilityDeadline'), { target: { value: '2026-10-01' } });
      await userEvent.click(screen.getByRole('button', { name: 'Create Unit' }));

      expect(unitsAPI.create).toHaveBeenCalledWith({
        unitCode: 'IFN501',
        unitName: 'Digital Futures',
        semester: 'Semester 2',
        year,
        enrolmentSize: 300,
        availabilityDeadline: '2026-10-01',
        coordinatorEmails: [],
      });

      expect(await screen.findByRole('heading', { name: 'Unit Created Successfully' })).toBeInTheDocument();
      expect(screen.getByText('Digital Futures')).toBeInTheDocument();
      expect(screen.getByText(`Semester 2, ${year}`)).toBeInTheDocument();
      expect(screen.getByText('300')).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Done' }));
      expect(mockNavigate).toHaveBeenCalledWith('/unit-setup');
    });

    test('optional fields left empty are sent as "not set"', async () => {
      unitsAPI.create.mockResolvedValue({
        unitCode: 'IFN501', unitName: 'Digital Futures', semester: 'Semester 2', year, enrolmentSize: null,
      });
      renderPage();
      await fillRequired();
      await userEvent.click(screen.getByRole('button', { name: 'Create Unit' }));

      expect(unitsAPI.create).toHaveBeenCalledWith(expect.objectContaining({
        enrolmentSize: null,
        availabilityDeadline: null,
      }));
      // The summary shows "-" for the missing enrolment size
      const enrolmentRow = (await screen.findByText('Enrolment Size')).closest('.cu-summary-row');
      expect(within(enrolmentRow).getByText('-')).toBeInTheDocument();
    });

    test('shows the error if creating fails', async () => {
      unitsAPI.create.mockRejectedValue(new Error('A unit with this code already exists'));
      renderPage();
      await fillRequired();
      await userEvent.click(screen.getByRole('button', { name: 'Create Unit' }));

      expect(await screen.findByText('A unit with this code already exists')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Create New Unit' })).toBeInTheDocument();
    });

    test('shows "Saving..." while creating', async () => {
      unitsAPI.create.mockReturnValue(new Promise(() => {}));
      renderPage();
      await fillRequired();
      await userEvent.click(screen.getByRole('button', { name: 'Create Unit' }));

      expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
    });

    test('"Cancel" returns to Unit Setup', async () => {
      renderPage();
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(mockNavigate).toHaveBeenCalledWith('/unit-setup');
    });
  });

  describe('adding coordinators while creating', () => {
    test('the coordinator section is hidden until opened', async () => {
      renderPage();
      expect(coordinatorToggle()).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByPlaceholderText('coordinator@example.com')).not.toBeInTheDocument();

      await userEvent.click(coordinatorToggle());

      expect(coordinatorToggle()).toHaveAttribute('aria-expanded', 'true');
      expect(coordinatorInput()).toBeInTheDocument();
    });

    test('added emails are tidied up, listed, and sent with the new unit', async () => {
      renderPage();
      await userEvent.click(coordinatorToggle());
      await addDraftEmail('  Jo@Uni.EDU  ');

      expect(screen.getByText('jo@uni.edu')).toHaveClass('cu-email-chip');
      expect(coordinatorInput()).toHaveValue('');
      expect(screen.getByText('1 to add')).toBeInTheDocument();

      await fillRequired();
      await userEvent.click(screen.getByRole('button', { name: 'Create Unit' }));

      expect(unitsAPI.create).toHaveBeenCalledWith(expect.objectContaining({ coordinatorEmails: ['jo@uni.edu'] }));
    });

    test('rejects empty, invalid, your own, and duplicate emails', async () => {
      renderPage();
      await userEvent.click(coordinatorToggle());

      await addDraftEmail('');
      expect(screen.getByText('Enter a coordinator email first.')).toBeInTheDocument();

      await addDraftEmail('not-an-email');
      expect(screen.getByText('Enter a valid email address.')).toBeInTheDocument();

      await addDraftEmail('sam@uni.edu'); // the logged-in user
      expect(screen.getByText('You are already added automatically.')).toBeInTheDocument();

      await addDraftEmail('jo@uni.edu');
      await addDraftEmail('JO@uni.edu');
      expect(screen.getByText('This coordinator is already in the list.')).toBeInTheDocument();
      expect(screen.getAllByText('jo@uni.edu')).toHaveLength(1);
    });

    test('an added email can be removed', async () => {
      renderPage();
      await userEvent.click(coordinatorToggle());
      await addDraftEmail('jo@uni.edu');

      await userEvent.click(screen.getByRole('button', { name: 'Remove jo@uni.edu' }));

      expect(screen.queryByText('jo@uni.edu')).not.toBeInTheDocument();
      expect(screen.getByText(/optional/i)).toBeInTheDocument();
    });
  });

  describe('editing a unit', () => {
    test('loads the unit and its coordinators into the form', async () => {
      await renderEditAndWait();

      expect(unitsAPI.getOne).toHaveBeenCalledWith('u1');
      expect(unitsAPI.getCoordinators).toHaveBeenCalledWith('u1');
      expect(screen.getByRole('heading', { name: 'Edit Unit' })).toBeInTheDocument();
      expect(input('unitName')).toHaveValue('Intro Programming');
      expect(input('semesterYear')).toHaveValue(`Semester 1|${year}`);
      expect(input('enrolmentSize')).toHaveValue(250);
      expect(input('availabilityDeadline')).toHaveValue('2026-10-01');

      // With coordinators, the section opens by itself
      expect(coordinatorToggle()).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText('2 added')).toBeInTheDocument();
      const main = screen.getByText('Sam Coordinator', { selector: 'strong' }).closest('.cu-coordinator-item');
      expect(within(main).getByText('Main')).toBeInTheDocument();
      expect(screen.getAllByText('jo@uni.edu')).toHaveLength(2); // shown as both name and email
    });

    test('the coordinator section stays closed when there are no coordinators', async () => {
      unitsAPI.getCoordinators.mockResolvedValue([]);
      await renderEditAndWait();
      expect(coordinatorToggle()).toHaveAttribute('aria-expanded', 'false');
    });

    test('shows an error if the unit cannot be loaded', async () => {
      unitsAPI.getOne.mockRejectedValue(new Error('Not found'));
      mockParams = { id: 'u1' };
      renderPage();

      expect(await screen.findByText('Could not load this unit.')).toBeInTheDocument();
    });

    test('"Save Changes" updates the unit and returns to Unit Setup', async () => {
      await renderEditAndWait();
      await userEvent.clear(input('unitName'));
      await userEvent.type(input('unitName'), 'Programming Basics');
      await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

      expect(unitsAPI.update).toHaveBeenCalledWith('u1', {
        unitCode: 'FIT1001',
        unitName: 'Programming Basics',
        semester: 'Semester 1',
        year,
        enrolmentSize: 250,
        availabilityDeadline: '2026-10-01',
        coordinatorEmails: [],
      });
      await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/unit-setup'));
      expect(unitsAPI.create).not.toHaveBeenCalled();
    });

    test('a new coordinator is added to the unit straight away', async () => {
      await renderEditAndWait();
      await userEvent.type(coordinatorInput(), '  New@Uni.edu ');
      await userEvent.click(screen.getByRole('button', { name: 'Add' }));

      expect(unitsAPI.addCoordinator).toHaveBeenCalledWith('u1', 'new@uni.edu');
      expect(await screen.findByText('New Person')).toBeInTheDocument();
      expect(coordinatorInput()).toHaveValue('');
      expect(screen.getByText('3 added')).toBeInTheDocument();
    });

    test('someone already linked to the unit is not added again', async () => {
      await renderEditAndWait();
      await userEvent.type(coordinatorInput(), 'JO@uni.edu');
      await userEvent.click(screen.getByRole('button', { name: 'Add' }));

      expect(screen.getByText('This coordinator is already linked to the unit.')).toBeInTheDocument();
      expect(unitsAPI.addCoordinator).not.toHaveBeenCalled();
    });

    test('shows the error if adding a coordinator fails', async () => {
      unitsAPI.addCoordinator.mockRejectedValue(new Error('No account with that email'));
      await renderEditAndWait();
      await userEvent.type(coordinatorInput(), 'ghost@uni.edu');
      await userEvent.click(screen.getByRole('button', { name: 'Add' }));

      expect(await screen.findByText('No account with that email')).toHaveClass('cu-coordinator-error');
    });

    test('shows "Adding..." while a coordinator is being added', async () => {
      unitsAPI.addCoordinator.mockReturnValue(new Promise(() => {}));
      await renderEditAndWait();
      await userEvent.type(coordinatorInput(), 'new@uni.edu');
      await userEvent.click(screen.getByRole('button', { name: 'Add' }));

      expect(screen.getByRole('button', { name: 'Adding...' })).toBeDisabled();
    });
  });
});