import React from 'react';
import { render, screen, within, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import ApplicationFormEditor from './ApplicationFormEditor';
import { tutorApplicationsAPI } from '../config/api';
import { useActiveUnit } from '../context/ActiveUnitContext';

// ---------- Mocks ----------

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

jest.mock('../config/api', () => ({
  tutorApplicationsAPI: { getForm: jest.fn(), saveForm: jest.fn(), resetForm: jest.fn() },
}));

jest.mock('../context/ActiveUnitContext', () => ({ useActiveUnit: jest.fn() }));
jest.mock('../components/UCSidebar', () => () => null);
jest.mock('../components/UCPageHeader', () => ({ title }) => title);

// A small, predictable version of the form settings
jest.mock('../utils/applicationForm', () => ({
  FIELD_TYPES: [
    { value: 'text', label: 'Short text' },
    { value: 'textarea', label: 'Long text' },
    { value: 'number', label: 'Number' },
    { value: 'select', label: 'Dropdown' },
    { value: 'checkbox', label: 'Checkboxes' },
    { value: 'file', label: 'File upload' },
  ],
  LOCKED_FIELDS: [
    { key: 'firstName', label: 'First name' },
    { key: 'lastName', label: 'Last name' },
    { key: 'email', label: 'Email' },
  ],
  DEFAULT_APPLICATION_FIELDS: [
    { key: 'phoneNumber', label: 'Default phone', type: 'text', required: true },
    { key: 'resume', label: 'Default resume', type: 'file' },
  ],
  makeFieldKey: (label, existingKeys) => `new_question_${existingKeys.length}`,
}));

// ---------- Test data ----------

const unit = { id: 'u1', unitCode: 'FIT1001' };

const serverFields = [
  { key: 'phoneNumber', label: 'Phone number', type: 'text', required: true },
  { key: 'contractType', label: 'Contract type', type: 'select', options: ['Casual', 'Sessional'] },
  { key: 'why', label: 'Why tutor?', type: 'textarea' },
];

// A fresh copy each time, so one test can't change another's data
const serverForm = (overrides = {}) => ({
  isCustomised: true,
  fields: JSON.parse(JSON.stringify(serverFields)),
  ...overrides,
});

// ---------- Helpers ----------

const renderAndWait = async () => {
  render(<ApplicationFormEditor />);
  await screen.findByRole('button', { name: 'Save form' });
};

// The editable question rows (not the fixed name/email rows)
const rows = () => Array.from(document.querySelectorAll('.afe-field-row:not(.afe-field-locked)'));
const labels = () => rows().map(row => row.querySelector('.afe-label-input').value);
const rowFor = (label) => rows().find(row => row.querySelector('.afe-label-input').value === label);
const typeSelect = (row) => row.querySelector('.afe-type-select');
const optionsInput = (row) => row.querySelector('.afe-options-row input');
const control = (row, title) => row.querySelector(`button[title="${title}"]`);
const intro = () => document.querySelector('.afe-intro');

const save = () => userEvent.click(screen.getByRole('button', { name: 'Save form' }));

// Runs the 2.5-second "hide the Saved message" timer straight away
const runSavedMessageTimer = () => {
  const calls = window.setTimeout.mock.calls.filter(call => call[1] === 2500);
  act(() => { calls[calls.length - 1][0](); });
};

// ---------- Setup ----------

beforeEach(() => {
  mockNavigate.mockReset();
  useActiveUnit.mockReturnValue({ activeUnit: unit, isLoading: false });

  tutorApplicationsAPI.getForm.mockImplementation(() => Promise.resolve(serverForm()));
  tutorApplicationsAPI.saveForm.mockResolvedValue({});
  tutorApplicationsAPI.resetForm.mockResolvedValue({
    fields: [{ key: 'phoneNumber', label: 'Phone (reset)', type: 'text', required: true }],
  });

  jest.spyOn(window, 'setTimeout');
  jest.spyOn(window, 'confirm').mockReturnValue(true);
  jest.spyOn(window, 'alert').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------- Tests ----------

describe('ApplicationFormEditor', () => {
  describe('loading', () => {
    test('shows a loading message while the form loads', () => {
      tutorApplicationsAPI.getForm.mockReturnValue(new Promise(() => {}));
      render(<ApplicationFormEditor />);
      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    test('waits for the unit to finish loading before fetching', () => {
      useActiveUnit.mockReturnValue({ activeUnit: unit, isLoading: true });
      render(<ApplicationFormEditor />);

      expect(screen.getByText('Loading...')).toBeInTheDocument();
      expect(tutorApplicationsAPI.getForm).not.toHaveBeenCalled();
    });

    test('with no unit selected, shows the default questions', async () => {
      useActiveUnit.mockReturnValue({ activeUnit: null, isLoading: false });
      await renderAndWait();

      expect(tutorApplicationsAPI.getForm).not.toHaveBeenCalled();
      expect(labels()).toEqual(['Default phone', 'Default resume']);
      expect(intro()).toHaveTextContent(/apply for this unit/);
      expect(intro()).toHaveTextContent(/currently using the default template/);
    });

    test('loads the unit\'s form, with name and email fixed at the top', async () => {
      await renderAndWait();

      expect(tutorApplicationsAPI.getForm).toHaveBeenCalledWith('u1');
      expect(intro()).toHaveTextContent(/apply for FIT1001/);
      expect(intro()).not.toHaveTextContent(/default template/);

      const locked = Array.from(document.querySelectorAll('.afe-field-locked .afe-field-label')).map(el => el.textContent);
      expect(locked).toEqual(['First name', 'Last name', 'Email']);
      expect(screen.getAllByText('Short text · Required · Fixed')).toHaveLength(3);

      expect(labels()).toEqual(['Phone number', 'Contract type', 'Why tutor?']);
      expect(typeSelect(rowFor('Why tutor?'))).toHaveValue('textarea');
      expect(within(rowFor('Phone number')).getByLabelText('Required')).toBeChecked();
      expect(within(rowFor('Why tutor?')).getByLabelText('Required')).not.toBeChecked();
    });

    test('only dropdown and checkbox questions have an options box', async () => {
      await renderAndWait();

      expect(optionsInput(rowFor('Contract type'))).toHaveValue('Casual, Sessional');
      expect(optionsInput(rowFor('Phone number'))).toBeNull();
      expect(optionsInput(rowFor('Why tutor?'))).toBeNull();
    });

    test('says when the default template is in use', async () => {
      tutorApplicationsAPI.getForm.mockImplementation(() => Promise.resolve(serverForm({ isCustomised: false })));
      await renderAndWait();
      expect(intro()).toHaveTextContent(/currently using the default template/);
    });

    test('falls back to the default questions if loading fails', async () => {
      tutorApplicationsAPI.getForm.mockRejectedValue(new Error('Server down'));
      await renderAndWait();
      expect(labels()).toEqual(['Default phone', 'Default resume']);
    });
  });

  describe('editing questions', () => {
    test('changes to a question\'s label, type and required setting are saved', async () => {
      await renderAndWait();
      const phone = rowFor('Phone number');

      await userEvent.clear(phone.querySelector('.afe-label-input'));
      await userEvent.type(phone.querySelector('.afe-label-input'), 'Mobile');
      await userEvent.selectOptions(typeSelect(rowFor('Mobile')), 'number');
      await userEvent.click(within(rowFor('Mobile')).getByLabelText('Required'));
      await save();

      expect(tutorApplicationsAPI.saveForm).toHaveBeenCalledWith('u1', [
        { key: 'phoneNumber', label: 'Mobile', type: 'number', required: false },
        { key: 'contractType', label: 'Contract type', type: 'select', options: ['Casual', 'Sessional'] },
        { key: 'why', label: 'Why tutor?', type: 'textarea' },
      ]);
    });

    test('switching to a dropdown shows an options box, and the options are saved', async () => {
      await renderAndWait();
      const why = rowFor('Why tutor?');

      await userEvent.selectOptions(typeSelect(why), 'select');
      // Pasting the whole list (see the note about typing commas)
      fireEvent.change(optionsInput(rowFor('Why tutor?')), { target: { value: 'Money, Experience ,  Fun' } });
      await save();

      expect(tutorApplicationsAPI.saveForm.mock.calls[0][1][2]).toEqual({
        key: 'why', label: 'Why tutor?', type: 'select', options: ['Money', 'Experience', 'Fun'],
      });
    });

    test('questions can be moved up and down', async () => {
      await renderAndWait();

      expect(control(rows()[0], 'Move up')).toBeDisabled();
      expect(control(rows()[2], 'Move down')).toBeDisabled();

      await userEvent.click(control(rowFor('Why tutor?'), 'Move up'));
      expect(labels()).toEqual(['Phone number', 'Why tutor?', 'Contract type']);

      await userEvent.click(control(rowFor('Phone number'), 'Move down'));
      expect(labels()).toEqual(['Why tutor?', 'Phone number', 'Contract type']);
    });

    test('a question can be deleted', async () => {
      await renderAndWait();
      await userEvent.click(control(rowFor('Contract type'), 'Delete question'));

      expect(labels()).toEqual(['Phone number', 'Why tutor?']);
    });

    test('"+ Add question" adds a blank short-text question at the end', async () => {
      await renderAndWait();
      await userEvent.click(screen.getByRole('button', { name: '+ Add question' }));

      expect(labels()).toEqual(['Phone number', 'Contract type', 'Why tutor?', 'New question']);
      expect(typeSelect(rowFor('New question'))).toHaveValue('text');

      await save();
      expect(tutorApplicationsAPI.saveForm.mock.calls[0][1][3]).toEqual({
        key: 'new_question_3', label: 'New question', type: 'text', required: false,
      });
    });
  });

  describe('saving and resetting', () => {
    test('saving shows "Saved." briefly and marks the form as customised', async () => {
      tutorApplicationsAPI.getForm.mockImplementation(() => Promise.resolve(serverForm({ isCustomised: false })));
      await renderAndWait();
      await save();

      expect(await screen.findByText('Saved.')).toBeInTheDocument();
      expect(intro()).not.toHaveTextContent(/default template/);

      runSavedMessageTimer();
      expect(screen.queryByText('Saved.')).not.toBeInTheDocument();
    });

    test('shows an alert if saving fails', async () => {
      tutorApplicationsAPI.saveForm.mockRejectedValue(new Error('Question labels cannot be empty'));
      await renderAndWait();
      await save();

      await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Question labels cannot be empty'));
      expect(screen.queryByText('Saved.')).not.toBeInTheDocument();
    });

    test('Save and Reset are disabled while saving', async () => {
      tutorApplicationsAPI.saveForm.mockReturnValue(new Promise(() => {}));
      await renderAndWait();
      await save();

      expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Reset to default' })).toBeDisabled();
    });

    test('"Reset to default" asks first, then loads the default form', async () => {
      await renderAndWait();
      await userEvent.click(screen.getByRole('button', { name: 'Reset to default' }));

      expect(window.confirm).toHaveBeenCalled();
      expect(tutorApplicationsAPI.resetForm).toHaveBeenCalledWith('u1');
      await waitFor(() => expect(labels()).toEqual(['Phone (reset)']));
      expect(intro()).toHaveTextContent(/currently using the default template/);
    });

    test('cancelling the reset changes nothing', async () => {
      window.confirm.mockReturnValue(false);
      await renderAndWait();
      await userEvent.click(screen.getByRole('button', { name: 'Reset to default' }));

      expect(tutorApplicationsAPI.resetForm).not.toHaveBeenCalled();
      expect(labels()).toEqual(['Phone number', 'Contract type', 'Why tutor?']);
    });

    test('shows an alert if resetting fails', async () => {
      tutorApplicationsAPI.resetForm.mockRejectedValue(new Error('Server error'));
      await renderAndWait();
      await userEvent.click(screen.getByRole('button', { name: 'Reset to default' }));

      await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Server error'));
      expect(labels()).toEqual(['Phone number', 'Contract type', 'Why tutor?']);
    });
  });

  test('"Back to Applications" returns to the applications page', async () => {
    await renderAndWait();
    await userEvent.click(screen.getByRole('button', { name: /back to applications/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/tutor-applications');
  });
});