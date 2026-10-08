import React from 'react';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';

import UnitSetup from './UnitSetup';
import { unitsAPI } from '../config/api';
import { useActiveUnit } from '../context/ActiveUnitContext';

// ---------- Mocks ----------

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('../config/api', () => ({
  unitsAPI: { delete: jest.fn(), duplicate: jest.fn() },
}));

jest.mock('../context/ActiveUnitContext', () => ({ useActiveUnit: jest.fn() }));
jest.mock('../components/UCSidebar', () => () => null);
jest.mock('../components/UCPageHeader', () => ({ title }) => title);

// ---------- Test data ----------

const defaultUnits = [
  { id: 'u1', unitCode: 'FIT1001', unitName: 'Intro Programming', semester: 'Semester 1', year: 2026, isActive: true, roles: ['coordinator'] },
  { id: 'u2', unitCode: 'FIT2002', unitName: 'Databases', semester: 'Semester 2', year: 2026, isActive: true, roles: ['coordinator'] },
  { id: 'u3', unitCode: 'FIT3003', unitName: 'Old Unit', semester: 'Semester 1', year: 2025, isActive: false, roles: ['coordinator'] },
  { id: 'u4', unitCode: 'FIT4004', unitName: 'Tutoring Only', semester: 'Semester 1', year: 2026, isActive: true, roles: ['tutor'] },
];

const mockSetActiveUnitId = jest.fn();
const mockRefreshUnits = jest.fn();

// A fake context that remembers which unit is selected, like the real one
const setupContext = ({ units = defaultUnits, activeUnitId = null, isLoading = false } = {}) => {
  useActiveUnit.mockImplementation(() => {
    const [id, setId] = React.useState(activeUnitId);
    return {
      allUnits: units,
      activeUnit: units.find(u => u.id === id) || null,
      activeUnitId: id,
      setActiveUnitId: (newId) => {
        mockSetActiveUnitId(newId);
        setId(newId);
      },
      refreshUnits: mockRefreshUnits,
      isLoading,
    };
  });
};

const renderUnitSetup = () =>
  render(
    <MemoryRouter>
      <UnitSetup />
    </MemoryRouter>
  );

const getModal = () => within(document.querySelector('.us-modal-content'));
const actionButton = (name) =>
  within(document.querySelector('.us-actions-row')).getByRole('button', { name });

// ---------- Setup ----------

