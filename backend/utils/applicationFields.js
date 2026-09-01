// Default set of extra application fields (Name/Email are always fixed and
// handled outside of this list - see formatApplication in
// tutorApplications.routes.js). A unit's `application_form` column starts
// out NULL, meaning "using the default template below". The first time a
// coordinator saves the editor, we store their own copy here so it no
// longer tracks changes to this default.
const FIELD_TYPES = ['text', 'textarea', 'number', 'select', 'checkbox', 'file'];

// Fields that map onto tutor_applications' own columns (and, from there,
// onto the new user's account when an invite is accepted) instead of the
// generic custom_answers JSON blob. A coordinator can rename the label,
// toggle "required", or delete these, but their `key`/`type` stay fixed
// since other parts of the app (Tutors page, accept-invite) read them by
// name.
const LEGACY_FIELD_KEYS = ['phoneNumber', 'workExperience', 'maximumHours', 'contractType', 'resume'];

const DEFAULT_APPLICATION_FIELDS = [
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

// Basic shape validation before we let a coordinator overwrite the stored
// form - not trying to be exhaustive, just enough to stop garbage data.
const sanitiseFields = (fields) => {
  if (!Array.isArray(fields)) return null;
  const seenKeys = new Set();
  const clean = [];
  for (const raw of fields) {
    if (!raw || typeof raw !== 'object') continue;
    const key = String(raw.key || '').trim();
    const label = String(raw.label || '').trim();
    const type = FIELD_TYPES.includes(raw.type) ? raw.type : 'text';
    if (!key || !label || seenKeys.has(key)) continue;
    seenKeys.add(key);
    const field = { key, label, type, required: !!raw.required };
    if (type === 'select' || type === 'checkbox') {
      field.options = Array.isArray(raw.options)
        ? raw.options.map(o => String(o).trim()).filter(Boolean)
        : [];
    }
    clean.push(field);
  }
  return clean;
};

module.exports = { FIELD_TYPES, LEGACY_FIELD_KEYS, DEFAULT_APPLICATION_FIELDS, sanitiseFields };