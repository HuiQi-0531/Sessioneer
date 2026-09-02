// Mirrors backend/utils/applicationFields.js. Keep the two in sync.
export const FIELD_TYPES = [
  { value: 'text', label: 'Short text' },
  { value: 'textarea', label: 'Paragraph' },
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Dropdown' },
  { value: 'checkbox', label: 'Checkboxes' },
  { value: 'file', label: 'File upload' }
];

// Fields whose key maps onto tutor_applications' own dedicated columns
// (and, from there, onto the new user's account) instead of the generic
// custom_answers JSON blob.
export const LEGACY_FIELD_KEYS = ['phoneNumber', 'workExperience', 'maximumHours', 'contractType', 'resume'];

export const LOCKED_FIELDS = [
  { key: 'firstName', label: 'First name', type: 'text' },
  { key: 'lastName', label: 'Last name', type: 'text' },
  { key: 'email', label: 'Email', type: 'text' }
];

export const DEFAULT_APPLICATION_FIELDS = [
  { key: 'phoneNumber', label: 'Phone number', type: 'text', required: false },
  { key: 'workExperience', label: 'Relevant work experience', type: 'textarea', required: false },
  { key: 'maximumHours', label: 'Maximum hours / week', type: 'number', required: false },
  {
    key: 'contractType',
    label: 'Preferred contract type',
    type: 'select',
    required: false,
    options: ['Casual', 'Sessional', 'Fixed-term (Contract)']
  },
  { key: 'resume', label: 'Resume (PDF)', type: 'file', required: false }
];

export const makeFieldKey = (label, existingKeys) => {
  const base = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'field';
  let key = base;
  let i = 2;
  while (existingKeys.includes(key)) {
    key = `${base}_${i}`;
    i += 1;
  }
  return key;
};