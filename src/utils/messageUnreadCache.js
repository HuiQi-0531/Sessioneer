import { messagesAPI } from '../config/api';

const CACHE_TTL_MS = 30000;

let cachedKey = null;
let cachedValue = null;
let cachedAt = 0;
let pendingRequest = null;

const getUnitsKey = (units) => units.map(unit => unit.id).sort().join('|');

export const invalidateMessageUnreadCache = () => {
  cachedKey = null;
  cachedValue = null;
  cachedAt = 0;
  pendingRequest = null;
};

export const getCachedHasUnreadMessages = async (units = []) => {
  if (!units.length) {
    return false;
  }

  const key = getUnitsKey(units);
  const now = Date.now();

  if (cachedKey === key && cachedValue !== null && now - cachedAt < CACHE_TTL_MS) {
    return cachedValue;
  }

  if (pendingRequest && cachedKey === key) {
    return pendingRequest;
  }

  cachedKey = key;
  pendingRequest = Promise.all(
    units.map(async (unit) => {
      const [groupData, contacts] = await Promise.all([
        messagesAPI.getGroupUnreadCount(unit.id),
        messagesAPI.getUnitContacts(unit.id)
      ]);
      const groupUnread = groupData?.unreadCount || 0;
      const directUnread = contacts.reduce((sum, contact) => sum + (contact.unreadCount || 0), 0);
      return groupUnread + directUnread;
    })
  ).then((results) => {
    cachedValue = results.reduce((sum, count) => sum + count, 0) > 0;
    cachedAt = Date.now();
    pendingRequest = null;
    return cachedValue;
  }).catch((error) => {
    pendingRequest = null;
    throw error;
  });

  return pendingRequest;
};
