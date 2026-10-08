import React from 'react';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import ImportSessions from './ImportSessions';
import { sessionsAPI } from '../config/api';
import { useActiveUnit } from '../context/ActiveUnitContext';
import { useImportSession } from '../context/ImportSessionContext';
import { parseCsvIntoBlocks, guessColumnMapping } from '../utils/csvBlocks';

// ---------- Mocks ----------

let mockParams = {};
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: () => mockParams,
  useNavigate: () => mockNavigate,
}));

jest.mock('../config/api', () => ({
  sessionsAPI: { getAll: jest.fn(), import: jest.fn() },
}));

jest.mock('../context/ActiveUnitContext', () => ({ useActiveUnit: jest.fn() }));
jest.mock('../context/ImportSessionContext', () => ({ useImportSession: jest.fn() }));
jest.mock('../utils/csvBlocks', () => ({ parseCsvIntoBlocks: jest.fn(), guessColumnMapping: jest.fn() }));
jest.mock('../components/UCSidebar', () => () => null);

// ---------- Test data ----------

// Two tables found in the CSV, with different column names
const tutorialBlock = {
  sectionTitle: 'Tutorials',
  headers: ['Day', 'Start', 'End', 'Room', 'Size', 'Tutors'],
  rows: [
    ['Monday', '09:00', '10:00', 'GP-P-419', '25', '1'],
    ['Tuesday', '10:00', '12:00', '', 'abc', ''], // no room, a bad capacity, no tutor count
  ],
  suggestedSessionType: 'Tutorial',
};
const untitledBlock = {
  headers: ['Weekday', 'From', 'To', 'Type', 'Staff'],
  rows: [['Wednesday', '13:00', '14:00', 'Lecture', 'Dr Smith']],
  suggestedSessionType: '',
};

const guessedMapping = (headers) =>
  headers[0] === 'Day'
    ? { day: 'Day', startTime: 'Start', endTime: 'End', location: 'Room', capacity: 'Size', requiredTutors: 'Tutors' }
    : { day: 'Weekday', startTime: 'From', endTime: 'To', sessionType: 'Type', staffNote: 'Staff' };

const expectedPayload = [
  {
    day: 'Monday', startTime: '09:00', endTime: '10:00', location: 'GP-P-419', campus: null,
    sessionType: 'Tutorial', capacity: 25, requiredTutors: 1, staffNote: null, status: 'Confirmed',
  },
  {
    day: 'Tuesday', startTime: '10:00', endTime: '12:00', location: null, campus: null,
    sessionType: 'Tutorial', capacity: null, requiredTutors: null, staffNote: null, status: 'Confirmed',
  },
  {
    day: 'Wednesday', startTime: '13:00', endTime: '14:00', location: null, campus: null,
    sessionType: 'Lecture', capacity: null, requiredTutors: null, staffNote: 'Dr Smith', status: 'Confirmed',
  },
];

const existingSession = {
  id: 'e1', sessionCode: 'T01', day: 'MON', startTime: '09:00:00', endTime: '10:00:00',
  location: 'GP-S-201', sessionType: 'Tutorial',
};

const mockResetImportState = jest.fn();

// A fake import context that keeps its state, like the real one
const setupImportContext = () => {
  useImportSession.mockImplementation(() => {
    const [step, setStep] = React.useState('upload');
    const [blocks, setBlocks] = React.useState([]);
    const [mappings, setMappings] = React.useState([]);
    const [sessionTypeOverrides, setSessionTypeOverrides] = React.useState([]);
    const [existingSessions, setExistingSessions] = React.useState([]);
    const [showExisting, setShowExisting] = React.useState(false);
    return {
      step, setStep, blocks, setBlocks, mappings, setMappings,
      sessionTypeOverrides, setSessionTypeOverrides,
      existingSessions, setExistingSessions, showExisting, setShowExisting,
      resetImportState: mockResetImportState,
    };
  });
};

// ---------- Helpers ----------

const fileInput = () => document.querySelector('input[type="file"]');
const csvFile = (text = 'Day,Start\nMonday,09:00') => new File([text], 'timetable.csv', { type: 'text/csv' });

const uploadCsv = async (file = csvFile()) => {
  fireEvent.change(fileInput(), { target: { files: [file] } });
  await screen.findByText('Tutorials');
};

