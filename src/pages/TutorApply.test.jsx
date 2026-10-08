import React from 'react';
import { render, screen, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

import TutorApply from './TutorApply';
import { tutorApplicationsAPI } from '../config/api';

// ---------- Mocks ----------

jest.mock('../config/api', () => ({
  tutorApplicationsAPI: { getApplicationUnit: jest.fn(), submit: jest.fn() },
}));

// A small, predictable version of the form settings
jest.mock('../utils/applicationForm', () => ({
  LOCKED_FIELDS: [{ label: 'First name' }, { label: 'Last name' }, { label: 'Email' }],
  DEFAULT_APPLICATION_FIELDS: [
    { key: 'phoneNumber', label: 'Phone number', type: 'text', required: true },
    { key: 'maximumHours', label: 'Maximum hours', type: 'number' },
    { key: 'resume', label: 'Resume', type: 'file' },
  ],
  LEGACY_FIELD_KEYS: ['phoneNumber', 'workExperience', 'maximumHours', 'contractType'],
}));

// ---------- Test data ----------

// A unit with its own custom application form
const unitWithForm = {
  unitCode: 'FIT1001',
  unitName: 'Intro Programming',
  applicationForm: [
    { key: 'phoneNumber', label: 'Phone number', type: 'text', required: true },
    { key: 'workExperience', label: 'Experience', type: 'textarea' },
    { key: 'maximumHours', label: 'Maximum hours', type: 'number' },
    { key: 'contractType', label: 'Contract type', type: 'select', options: ['Casual', 'Sessional'] },
    { key: 'languages', label: 'Languages', type: 'checkbox', options: ['English', 'Mandarin', 'Hindi'] },
    { key: 'why_tutor', label: 'Why tutor?', type: 'text', required: true },
    { key: 'resume', label: 'Resume', type: 'file' },
    { key: 'transcript', label: 'Transcript', type: 'file' },
  ],
};

const pdf = (content, name) => new File([content], name, { type: 'application/pdf' });

// ---------- Helpers ----------

// Each question sits in a .ta-field box with its label first
const fieldBox = (label) =>
  Array.from(document.querySelectorAll('.ta-field'))
    .find(box => box.querySelector('label').textContent.replace(/ \*$/, '') === label);
const control = (label) => fieldBox(label).querySelector('input, textarea, select');

const fillNames = async () => {
  await userEvent.type(document.querySelector('[name="firstName"]'), ' Alice ');
  await userEvent.type(document.querySelector('[name="lastName"]'), 'Smith');
  await userEvent.type(document.querySelector('[name="email"]'), ' alice@example.com ');
};

const upload = (label, file) => fireEvent.change(control(label), { target: { files: [file] } });
const submitForm = () => fireEvent.submit(document.querySelector('form'));

const renderForUnit = async () => {
  window.history.pushState({}, '', '/apply?unitId=u1');
  render(<TutorApply />);
  await screen.findByText('FIT1001');
};

// ---------- Setup ----------

beforeEach(() => {
  window.history.pushState({}, '', '/apply');
  tutorApplicationsAPI.getApplicationUnit.mockResolvedValue(unitWithForm);
  tutorApplicationsAPI.submit.mockResolvedValue({});
});

afterEach(() => {
  window.history.pushState({}, '', '/');
  jest.restoreAllMocks();
});

// ---------- Tests ----------

describe('TutorApply', () => {
  describe('showing the form', () => {
    test('without a unit link, shows the general form', () => {
      render(<TutorApply />);

      expect(screen.getByRole('heading', { name: 'Tutor Application' })).toBeInTheDocument();
      expect(screen.getByText(/interested in tutoring with us/i)).toBeInTheDocument();
      expect(fieldBox('Phone number')).toBeInTheDocument();
      expect(fieldBox('Resume')).toBeInTheDocument();
      expect(tutorApplicationsAPI.getApplicationUnit).not.toHaveBeenCalled();
    });

    test('with a unit link, shows the unit and its own questions', async () => {
      await renderForUnit();

      expect(tutorApplicationsAPI.getApplicationUnit).toHaveBeenCalledWith('u1');
      expect(screen.getByText('Applying for')).toBeInTheDocument();
      expect(screen.getByText('Intro Programming')).toBeInTheDocument();
      expect(within(fieldBox('Languages')).getByLabelText('Mandarin')).toBeInTheDocument();
      expect(within(control('Contract type')).getAllByRole('option').map(o => o.textContent))
        .toEqual(['-- Select --', 'Casual', 'Sessional']);
    });

    test('falls back to the general form if the unit cannot be loaded', async () => {
      tutorApplicationsAPI.getApplicationUnit.mockRejectedValue(new Error('Not found'));
      window.history.pushState({}, '', '/apply?unitId=bad');
      render(<TutorApply />);

      await waitFor(() => expect(tutorApplicationsAPI.getApplicationUnit).toHaveBeenCalled());
      expect(screen.getByText(/interested in tutoring with us/i)).toBeInTheDocument();
      expect(fieldBox('Languages')).toBeUndefined();
    });

    test('marks required questions with a star', async () => {
      await renderForUnit();

      expect(fieldBox('Phone number').querySelector('label')).toHaveTextContent('Phone number *');
      expect(fieldBox('Experience').querySelector('label')).toHaveTextContent(/^Experience$/);
      expect(screen.getByText('First name *')).toBeInTheDocument();
    });
  });

  describe('checking answers', () => {
    test('first name, last name and email are required', () => {
      render(<TutorApply />);
      submitForm();

      expect(screen.getByText('First name, last name and email are required.')).toBeInTheDocument();
      expect(tutorApplicationsAPI.submit).not.toHaveBeenCalled();
    });

    test('required questions must be answered', async () => {
      render(<TutorApply />);
      await fillNames();
      submitForm();

      expect(screen.getByText('"Phone number" is required.')).toBeInTheDocument();
      expect(tutorApplicationsAPI.submit).not.toHaveBeenCalled();
    });

    test('only PDF files are accepted', () => {
      render(<TutorApply />);
      upload('Resume', new File(['x'], 'cv.docx', { type: 'application/msword' }));

      expect(screen.getByText('Please upload a PDF file.')).toBeInTheDocument();
      expect(screen.queryByText('cv.docx')).not.toBeInTheDocument();
      expect(within(fieldBox('Resume')).getByText('Click to upload')).toBeInTheDocument();
    });

    test('files over 5MB are rejected', () => {
      const big = pdf('x', 'big.pdf');
      Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 });
      render(<TutorApply />);
      upload('Resume', big);

      expect(screen.getByText('File is too large (max 5MB).')).toBeInTheDocument();
    });

    test('a valid PDF shows its file name', () => {
      render(<TutorApply />);
      upload('Resume', pdf('hello', 'cv.pdf'));

      expect(within(fieldBox('Resume')).getByText('cv.pdf')).toBeInTheDocument();
    });
  });

  describe('submitting', () => {
    test('sends the general form and shows a thank-you message', async () => {
      render(<TutorApply />);
      await fillNames();
      await userEvent.type(control('Phone number'), '0400 000 001');
      await userEvent.type(control('Maximum hours'), '10');
      submitForm();

      await waitFor(() => expect(tutorApplicationsAPI.submit).toHaveBeenCalledWith({
        unitId: null,
        firstName: 'Alice',
        lastName: 'Smith',
        email: 'alice@example.com',
        phoneNumber: '0400 000 001',
        maximumHours: 10,
        customAnswers: {},
      }));
      expect(await screen.findByRole('heading', { name: 'Application submitted!' })).toBeInTheDocument();
    });

    test('sends every kind of answer for a unit\'s custom form, including files', async () => {
      await renderForUnit();
      await fillNames();
      await userEvent.type(control('Phone number'), '0400 000 001');
      await userEvent.type(control('Experience'), 'Tutored for 2 years');
      await userEvent.type(control('Maximum hours'), '12');
      await userEvent.selectOptions(control('Contract type'), 'Casual');
      const languages = within(fieldBox('Languages'));
      await userEvent.click(languages.getByLabelText('English'));
      await userEvent.click(languages.getByLabelText('Mandarin'));
      await userEvent.click(languages.getByLabelText('Mandarin')); // untick again
      await userEvent.type(control('Why tutor?'), 'I love teaching');
      upload('Resume', pdf('hello', 'cv.pdf'));
      upload('Transcript', pdf('world', 'transcript.pdf'));
      submitForm();

      await waitFor(() => expect(tutorApplicationsAPI.submit).toHaveBeenCalledWith({
        unitId: 'u1',
        firstName: 'Alice',
        lastName: 'Smith',
        email: 'alice@example.com',
        phoneNumber: '0400 000 001',
        workExperience: 'Tutored for 2 years',
        maximumHours: 12,
        contractType: 'Casual',
        resumeBase64: 'aGVsbG8=', // "hello"
        resumeFilename: 'cv.pdf',
        resumeMimeType: 'application/pdf',
        customAnswers: {
          languages: ['English'],
          why_tutor: 'I love teaching',
          transcript: { filename: 'transcript.pdf', mimeType: 'application/pdf', base64: 'd29ybGQ=' }, // "world"
        },
      }));
    });

    test('leaves out questions that were not answered', async () => {
      await renderForUnit();
      await fillNames();
      await userEvent.type(control('Phone number'), '0400 000 001');
      await userEvent.type(control('Why tutor?'), 'I love teaching');
      submitForm();

      await waitFor(() => expect(tutorApplicationsAPI.submit).toHaveBeenCalledWith({
        unitId: 'u1',
        firstName: 'Alice',
        lastName: 'Smith',
        email: 'alice@example.com',
        phoneNumber: '0400 000 001',
        customAnswers: { why_tutor: 'I love teaching' },
      }));
    });

    test('shows "Submitting..." while sending', async () => {
      tutorApplicationsAPI.submit.mockReturnValue(new Promise(() => {}));
      render(<TutorApply />);
      await fillNames();
      await userEvent.type(control('Phone number'), '0400 000 001');
      submitForm();

      expect(await screen.findByRole('button', { name: 'Submitting...' })).toBeDisabled();
    });

    test('shows the error and keeps the form if sending fails', async () => {
      tutorApplicationsAPI.submit.mockRejectedValue(new Error('You have already applied for this unit'));
      render(<TutorApply />);
      await fillNames();
      await userEvent.type(control('Phone number'), '0400 000 001');
      submitForm();

      expect(await screen.findByText('You have already applied for this unit')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Submit Application' })).toBeEnabled();
      expect(screen.queryByText('Application submitted!')).not.toBeInTheDocument();
    });
  });
});