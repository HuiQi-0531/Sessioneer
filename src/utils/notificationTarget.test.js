// Clicking a notification for another unit/role must switch to it first,
// otherwise the role guard sends the user back to their dashboard.
import { roleForPath, unitIdForNotification, resolveNotificationTarget } from './notificationTarget';

const CAB201 = { id: '11111111-1111-1111-1111-111111111111', unitCode: 'CAB201', roles: ['coordinator'] };
const IFB105 = { id: '22222222-2222-2222-2222-222222222222', unitCode: 'IFB105', roles: ['tutor'] };
const MIXED = { id: '33333333-3333-3333-3333-333333333333', unitCode: 'IFB398', roles: ['coordinator', 'super_tutor'] };
const allUnits = [CAB201, IFB105, MIXED];

test('roleForPath knows which pages are tutor-only and which are UC-only', () => {
  expect(roleForPath(`/tutor-schedule/${IFB105.id}`)).toBe('tutor');
  expect(roleForPath(`/availability?unitId=${IFB105.id}`)).toBe('tutor');
  expect(roleForPath('/requests')).toBe('tutor');
  expect(roleForPath(`/schedule-builder/${CAB201.id}`)).toBe('coordinator');
  expect(roleForPath('/uc-requests')).toBe('coordinator');
  expect(roleForPath('/profile')).toBeNull();
});

test('the unit comes from relatedUnitId, else from the link', () => {
  expect(unitIdForNotification({ relatedUnitId: IFB105.id, actionUrl: '/requests' })).toBe(IFB105.id);
  expect(unitIdForNotification({ actionUrl: `/tutor-schedule/${IFB105.id}` })).toBe(IFB105.id);
  expect(unitIdForNotification({ actionUrl: `/availability?unitId=${IFB105.id}` })).toBe(IFB105.id);
  expect(unitIdForNotification({ actionUrl: '/uc-dashboard' })).toBeNull();
});

test('UC on CAB201 clicking an IFB105 tutor notification switches unit and role', () => {
  const n = { relatedUnitId: IFB105.id, actionUrl: `/tutor-schedule/${IFB105.id}` };
  expect(resolveNotificationTarget(n, { allUnits, activeUnitId: CAB201.id, activeViewRole: 'coordinator' }))
    .toEqual({ path: `/tutor-schedule/${IFB105.id}`, unitId: IFB105.id, role: 'tutor' });
});

test('same unit and right role: nothing to switch', () => {
  const n = { relatedUnitId: CAB201.id, actionUrl: `/schedule-builder/${CAB201.id}` };
  expect(resolveNotificationTarget(n, { allUnits, activeUnitId: CAB201.id, activeViewRole: 'coordinator' }))
    .toEqual({ path: `/schedule-builder/${CAB201.id}`, unitId: null, role: null });
});

test('same unit with two roles: only the role flips (super tutor counts as tutor)', () => {
  const n = { relatedUnitId: MIXED.id, actionUrl: `/tutor-schedule/${MIXED.id}` };
  expect(resolveNotificationTarget(n, { allUnits, activeUnitId: MIXED.id, activeViewRole: 'coordinator' }))
    .toEqual({ path: `/tutor-schedule/${MIXED.id}`, unitId: null, role: 'tutor' });
});

test('a unit that is not mine is not switched to; the link is still followed', () => {
  const other = '99999999-9999-9999-9999-999999999999';
  const n = { relatedUnitId: other, actionUrl: `/tutor-schedule/${other}` };
  expect(resolveNotificationTarget(n, { allUnits, activeUnitId: CAB201.id, activeViewRole: 'coordinator' }))
    .toEqual({ path: `/tutor-schedule/${other}`, unitId: null, role: null });
});

test('no link means nothing happens', () => {
  expect(resolveNotificationTarget({ relatedUnitId: IFB105.id }, { allUnits }).path).toBeNull();
});