const blockCard = (title) => screen.getByText(title).closest('.is-block-card');
const mappingSelect = (card, label) =>
  Array.from(card.querySelectorAll('.is-mapping-grid .is-mapping-field'))
    .find(f => f.querySelector('label').textContent.replace(/ \*$/, '') === label)
    .querySelector('select');
const sessionTypeInput = (card) => card.querySelector('.is-block-header input');
const previewRows = (card) =>
  Array.from(card.querySelectorAll('.is-preview-table tbody tr'))
    .map(tr => Array.from(tr.cells).map(td => td.textContent));

const importButton = () => screen.getByRole('button', { name: /^import \d+ sessions$/i });

const readBlob = (blob) =>
  new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.readAsText(blob);
  });

let clickedLinks;

// ---------- Setup ----------

beforeEach(() => {
  mockParams = {};
  mockNavigate.mockReset();
  mockResetImportState.mockReset();
  useActiveUnit.mockReturnValue({ activeUnit: { id: 'u1', unitCode: 'FIT1001' } });
  setupImportContext();

  parseCsvIntoBlocks.mockReturnValue([tutorialBlock, untitledBlock]);
  guessColumnMapping.mockImplementation(guessedMapping);
  sessionsAPI.getAll.mockResolvedValue([]);
  sessionsAPI.import.mockResolvedValue({ importedCount: 3, skippedCount: 0, skipped: [] });

  // Fake file downloads (jsdom can't actually download)
  URL.createObjectURL = jest.fn(() => 'blob:fake');
  URL.revokeObjectURL = jest.fn();
  clickedLinks = [];
  jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
    clickedLinks.push({ href: this.href, download: this.download });
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------- Tests ----------

describe('ImportSessions', () => {
  describe('page', () => {
    test('shows the unit in the heading and starts at the upload step', () => {
      render(<ImportSessions />);

      expect(screen.getByRole('heading', { name: 'Upload Session - FIT1001' })).toBeInTheDocument();
      expect(screen.getByText(/drag and drop your timetable csv here/i)).toBeInTheDocument();
    });

    test('"How this works" explains the steps, and clicking outside hides it', async () => {
      render(<ImportSessions />);
      await userEvent.click(screen.getByRole('button', { name: 'How to import a session CSV' }));
      expect(screen.getByText('1. Upload a CSV timetable export.')).toBeInTheDocument();

      fireEvent.mouseDown(document.body);
      expect(screen.queryByText('1. Upload a CSV timetable export.')).not.toBeInTheDocument();
    });
  });

  describe('uploading', () => {
    test('"Download Template" downloads an example CSV', async () => {
      render(<ImportSessions />);
      await userEvent.click(screen.getByRole('button', { name: 'Download Template' }));

      const text = await readBlob(URL.createObjectURL.mock.calls[0][0]);
      expect(text).toBe(
        'Day,Start Time,End Time,Location,Campus,Session Type,Capacity,Tutor\nMonday,08:00,10:00,GP-P-419,GP,Tutorial,25,1\n'
      );
      expect(clickedLinks[0].download).toBe('session_import_template.csv');
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    });

    test('"Choose CSV File" opens the file picker', async () => {
      render(<ImportSessions />);
      const pickerClick = jest.spyOn(fileInput(), 'click').mockImplementation(() => {});

      await userEvent.click(screen.getByRole('button', { name: 'Choose CSV File' }));

      expect(pickerClick).toHaveBeenCalled();
    });

    test('choosing a file reads the CSV, finds the tables and loads existing sessions', async () => {
      render(<ImportSessions />);
      await uploadCsv(csvFile('Day,Start\nMonday,09:00'));

      expect(parseCsvIntoBlocks).toHaveBeenCalledWith([['Day', 'Start'], ['Monday', '09:00']]);
      expect(guessColumnMapping).toHaveBeenCalledWith(tutorialBlock.headers);
      expect(sessionsAPI.getAll).toHaveBeenCalledWith('u1');
    });

    test('a file can be dragged and dropped', async () => {
      render(<ImportSessions />);
      const dropZone = document.querySelector('.is-upload-card');

      fireEvent.drop(dropZone, { dataTransfer: { files: [csvFile()] } });

      expect(await screen.findByText('Tutorials')).toBeInTheDocument();
    });

    test('shows an error if no table is found in the file', async () => {
      parseCsvIntoBlocks.mockReturnValue([]);
      render(<ImportSessions />);
      fireEvent.change(fileInput(), { target: { files: [csvFile('just some text')] } });

      expect(await screen.findByText(/could not find any table in this file/i)).toHaveClass('is-error');
      expect(screen.getByText(/drag and drop your timetable csv here/i)).toBeInTheDocument();
    });
  });

  describe('checking the columns', () => {
    test('shows each table with its guessed column mapping', async () => {
      render(<ImportSessions />);
      await uploadCsv();

      const first = blockCard('Tutorials');
      expect(within(first).getByText('2 rows detected')).toBeInTheDocument();
      expect(sessionTypeInput(first)).toHaveValue('Tutorial');
      expect(mappingSelect(first, 'Day')).toHaveValue('Day');
      expect(mappingSelect(first, 'Location')).toHaveValue('Room');
      expect(mappingSelect(first, 'Campus')).toHaveValue('__none__');

      const second = blockCard('Table 2'); // no title in the file
      expect(within(second).getByText('1 rows detected')).toBeInTheDocument();
      expect(sessionTypeInput(second)).toHaveValue('');

      expect(importButton()).toHaveTextContent('Import 3 sessions');
    });

    test('previews each row, using the table\'s session type when a row has none', async () => {
      render(<ImportSessions />);
      await uploadCsv();

      expect(previewRows(blockCard('Tutorials'))).toEqual([
        ['Monday', '09:00', '10:00', 'GP-P-419', '-', 'Tutorial', '25', '1', '-'],
        ['Tuesday', '10:00', '12:00', '-', '-', 'Tutorial', 'abc', '-', '-'],
      ]);
      expect(previewRows(blockCard('Table 2'))).toEqual([
        ['Wednesday', '13:00', '14:00', '-', '-', 'Lecture', '-', '-', 'Dr Smith'],
      ]);
    });

    test('changing a column mapping updates the preview', async () => {
      render(<ImportSessions />);
      await uploadCsv();
      const card = blockCard('Tutorials');

      await userEvent.selectOptions(mappingSelect(card, 'Location'), '__none__');
      await userEvent.selectOptions(mappingSelect(card, 'Campus'), 'Room');

      const [firstRow] = previewRows(card);
      expect(firstRow[3]).toBe('-'); // location
      expect(firstRow[4]).toBe('GP-P-419'); // campus
    });

    test('changing a table\'s session type updates its rows', async () => {
      render(<ImportSessions />);
      await uploadCsv();
      const card = blockCard('Tutorials');

      await userEvent.clear(sessionTypeInput(card));
      await userEvent.type(sessionTypeInput(card), 'Workshop');

      expect(previewRows(card).map(row => row[5])).toEqual(['Workshop', 'Workshop']);
    });

    test('existing sessions can be shown to check for clashes', async () => {
      sessionsAPI.getAll.mockResolvedValue([existingSession]);
      render(<ImportSessions />);
      await uploadCsv();

      const toggle = await screen.findByRole('button', { name: /existing sessions in this unit/i });
      expect(within(toggle).getByText('1')).toBeInTheDocument();
      expect(screen.queryByText('GP-S-201')).not.toBeInTheDocument();

      await userEvent.click(toggle);
      expect(screen.getByText('GP-S-201')).toBeInTheDocument();
      expect(screen.getByText('09:00 - 10:00')).toBeInTheDocument();

      await userEvent.click(toggle);
      expect(screen.queryByText('GP-S-201')).not.toBeInTheDocument();
    });

    test('"Choose a different file" goes back to the upload step', async () => {
      render(<ImportSessions />);
      await uploadCsv();
      await userEvent.click(screen.getByRole('button', { name: 'Choose a different file' }));

      expect(screen.getByText(/drag and drop your timetable csv here/i)).toBeInTheDocument();
    });

    test('"Cancel" clears the import and returns to Sessions', async () => {
      render(<ImportSessions />);
      await uploadCsv();
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(mockResetImportState).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('/sessions');
    });
  });

  describe('importing', () => {
    test('with no existing sessions, imports straight away and shows the result', async () => {
      render(<ImportSessions />);
      await uploadCsv();
      await userEvent.click(importButton());

      await waitFor(() => expect(sessionsAPI.import).toHaveBeenCalledWith('u1', expectedPayload, false));
      expect(await screen.findByRole('heading', { name: 'Import Complete' })).toBeInTheDocument();
      expect(within(screen.getByText('Imported').closest('.is-result-stat')).getByText('3')).toBeInTheDocument();
      expect(within(screen.getByText('Skipped').closest('.is-result-stat')).getByText('0')).toBeInTheDocument();
    });

    test('with existing sessions, "Replace all" replaces them', async () => {
      sessionsAPI.getAll.mockResolvedValue([existingSession]);
      render(<ImportSessions />);
      await uploadCsv();
      await userEvent.click(importButton());

      expect(await screen.findByText(/this unit already has sessions/i)).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Replace all' }));

      await waitFor(() => expect(sessionsAPI.import).toHaveBeenCalledWith('u1', expectedPayload, true));
    });

    test('with existing sessions, "Add to existing" keeps them', async () => {
      sessionsAPI.getAll.mockResolvedValue([existingSession]);
      render(<ImportSessions />);
      await uploadCsv();
      await userEvent.click(importButton());
      await userEvent.click(await screen.findByRole('button', { name: 'Add to existing' }));

      await waitFor(() => expect(sessionsAPI.import).toHaveBeenCalledWith('u1', expectedPayload, false));
      expect(screen.queryByText(/this unit already has sessions/i)).not.toBeInTheDocument();
    });

    test('lists any rows that were skipped', async () => {
      sessionsAPI.import.mockResolvedValue({
        importedCount: 2,
        skippedCount: 1,
        skipped: [{ rowIndex: 1, reason: 'Invalid time', row: { day: 'Tuesday', startTime: '' } }],
      });
      render(<ImportSessions />);
      await uploadCsv();
      await userEvent.click(importButton());

      expect(await screen.findByText('Row 2: Invalid time (day: "Tuesday", start: "")')).toBeInTheDocument();
    });

    test('"Done" returns to the Sessions page', async () => {
      render(<ImportSessions />);
      await uploadCsv();
      await userEvent.click(importButton());
      await userEvent.click(await screen.findByRole('button', { name: 'Done' }));

      expect(mockNavigate).toHaveBeenCalledWith('/sessions');
    });

    test('shows the error if the import fails', async () => {
      sessionsAPI.import.mockRejectedValue(new Error('Row 3 has an invalid day'));
      render(<ImportSessions />);
      await uploadCsv();
      await userEvent.click(importButton());

      expect(await screen.findByText('Row 3 has an invalid day')).toHaveClass('is-error');
      expect(screen.queryByRole('heading', { name: 'Import Complete' })).not.toBeInTheDocument();
    });

    test('shows an error if existing sessions cannot be checked', async () => {
      render(<ImportSessions />);
      await uploadCsv();
      sessionsAPI.getAll.mockRejectedValue(new Error('Server down'));
      await userEvent.click(importButton());

      expect(await screen.findByText('Could not check existing sessions. Please try again.')).toBeInTheDocument();
      expect(sessionsAPI.import).not.toHaveBeenCalled();
    });

    test('a unit must be selected before importing', async () => {
      useActiveUnit.mockReturnValue({ activeUnit: null });
      render(<ImportSessions />);
      expect(screen.getByRole('heading', { name: 'Upload Session' })).toBeInTheDocument();

      await uploadCsv();
      expect(sessionsAPI.getAll).not.toHaveBeenCalled();
      await userEvent.click(importButton());

      expect(screen.getByText('Please select a unit before importing sessions.')).toBeInTheDocument();
      expect(sessionsAPI.import).not.toHaveBeenCalled();
    });

    test('shows "Importing..." while importing', async () => {
      sessionsAPI.import.mockReturnValue(new Promise(() => {}));
      render(<ImportSessions />);
      await uploadCsv();
      await userEvent.click(importButton());

      expect(await screen.findByRole('button', { name: 'Importing...' })).toBeDisabled();
    });

    test('a unit in the page address is used instead of the active unit', async () => {
      mockParams = { unitId: 'u9' };
      render(<ImportSessions />);
      await uploadCsv();
      await userEvent.click(importButton());

      expect(sessionsAPI.getAll).toHaveBeenCalledWith('u9');
      await waitFor(() => expect(sessionsAPI.import).toHaveBeenCalledWith('u9', expectedPayload, false));
    });
  });
});