beforeEach(() => {
  mockNavigate.mockReset();
  mockSetActiveUnitId.mockReset();
  mockRefreshUnits.mockReset();
  mockRefreshUnits.mockResolvedValue();
  unitsAPI.delete.mockResolvedValue({});
  unitsAPI.duplicate.mockResolvedValue({ id: 'new-unit' });
  setupContext();

  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(window, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------- Tests ----------

describe('UnitSetup', () => {
  describe('loading and empty states', () => {
    test('shows a loading message while units load', () => {
      setupContext({ isLoading: true });
      renderUnitSetup();
      expect(screen.getByText('Loading units...')).toBeInTheDocument();
    });

    test('shows an empty message when the user coordinates no units', () => {
      setupContext({ units: [defaultUnits[3]] }); // tutor-only unit
      renderUnitSetup();
      expect(screen.getByText(/no units yet/i)).toBeInTheDocument();
    });

    test('"Create Unit" goes to the create page', async () => {
      renderUnitSetup();
      await userEvent.click(screen.getByRole('button', { name: 'Create Unit' }));
      expect(mockNavigate).toHaveBeenCalledWith('/unit-setup/create');
    });
  });

  describe('unit list and tabs', () => {
    test('shows active coordinator units and hides tutor-only units', () => {
      renderUnitSetup();
      expect(screen.getByText('FIT1001')).toBeInTheDocument();
      expect(screen.getByText('FIT2002')).toBeInTheDocument();
      expect(screen.getByText('Intro Programming - Semester 1, 2026')).toBeInTheDocument();
      expect(screen.queryByText('FIT3003')).not.toBeInTheDocument(); // inactive
      expect(screen.queryByText('FIT4004')).not.toBeInTheDocument(); // tutor only
    });

    test('tabs show the correct counts', () => {
      renderUnitSetup();
      expect(within(screen.getByRole('tab', { name: /^active units/i })).getByText('2')).toBeInTheDocument();
      expect(within(screen.getByRole('tab', { name: /^inactive units/i })).getByText('1')).toBeInTheDocument();
    });

    test('switching to the Inactive tab shows inactive units', async () => {
      renderUnitSetup();
      const inactiveTab = screen.getByRole('tab', { name: /^inactive units/i });

      await userEvent.click(inactiveTab);

      expect(inactiveTab).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByText('FIT3003')).toBeInTheDocument();
      expect(screen.queryByText('FIT1001')).not.toBeInTheDocument();
    });

    test('shows a message when there are no inactive units', async () => {
      setupContext({ units: [defaultUnits[0]] });
      renderUnitSetup();
      await userEvent.click(screen.getByRole('tab', { name: /^inactive units/i }));
      expect(screen.getByText('No inactive units.')).toBeInTheDocument();
    });
  });

  describe('search', () => {
    test('filters by unit name, ignoring upper/lower case', async () => {
      renderUnitSetup();
      await userEvent.type(screen.getByPlaceholderText(/search by unit code or name/i), 'DATA');

      expect(screen.getByText('FIT2002')).toBeInTheDocument();
      expect(screen.queryByText('FIT1001')).not.toBeInTheDocument();
      expect(within(screen.getByRole('tab', { name: /^active units/i })).getByText('1')).toBeInTheDocument();
    });

    test('filters by unit code', async () => {
      renderUnitSetup();
      await userEvent.type(screen.getByPlaceholderText(/search/i), 'fit1001');

      expect(screen.getByText('FIT1001')).toBeInTheDocument();
      expect(screen.queryByText('FIT2002')).not.toBeInTheDocument();
    });

    test('shows a message when nothing matches', async () => {
      renderUnitSetup();
      await userEvent.type(screen.getByPlaceholderText(/search/i), 'zzz');
      expect(screen.getByText('No active units match your search.')).toBeInTheDocument();
    });

    test('the clear button resets the search', async () => {
      renderUnitSetup();
      const input = screen.getByPlaceholderText(/search/i);
      await userEvent.type(input, 'zzz');

      await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));

      expect(input).toHaveValue('');
      expect(screen.getByText('FIT1001')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument();
    });
  });

  describe('selecting a unit', () => {
    test('action buttons are disabled until a unit is selected', () => {
      renderUnitSetup();
      ['Sessions', 'Edit', 'Duplicate', 'Delete'].forEach(name => {
        expect(actionButton(name)).toBeDisabled();
      });
    });

    test('clicking a unit selects it and enables the action buttons', async () => {
      renderUnitSetup();
      await userEvent.click(screen.getByText('FIT1001'));

      expect(mockSetActiveUnitId).toHaveBeenCalledWith('u1');
      expect(screen.getByText('FIT1001').closest('.us-unit-row')).toHaveClass('selected');
      expect(actionButton('Edit')).toBeEnabled();
    });

    test('clicking the selected unit again deselects it', async () => {
      setupContext({ activeUnitId: 'u1' });
      renderUnitSetup();
      await userEvent.click(screen.getByText('FIT1001'));

      expect(mockSetActiveUnitId).toHaveBeenCalledWith(null);
      expect(actionButton('Edit')).toBeDisabled();
    });

    test('"Edit" goes to the edit page for the selected unit', async () => {
      setupContext({ activeUnitId: 'u1' });
      renderUnitSetup();
      await userEvent.click(actionButton('Edit'));
      expect(mockNavigate).toHaveBeenCalledWith('/unit-setup/edit/u1');
    });

    test('"Sessions" goes to the sessions page', async () => {
      setupContext({ activeUnitId: 'u1' });
      renderUnitSetup();
      await userEvent.click(actionButton('Sessions'));
      expect(mockNavigate).toHaveBeenCalledWith('/sessions');
    });
  });

  describe('deleting a unit', () => {
    beforeEach(() => setupContext({ activeUnitId: 'u1' }));

    test('opens a confirmation popup', async () => {
      renderUnitSetup();
      await userEvent.click(actionButton('Delete'));
      expect(screen.getByRole('heading', { name: 'Delete FIT1001?' })).toBeInTheDocument();
    });

    test('"Cancel" closes the popup without deleting', async () => {
      renderUnitSetup();
      await userEvent.click(actionButton('Delete'));
      await userEvent.click(getModal().getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByText(/permanently remove/i)).not.toBeInTheDocument();
      expect(unitsAPI.delete).not.toHaveBeenCalled();
    });

    test('clicking outside the popup closes it', async () => {
      renderUnitSetup();
      await userEvent.click(actionButton('Delete'));
      await userEvent.click(document.querySelector('.us-modal-overlay'));
      expect(screen.queryByText(/permanently remove/i)).not.toBeInTheDocument();
    });

    test('confirming deletes the unit and refreshes the list', async () => {
      renderUnitSetup();
      await userEvent.click(actionButton('Delete'));
      await userEvent.click(getModal().getByRole('button', { name: 'Delete' }));

      expect(unitsAPI.delete).toHaveBeenCalledWith('u1');
      await waitFor(() => expect(mockRefreshUnits).toHaveBeenCalled());
      expect(screen.queryByText(/permanently remove/i)).not.toBeInTheDocument();
    });

    test('shows an alert if deleting fails', async () => {
      unitsAPI.delete.mockRejectedValue(new Error('Server error'));
      renderUnitSetup();
      await userEvent.click(actionButton('Delete'));
      await userEvent.click(getModal().getByRole('button', { name: 'Delete' }));

      await waitFor(() =>
        expect(window.alert).toHaveBeenCalledWith('Failed to delete unit. Please try again.')
      );
      expect(mockRefreshUnits).not.toHaveBeenCalled();
    });
  });

  describe('duplicating a unit', () => {
    beforeEach(() => setupContext({ activeUnitId: 'u1' }));

    const openDuplicate = async () => {
      renderUnitSetup();
      await userEvent.click(actionButton('Duplicate'));
      return getModal();
    };

    const fillForm = async (modal, { semester, year }) => {
      if (semester) await userEvent.selectOptions(modal.getByLabelText('Semester'), semester);
      if (year) await userEvent.type(modal.getByLabelText('Year'), year);
    };

    test('opens a form pre-filled with the unit code and name', async () => {
      const modal = await openDuplicate();
      expect(modal.getByRole('heading', { name: 'Duplicate FIT1001' })).toBeInTheDocument();
      expect(modal.getByLabelText('Unit code')).toHaveValue('FIT1001');
      expect(modal.getByLabelText('Unit name')).toHaveValue('Intro Programming');
      expect(modal.getByLabelText('Semester')).toHaveValue('');
      expect(modal.getByLabelText('Year')).toHaveValue(null);
    });

    test('requires a unit code', async () => {
      const modal = await openDuplicate();
      await userEvent.clear(modal.getByLabelText('Unit code'));
      await userEvent.click(modal.getByRole('button', { name: 'Duplicate' }));

      expect(modal.getByText('Unit code is required')).toBeInTheDocument();
      expect(unitsAPI.duplicate).not.toHaveBeenCalled();
    });

    test('requires a semester', async () => {
      const modal = await openDuplicate();
      await userEvent.click(modal.getByRole('button', { name: 'Duplicate' }));
      expect(modal.getByText('Semester is required')).toBeInTheDocument();
    });

    test('requires a year', async () => {
      const modal = await openDuplicate();
      await fillForm(modal, { semester: 'Semester 2' });
      await userEvent.click(modal.getByRole('button', { name: 'Duplicate' }));
      expect(modal.getByText('Year is required')).toBeInTheDocument();
    });

    test('sends the form, closes the popup, and selects the new unit', async () => {
      const modal = await openDuplicate();
      await userEvent.clear(modal.getByLabelText('Unit code'));
      await userEvent.type(modal.getByLabelText('Unit code'), '  FIT1001B  ');
      await fillForm(modal, { semester: 'Semester 2', year: '2027' });

      await userEvent.click(modal.getByRole('button', { name: 'Duplicate' }));

      expect(unitsAPI.duplicate).toHaveBeenCalledWith('u1', {
        unitCode: 'FIT1001B', // spaces trimmed
        unitName: 'Intro Programming',
        semester: 'Semester 2',
        year: 2027, // sent as a number
      });
      await waitFor(() =>
        expect(mockRefreshUnits).toHaveBeenCalledWith({ preferUnitId: 'new-unit' })
      );
      expect(screen.queryByText(/sessions and tutors will be copied/i)).not.toBeInTheDocument();
    });

    test('shows "Duplicating..." and disables buttons while saving', async () => {
      unitsAPI.duplicate.mockReturnValue(new Promise(() => {})); // never finishes
      const modal = await openDuplicate();
      await fillForm(modal, { semester: 'Summer', year: '2027' });

      await userEvent.click(modal.getByRole('button', { name: 'Duplicate' }));

      expect(modal.getByRole('button', { name: 'Duplicating...' })).toBeDisabled();
      expect(modal.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    });

    test("shows the server's error message if duplicating fails", async () => {
      unitsAPI.duplicate.mockRejectedValue({ response: { data: { error: 'Unit code already exists' } } });
      const modal = await openDuplicate();
      await fillForm(modal, { semester: 'Semester 2', year: '2027' });

      await userEvent.click(modal.getByRole('button', { name: 'Duplicate' }));

      expect(await modal.findByText('Unit code already exists')).toBeInTheDocument();
      expect(mockRefreshUnits).not.toHaveBeenCalled();
    });

    test('shows a general error message if the server gives no reason', async () => {
      unitsAPI.duplicate.mockRejectedValue(new Error('Network error'));
      const modal = await openDuplicate();
      await fillForm(modal, { semester: 'Semester 2', year: '2027' });

      await userEvent.click(modal.getByRole('button', { name: 'Duplicate' }));

      expect(await modal.findByText('Failed to duplicate unit. Please try again.')).toBeInTheDocument();
    });
  });
});