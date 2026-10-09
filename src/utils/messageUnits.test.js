import { isPastUnit, pickMessageUnits, messageUnitLabel, initialMessageUnitId } from './messageUnits';

const OCT_2026 = new Date(2026, 9, 9);
const cab2026 = { id: 'a', unitCode: 'CAB139', semester: 'Semester 2', year: 2026, roles: ['coordinator'] };
const cab2027 = { id: 'b', unitCode: 'CAB139', semester: 'Semester 2', year: 2027, roles: ['coordinator'] };
const old = { id: 'c', unitCode: 'IFN501', semester: 'Semester 1', year: 2026, roles: ['coordinator'] };
const tutorOnly = { id: 'd', unitCode: 'CAB201', semester: 'Semester 2', year: 2026, roles: ['tutor'] };

test('past units are hidden, current and upcoming are kept', () => {
  expect(isPastUnit(old, OCT_2026)).toBe(true);
  expect(isPastUnit(cab2026, OCT_2026)).toBe(false);
  expect(isPastUnit(cab2027, OCT_2026)).toBe(false);
  const units = pickMessageUnits([cab2026, cab2027, old, tutorOnly], u => u.roles.includes('coordinator'), OCT_2026);
  expect(units.map(u => u.id)).toEqual(['a', 'b']);
});

test('same unit code gets a semester label, unique code does not', () => {
  const list = [cab2026, cab2027, tutorOnly];
  expect(messageUnitLabel(cab2026, list)).toBe('#CAB139 · S2 2026');
  expect(messageUnitLabel(cab2027, list)).toBe('#CAB139 · S2 2027');
  expect(messageUnitLabel(tutorOnly, list)).toBe('#CAB201');
});

test('starts on the active unit when listed, otherwise the first unit', () => {
  expect(initialMessageUnitId([cab2026, cab2027], cab2027)).toBe('b');
  expect(initialMessageUnitId([cab2026], old)).toBe('a');
  expect(initialMessageUnitId([], old)).toBe(null);
});
