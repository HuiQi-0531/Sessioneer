const { requiresSuperTutor } = require('../../utils/roles');

describe('requiresSuperTutor', () => {
  test('LG-79: Lecture needs a Super Tutor', () => {
    expect(requiresSuperTutor('Lecture')).toBe(true);
  });
  test('LG-80: Consultation needs a Super Tutor, ignoring case and spaces', () => {
    expect(requiresSuperTutor('  CONSULTATION ')).toBe(true);
  });
  test('LG-81: Tutorial and Workshop do not need a Super Tutor', () => {
    expect(requiresSuperTutor('Tutorial')).toBe(false);
    expect(requiresSuperTutor('Workshop')).toBe(false);
  });
  test('LG-82: similar but different text is not treated as Lecture', () => {
    expect(requiresSuperTutor('Lecture Recording')).toBe(false);
  });
  test('LG-83: missing session type does not need a Super Tutor', () => {
    expect(requiresSuperTutor(null)).toBe(false);
    expect(requiresSuperTutor(undefined)).toBe(false);
  });
});
