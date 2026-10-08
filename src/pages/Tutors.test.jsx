import React from 'react';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import Tutors from './Tutors';
import { tutorsAPI } from '../config/api';
import { useActiveUnit } from '../context/ActiveUnitContext';

// ---------- Mocks ----------

let mockParams = {};
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => mockParams,
}));

jest.mock('../config/api', () => ({
  tutorsAPI: {
    getAll: jest.fn(),
    setEarlyAccess: jest.fn(),
    setStarred: jest.fn(),
    setFlagged: jest.fn(),
    updateMarker: jest.fn(),
  },
}));

jest.mock('../context/ActiveUnitContext', () => ({ useActiveUnit: jest.fn() }));
jest.mock('../utils/userName', () => ({
  getAvatarLetter: (t) => t.name.charAt(0),
  getDisplayName: (t) => t.name,
}));
jest.mock('../components/UCSidebar', () => () => null);
jest.mock('../components/UCPageHeader', () => ({ title }) => title);

// ---------- Test data ----------

const alice = {
  id: 't1', name: 'Alice Smith', email: 'alice@uni.edu', phoneNumber: '0400 000 001',
  priorityTag: 'Preferred', starred: false, flagged: false, earlyAccess: false,
  contractType: 'Casual', maximumHours: 10, workExperience: 'Taught FIT1001 for two years',
  tags: ['Friendly'], internalNotes: 'Great with students',
};
// Starred, flagged, early access, with a photo
const bob = {
  id: 't2', name: 'Bob Lee', email: 'bob@uni.edu', avatarUrl: 'https://example.com/bob.png',
  priorityTag: 'Standard', starred: true, flagged: true, earlyAccess: true,
  contractType: 'Sessional', maximumHours: 20, tags: [],
};
// Mostly empty profile; appears twice from the server (once as super tutor)
const cara = {
  id: 't3', name: 'Cara Diaz', email: 'cara@uni.edu', role: 'tutor',
  priorityTag: 'Backup', maximumHours: null, contractType: null,
};

const serverTutors = [alice, bob, cara, { ...cara, role: 'super_tutor' }];

const mockSetActiveUnitId = jest.fn();

