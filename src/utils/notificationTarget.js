import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveUnit } from '../context/ActiveUnitContext';

// A notification can belong to a different unit (or a different role) than the
// one currently open. Pages are guarded by the active unit's role, so just
// navigating to e.g. /tutor-schedule while viewing CAB201 as UC bounces back to
// the UC dashboard. These helpers work out which unit and role the link needs
// and switch to them first.

const COORDINATOR_PATHS = ['/uc-', '/unit-setup', '/sessions', '/tutors', '/schedule-builder', '/messages', '/applications'];
const TUTOR_PATHS = ['/tutor-', '/requests', '/availability'];

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const startsWithAny = (path, prefixes) => prefixes.some(p => path === p || path.startsWith(p));

// Which view role a page needs, or null when either role can open it.
export const roleForPath = (url = '') => {
  const path = url.split('?')[0];
  if (startsWithAny(path, TUTOR_PATHS)) return 'tutor';
  if (startsWithAny(path, COORDINATOR_PATHS)) return 'coordinator';
  return null;
};

// The unit a notification is about: the stored unit id, else an id inside the link
// (/tutor-schedule/<id> or ?unitId=<id>).
export const unitIdForNotification = (notification) => {
  if (notification?.relatedUnitId) return notification.relatedUnitId;
  const match = (notification?.actionUrl || '').match(UUID);
  return match ? match[0] : null;
};

const unitHasRole = (unit, role) => {
  const roles = (unit?.roles || []).map(r => (r === 'super_tutor' ? 'tutor' : r));
  return roles.includes(role);
};

// Where to go and what to switch to. unitId/role are null when nothing needs changing
// (or the unit is not one of mine, in which case we just follow the link).
export const resolveNotificationTarget = (notification, { allUnits = [], activeUnitId, activeViewRole } = {}) => {
  const path = notification?.actionUrl || null;
  if (!path) return { path: null, unitId: null, role: null };

  const wantedUnitId = unitIdForNotification(notification);
  const targetUnit = allUnits.find(u => u.id === wantedUnitId) || null;
  const unitId = targetUnit && targetUnit.id !== activeUnitId ? targetUnit.id : null;

  const unitForRole = targetUnit || allUnits.find(u => u.id === activeUnitId) || null;
  const neededRole = roleForPath(path);
  const role = neededRole && unitHasRole(unitForRole, neededRole) && (unitId || neededRole !== activeViewRole)
    ? neededRole
    : null;

  return { path, unitId, role };
};

// Hook used by the bell and both dashboards.
export const useOpenNotification = () => {
  const navigate = useNavigate();
  const { allUnits, activeUnitId, activeViewRole, setActiveUnitId, setActiveViewRole } = useActiveUnit();

  return useCallback((notification) => {
    const target = resolveNotificationTarget(notification, { allUnits, activeUnitId, activeViewRole });
    if (!target.path) return;
    if (target.unitId && setActiveUnitId) setActiveUnitId(target.unitId);
    if (target.role && setActiveViewRole) setActiveViewRole(target.role);
    navigate(target.path);
  }, [navigate, allUnits, activeUnitId, activeViewRole, setActiveUnitId, setActiveViewRole]);
};