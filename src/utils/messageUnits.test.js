import { brisbaneTodayKey, messageUnitStatus, pickMessageUnits, groupMessageUnits, messageUnitLabel, initialMessageUnitId } from './messageUnits';

const OCT_2026 = '2026-10-09';
const cab2026 = { id: 'a', unitCode: 'CAB139', semester: 'Semester 2', year: 2026, roles: ['coordinator'] };
const cab2027 = { id: 'b', unitCode: 'CAB139', semester: 'Semester 2', year: 2027, roles: ['coordinator'] };
const old = { id: 'c', unitCode: 'IFN501', semester: 'Semester 1', year: 2026, roles: ['coordinator'] };
const tutorOnly = { id: 'd', unitCode: 'CAB201', semester: 'Semester 2', year: 2026, roles: ['tutor'] };
const sem1Next = { id: 'e', unitCode: 'CAB139', semester: 'Semester 1', year: 2027, roles: ['coordinator'] };

test('status follows the semester window, edges included', () => {
  expect(messageUnitStatus(cab2026, '2026-06-30')).toBe('upcoming');
  expect(messageUnitStatus(cab2026, '2026-07-01')).toBe('current');
  expect(messageUnitStatus(cab2026, '2026-12-31')).toBe('current');
  expect(messageUnitStatus(cab2026, '2027-01-01')).toBe('past');
  expect(messageUnitStatus(old, OCT_2026)).toBe('past');
  expect(messageUnitStatus(cab2027, OCT_2026)).toBe('upcoming');
});

test('Brisbane date rolls over at Brisbane midnight, not UTC midnight', () => {
  // 1 Jul 2026, 8am in Brisbane is still 30 Jun in UTC.
  expect(brisbaneTodayKey(new Date('2026-06-30T22:00:00Z'))).toBe('2026-07-01');
  expect(brisbaneTodayKey(new Date('2026-06-30T13:59:00Z'))).toBe('2026-06-30');
});

test('past units stay in the list and are grouped', () => {
  const units = pickMessageUnits([cab2026, cab2027, old, tutorOnly, sem1Next], u => u.roles.includes('coordinator'));
  expect(units.map(u => u.id)).toEqual(['a', 'b', 'c', 'e']);
  const groups = groupMessageUnits(units, OCT_2026);
  expect(groups.current.map(u => u.id)).toEqual(['a']);
  expect(groups.upcoming.map(u => u.id)).toEqual(['e', 'b']);
  expect(groups.past.map(u => u.id)).toEqual(['c']);
});

test('same unit code gets a semester label, unique code does not', () => {
  const list = [cab2026, cab2027, tutorOnly];
  expect(messageUnitLabel(cab2026, list)).toBe('#CAB139 · S2 2026');
  expect(messageUnitLabel(cab2027, list)).toBe('#CAB139 · S2 2027');
  expect(messageUnitLabel(tutorOnly, list)).toBe('#CAB201');
});

test('starts on the active unit, then current, then upcoming, then past', () => {
  expect(initialMessageUnitId([cab2026, cab2027], cab2027, OCT_2026)).toBe('b');
  expect(initialMessageUnitId([old, cab2027, cab2026], null, OCT_2026)).toBe('a');
  expect(initialMessageUnitId([old, cab2027], null, OCT_2026)).toBe('b');
  expect(initialMessageUnitId([old], null, OCT_2026)).toBe('c');
  expect(initialMessageUnitId([], old, OCT_2026)).toBe(null);
});