// A fake context that remembers the active unit, like the real one
const setupContext = ({ activeUnitId = 'u1', isLoading = false } = {}) => {
  const units = [{ id: 'u1', unitCode: 'FIT1001' }, { id: 'u2', unitCode: 'FIT2002' }];
  useActiveUnit.mockImplementation(() => {
    const [id, setId] = React.useState(activeUnitId);
    return {
      activeUnit: units.find(u => u.id === id) || null,
      activeUnitId: id,
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
  render(<Tutors />);
  await screen.findByText('Alice Smith');
};

const getCard = (name) => within(screen.getByText(name).closest('.tt-card'));
const getModal = () => within(document.querySelector('.tt-modal-content'));
const getFilterPanel = () => within(document.querySelector('.tt-filter-panel'));

// Names of the tutor cards currently shown, in order
const visibleNames = () =>
  Array.from(document.querySelectorAll('.tt-card-name')).map(el => el.firstChild.textContent);

const openProfile = async (name) => {
  await userEvent.click(screen.getByText(name));
  return getModal();
};

const openFilters = () => userEvent.click(screen.getByRole('button', { name: /^filters/i }));

// ---------- Setup ----------

beforeEach(() => {
  mockParams = {};
  mockSetActiveUnitId.mockReset();
  setupContext();

  tutorsAPI.getAll.mockResolvedValue(serverTutors);
  tutorsAPI.setEarlyAccess.mockResolvedValue({});
  tutorsAPI.setStarred.mockResolvedValue({});
  tutorsAPI.setFlagged.mockResolvedValue({});
  tutorsAPI.updateMarker.mockResolvedValue({});

  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(window, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------- Tests ----------

describe('Tutors', () => {
  describe('page states', () => {
    test('shows a loading message while the unit is loading', () => {
      setupContext({ isLoading: true });
      render(<Tutors />);
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    test('shows a message when no unit is selected', () => {
      setupContext({ activeUnitId: null });
      render(<Tutors />);
      expect(screen.getByText(/no unit selected/i)).toBeInTheDocument();
      expect(tutorsAPI.getAll).not.toHaveBeenCalled();
    });

    test('shows a loading message while tutors load', () => {
      tutorsAPI.getAll.mockReturnValue(new Promise(() => {}));
      render(<Tutors />);
      expect(screen.getByText('Loading tutors...')).toBeInTheDocument();
    });

    test('switches to the unit in the URL', async () => {
      mockParams = { unitId: 'u2' };
      render(<Tutors />);
      await waitFor(() => expect(tutorsAPI.getAll).toHaveBeenCalledWith('u2'));
      expect(mockSetActiveUnitId).toHaveBeenCalledWith('u2');
    });

    test('shows a message when the unit has no tutors', async () => {
      tutorsAPI.getAll.mockResolvedValue([]);
      render(<Tutors />);
      expect(await screen.findByText('No tutors found.')).toBeInTheDocument();
    });
  });

  describe('tutor list', () => {
    test('shows each tutor once, starred tutors first', async () => {
      await renderAndWait();
      expect(visibleNames()).toEqual(['Bob Lee', 'Alice Smith', 'Cara Diaz']);
      // Cara came back twice; the super tutor version is kept
      expect(getCard('Cara Diaz').getByText('Super Tutor')).toBeInTheDocument();
    });

    test('shows details, priority and tags on each card', async () => {
      await renderAndWait();
      const card = getCard('Alice Smith');
      expect(card.getByText('Taught FIT1001 for two years - Max 10 hrs/week - Casual')).toBeInTheDocument();
      expect(card.getByText('Preferred')).toHaveClass('tt-badge', 'preferred');
      expect(card.getByText('Friendly')).toHaveClass('tag');

      expect(getCard('Cara Diaz').getByText('No experience notes yet')).toBeInTheDocument();
    });

    test('shows a photo when there is one, otherwise the first letter', async () => {
      await renderAndWait();
      expect(getCard('Bob Lee').getByRole('img', { name: 'Bob Lee' })).toHaveAttribute('src', 'https://example.com/bob.png');
      expect(getCard('Alice Smith').getByText('A')).toBeInTheDocument();
    });

    test('search filters by name, ignoring upper/lower case', async () => {
      await renderAndWait();
      await userEvent.type(screen.getByPlaceholderText('Search tutors...'), 'ALI');
      expect(visibleNames()).toEqual(['Alice Smith']);
    });

    test('shows a message when nothing matches', async () => {
      await renderAndWait();
      await userEvent.type(screen.getByPlaceholderText('Search tutors...'), 'zzz');
      expect(screen.getByText('No tutors match the selected filters.')).toBeInTheDocument();
    });
  });

  describe('star and flag', () => {
    test('starring updates the card straight away and saves it', async () => {
      await renderAndWait();
      await userEvent.click(getCard('Alice Smith').getByRole('button', { name: 'Star tutor' }));

      expect(tutorsAPI.setStarred).toHaveBeenCalledWith('u1', 't1', true);
      const star = getCard('Alice Smith').getByRole('button', { name: 'Unstar tutor' });
      expect(star).toHaveTextContent('★');
      expect(star).toHaveClass('starred');
      // Clicking the star should not also open the profile
      expect(document.querySelector('.tt-modal-content')).not.toBeInTheDocument();
    });

    test('starring is undone with an alert if saving fails', async () => {
      tutorsAPI.setStarred.mockRejectedValue(new Error('Could not save star'));
      await renderAndWait();
      await userEvent.click(getCard('Alice Smith').getByRole('button', { name: 'Star tutor' }));

      await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Could not save star'));
      expect(getCard('Alice Smith').getByRole('button', { name: 'Star tutor' })).toBeInTheDocument();
    });

    test('removing a flag updates the card and saves it', async () => {
      await renderAndWait();
      await userEvent.click(getCard('Bob Lee').getByRole('button', { name: 'Remove flag' }));

      expect(tutorsAPI.setFlagged).toHaveBeenCalledWith('u1', 't2', false);
      expect(getCard('Bob Lee').getByRole('button', { name: 'Flag tutor' })).not.toHaveClass('flagged');
    });

    test('flagging is undone with an alert if saving fails', async () => {
      tutorsAPI.setFlagged.mockRejectedValue(new Error('Could not save flag'));
      await renderAndWait();
      await userEvent.click(getCard('Alice Smith').getByRole('button', { name: 'Flag tutor' }));

      await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Could not save flag'));
      expect(getCard('Alice Smith').getByRole('button', { name: 'Flag tutor' })).toBeInTheDocument();
    });
  });

  describe('filters', () => {
    test('the panel shows priority and contract type options, and closes when clicking outside', async () => {
      await renderAndWait();
      await openFilters();

      const panel = getFilterPanel();
      ['Preferred', 'Standard', 'Backup', 'Risk'].forEach(p =>
        expect(panel.getByRole('button', { name: p })).toBeInTheDocument()
      );
      expect(panel.getByRole('button', { name: 'Casual' })).toBeInTheDocument();
      expect(panel.getByRole('button', { name: 'Sessional' })).toBeInTheDocument();

      fireEvent.mouseDown(document.body);
      expect(document.querySelector('.tt-filter-panel')).not.toBeInTheDocument();
    });

    test('filtering by priority shows only matching tutors', async () => {
      await renderAndWait();
      await openFilters();
      await userEvent.click(getFilterPanel().getByRole('button', { name: 'Backup' }));

      expect(visibleNames()).toEqual(['Cara Diaz']);
      expect(getFilterPanel().getByRole('button', { name: 'Backup' })).toHaveClass('selected');
      expect(screen.getByRole('button', { name: 'Filters (1)' })).toHaveClass('active');
    });

    test('filtering by contract type shows only matching tutors', async () => {
      await renderAndWait();
      await openFilters();
      await userEvent.click(getFilterPanel().getByRole('button', { name: 'Sessional' }));

      expect(visibleNames()).toEqual(['Bob Lee']);
    });

    test('max hours shows only tutors at or under the limit', async () => {
      await renderAndWait();
      await openFilters();
      await userEvent.type(getFilterPanel().getByPlaceholderText('e.g. 10'), '15');

      // Alice (10) fits; Bob (20) is over; Cara has no limit set
      expect(visibleNames()).toEqual(['Alice Smith']);
    });

    test.each(['Starred only', 'Flagged only', 'Early schedule access only'])(
      '"%s" shows only matching tutors',
      async (label) => {
        await renderAndWait();
        await openFilters();
        await userEvent.click(getFilterPanel().getByLabelText(label));

        expect(visibleNames()).toEqual(['Bob Lee']);
      }
    );

    test('"Clear filters" shows everyone again', async () => {
      await renderAndWait();
      await openFilters();
      await userEvent.click(getFilterPanel().getByRole('button', { name: 'Backup' }));
      await userEvent.click(getFilterPanel().getByRole('button', { name: 'Clear filters' }));

      expect(visibleNames()).toHaveLength(3);
      expect(screen.getByRole('button', { name: 'Filters' })).not.toHaveClass('active');
    });
  });

  describe('profile popup', () => {
    test('clicking a card opens the profile with its details', async () => {
      await renderAndWait();
      const modal = await openProfile('Alice Smith');

      expect(modal.getByText('Tutor')).toBeInTheDocument();
      expect(modal.getByText('alice@uni.edu')).toBeInTheDocument();
      expect(modal.getByText('0400 000 001')).toBeInTheDocument();
      expect(modal.getByText('10 hrs/week')).toBeInTheDocument();
      expect(modal.getByText('Casual')).toBeInTheDocument();
      expect(modal.getByText('Taught FIT1001 for two years')).toBeInTheDocument();

      expect(modal.getByRole('combobox')).toHaveValue('Preferred');
      expect(modal.getByPlaceholderText('Internal notes about this tutor...')).toHaveValue('Great with students');
      expect(modal.getByText('Friendly')).toHaveClass('tt-tag-pill');
    });

    test('shows placeholders for missing details', async () => {
      await renderAndWait();
      const modal = await openProfile('Cara Diaz');

      expect(modal.getByText('Super Tutor')).toBeInTheDocument();
      expect(modal.getAllByText('Not provided')).toHaveLength(2); // phone, experience
      expect(modal.getAllByText('Not set')).toHaveLength(2); // max hours, contract type
    });

    test('tags can be added (button or Enter) and removed, without duplicates', async () => {
      await renderAndWait();
      const modal = await openProfile('Alice Smith');
      const tagInput = modal.getByPlaceholderText('e.g. Friendly, Experienced');

      await userEvent.type(tagInput, 'Patient');
      await userEvent.click(modal.getByRole('button', { name: 'Add' }));
      expect(modal.getByText('Patient')).toHaveClass('tt-tag-pill');
      expect(tagInput).toHaveValue('');

      await userEvent.type(tagInput, 'Calm{enter}');
      expect(modal.getByText('Calm')).toBeInTheDocument();

      await userEvent.type(tagInput, 'Friendly');
      await userEvent.click(modal.getByRole('button', { name: 'Add' }));
      expect(modal.getAllByText('Friendly')).toHaveLength(1);

      await userEvent.click(within(modal.getByText('Patient')).getByRole('button'));
      expect(modal.queryByText('Patient')).not.toBeInTheDocument();
    });

    test('saving asks for confirmation, then saves and reloads', async () => {
      await renderAndWait();
      const modal = await openProfile('Alice Smith');

      await userEvent.selectOptions(modal.getByRole('combobox'), 'Risk');
      const notes = modal.getByPlaceholderText('Internal notes about this tutor...');
      await userEvent.clear(notes);
      await userEvent.type(notes, 'New notes');
      await userEvent.click(modal.getByRole('button', { name: 'Save Changes' }));

      expect(screen.getByText("Save changes to Alice Smith's profile?")).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

      expect(tutorsAPI.updateMarker).toHaveBeenCalledWith('u1', 't1', 'Risk', 'New notes', ['Friendly']);
      await waitFor(() => expect(document.querySelector('.tt-modal-content')).not.toBeInTheDocument());
      expect(tutorsAPI.getAll).toHaveBeenCalledTimes(2);
    });

    test('"Cancel" on the confirmation keeps the profile open without saving', async () => {
      await renderAndWait();
      const modal = await openProfile('Alice Smith');
      await userEvent.click(modal.getByRole('button', { name: 'Save Changes' }));
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(screen.queryByText(/save changes to/i)).not.toBeInTheDocument();
      expect(document.querySelector('.tt-modal-content')).toBeInTheDocument();
      expect(tutorsAPI.updateMarker).not.toHaveBeenCalled();
    });

    test('shows an alert and keeps the profile open if saving fails', async () => {
      tutorsAPI.updateMarker.mockRejectedValue(new Error('Server error'));
      await renderAndWait();
      const modal = await openProfile('Alice Smith');
      await userEvent.click(modal.getByRole('button', { name: 'Save Changes' }));
      await userEvent.click(screen.getByRole('button', { name: 'Confirm' }));

      await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Failed to save. Please try again.'));
      expect(document.querySelector('.tt-modal-content')).toBeInTheDocument();
    });

    test('early access can be turned on from the profile', async () => {
      await renderAndWait();
      const modal = await openProfile('Alice Smith');
      const checkbox = modal.getByLabelText('Early schedule access');
      expect(checkbox).not.toBeChecked();

      await userEvent.click(checkbox);

      expect(tutorsAPI.setEarlyAccess).toHaveBeenCalledWith('u1', 't1', true);
      expect(checkbox).toBeChecked();
    });

    test('early access is undone with an alert if saving fails', async () => {
      tutorsAPI.setEarlyAccess.mockRejectedValue(new Error('Could not update access'));
      await renderAndWait();
      const modal = await openProfile('Alice Smith');
      await userEvent.click(modal.getByLabelText('Early schedule access'));

      await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Could not update access'));
      expect(modal.getByLabelText('Early schedule access')).not.toBeChecked();
    });

    test('starring from the profile updates both the profile and the card', async () => {
      await renderAndWait();
      const modal = await openProfile('Alice Smith');
      await userEvent.click(modal.getByRole('button', { name: 'Star tutor' }));

      expect(tutorsAPI.setStarred).toHaveBeenCalledWith('u1', 't1', true);
      expect(modal.getByRole('button', { name: 'Unstar tutor' })).toBeInTheDocument();
      // Bob's card + Alice's card + the profile popup
      expect(screen.getAllByRole('button', { name: 'Unstar tutor' })).toHaveLength(3);
    });

    test('the × button closes the profile', async () => {
      await renderAndWait();
      const modal = await openProfile('Alice Smith');
      await userEvent.click(modal.getAllByRole('button', { name: '×' })[0]);

      expect(document.querySelector('.tt-modal-content')).not.toBeInTheDocument();
    });
  });
});