// API Configuration
export const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

// Reads the saved token and returns the Authorization header,
// or an empty object if there is no token (e.g. not logged in).
const authHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
};

const withTimeout = async (request, timeoutMessage = 'Request timed out. Please try again.') => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    return await request(controller.signal);
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(timeoutMessage);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

const AVAILABILITY_CACHE_TTL_MS = 30000;
const availabilityCache = new Map();

const getAvailabilityCacheKey = (unitCode) => {
  const savedUser = localStorage.getItem('currentUser');
  const currentUser = savedUser ? JSON.parse(savedUser) : null;
  const viewRole = localStorage.getItem('activeViewRole') || currentUser?.role || 'unknown';
  const userId = currentUser?.id || currentUser?.email || 'anonymous';
  const unit = String(unitCode || '').trim().toUpperCase();

  return `${unit}:${userId}:${viewRole}`;
};

const clearAvailabilityCache = (unitCode) => {
  if (unitCode) {
    availabilityCache.delete(getAvailabilityCacheKey(unitCode));
    return;
  }
  availabilityCache.clear();
};

const REQUESTS_CACHE_TTL_MS = 30000;
let requestsCache = null;
let ucRequestsCache = null;

const clearRequestsCache = () => {
  requestsCache = null;
  ucRequestsCache = null;
};

const SESSIONS_CACHE_TTL_MS = 30000;
const sessionsCache = new Map();
const assignedSessionsCache = new Map();

const getSessionsCacheKey = (unitId) => String(unitId || '');

const clearSessionsCache = (unitId) => {
  if (unitId) {
    const cacheKey = getSessionsCacheKey(unitId);
    sessionsCache.delete(cacheKey);
    assignedSessionsCache.delete(cacheKey);
    return;
  }
  sessionsCache.clear();
  assignedSessionsCache.clear();
};

const TUTORS_CACHE_TTL_MS = 30000;
const tutorsCache = new Map();

const getTutorsCacheKey = (unitId) => String(unitId || '');

const clearTutorsCache = (unitId) => {
  if (unitId) {
    tutorsCache.delete(getTutorsCacheKey(unitId));
    return;
  }
  tutorsCache.clear();
};

const APPLICATIONS_CACHE_TTL_MS = 30000;
const applicationsCache = new Map();

const getApplicationsCacheKey = (unitId) => String(unitId || '');

const clearApplicationsCache = (unitId) => {
  if (unitId) {
    applicationsCache.delete(getApplicationsCacheKey(unitId));
    return;
  }
  applicationsCache.clear();
};

const MESSAGE_THREAD_CACHE_TTL_MS = 5000;
const MESSAGE_CONTACTS_CACHE_TTL_MS = 15000;
const groupThreadCache = new Map();
const directThreadCache = new Map();
const unitContactsCache = new Map();
const groupUnreadCache = new Map();

const getMessageCacheKey = (id) => String(id || '');

const clearMessageUnitCache = (unitId) => {
  const cacheKey = getMessageCacheKey(unitId);
  groupThreadCache.delete(cacheKey);
  unitContactsCache.delete(cacheKey);
  groupUnreadCache.delete(cacheKey);
};

const clearDirectMessageCache = (otherUserId) => {
  directThreadCache.delete(getMessageCacheKey(otherUserId));
};

const PROFILE_CACHE_TTL_MS = 30000;
let profileCache = null;

const clearProfileCache = () => {
  profileCache = null;
};

const DASHBOARD_CACHE_TTL_MS = 30000;
let ucDashboardCache = null;
let tutorDashboardCache = null;

const NOTIFICATIONS_CACHE_TTL_MS = 15000;
let notificationsCache = null;

const clearNotificationsCache = () => {
  notificationsCache = null;
};

export const authAPI = {
  register: async (registerData) => {
    const response = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(registerData)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to create account');
    }

    return data;
  },

  login: async (loginData) => {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(loginData)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Invalid email or password');
    }

    return data;
  },

  forgotPassword: async (email) => {
    const response = await withTimeout((signal) => fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email }),
        signal
      }),
      'Sending reset email timed out. Please try again.'
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to send reset email');
    }

    return data;
  },

  resetPassword: async (token, newPassword) => {
    const response = await withTimeout((signal) => fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ token, newPassword }),
        signal
      }),
      'Resetting password timed out. Please try again.'
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to reset password');
    }

    return data;
  }
};

export const requestsAPI = {
  // Get all requests
  getAll: async () => {
    const now = Date.now();

    if (requestsCache?.data && now - requestsCache.updatedAt < REQUESTS_CACHE_TTL_MS) {
      return requestsCache.data;
    }

    if (requestsCache?.promise) {
      return requestsCache.promise;
    }

    const promise = fetch(`${API_URL}/requests`, {
      headers: authHeader()
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to fetch requests');
        requestsCache = { data, updatedAt: Date.now() };
        return data;
      })
      .catch((error) => {
        requestsCache = null;
        throw error;
      });

    requestsCache = { promise, updatedAt: now };
    return promise;
  },

  getFresh: async () => {
    requestsCache = null;
    return requestsAPI.getAll();
  },

  prefetch: async () => {
    return requestsAPI.getAll();
  },

  // Create request
  create: async (requestData) => {
    const response = await fetch(`${API_URL}/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify(requestData)
    });
    if (!response.ok) throw new Error('Failed to create request');
    const data = await response.json();
    clearRequestsCache();
    return data;
  },

  // Update request
  update: async (id, data) => {
    const res = await fetch(`${API_URL}/requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update');
    const result = await res.json();
    clearRequestsCache();
    return result;
  },

  // Delete request
  delete: async (id) => {
    const response = await fetch(`${API_URL}/requests/${id}`, {
      method: 'DELETE',
      headers: authHeader()
    });
    if (!response.ok) throw new Error('Failed to delete request');
    const data = await response.json();
    clearRequestsCache();
    return data;
  }

};

export const coverAPI = {
  // UC: broadcast selected sessions to every other tutor on the unit
  broadcast: async (sessionIds, reason) => {
    const response = await fetch(`${API_URL}/uc/cover-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ sessionIds, reason })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to broadcast cover request');
    return data;
  },

  // UC: track status of past broadcasts
  getUcHistory: async () => {
    const response = await fetch(`${API_URL}/uc/cover-requests`, { headers: authHeader() });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to fetch cover requests');
    return data;
  },

  // Tutor: list everything currently open and claimable
  getOpen: async () => {
    const response = await fetch(`${API_URL}/cover-requests/open`, { headers: authHeader() });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to fetch open cover requests');
    return data;
  },

  // Tutor: claim one - first come, first served
  claim: async (id) => {
    const response = await fetch(`${API_URL}/cover-requests/${id}/claim`, {
      method: 'POST',
      headers: authHeader()
    });
    const data = await response.json();
    if (!response.ok) {
      const err = new Error(data.error || 'Failed to claim session');
      err.status = response.status;
      throw err;
    }
    return data;
  },

  // UC: cancel an open broadcast batch
  cancelBatch: async (batchId) => {
    const response = await fetch(`${API_URL}/uc/cover-requests/batch/${batchId}`, {
      method: 'DELETE',
      headers: authHeader()
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to cancel cover batch');
    return data;
  }
};

export const ucAPI = {

  getAllRequests: async () => {
    const now = Date.now();

    if (ucRequestsCache?.data && now - ucRequestsCache.updatedAt < REQUESTS_CACHE_TTL_MS) {
      return ucRequestsCache.data;
    }

    if (ucRequestsCache?.promise) {
      return ucRequestsCache.promise;
    }

    const promise = fetch(
      `${API_URL}/uc/requests`,
      {
        headers: authHeader()
      }
    )
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to fetch UC requests');
        ucRequestsCache = { data, updatedAt: Date.now() };
        return data;
      })
      .catch((error) => {
        ucRequestsCache = null;
        throw error;
      });

    ucRequestsCache = { promise, updatedAt: now };
    return promise;

  },

  getFreshRequests: async () => {
    ucRequestsCache = null;
    return ucAPI.getAllRequests();
  },

  prefetchRequests: async () => {
    return ucAPI.getAllRequests();
  },

  reviewRequest: async (
    id,
    status,
    reviewNotes
  ) => {

    const response = await fetch(
      `${API_URL}/uc/requests/${id}/review`,
      {
        method: 'PATCH',

        headers: {
          'Content-Type': 'application/json',
          ...authHeader()
        },

        body: JSON.stringify({
          status,
          reviewNotes
        })
      }
    );

    if (!response.ok) {
      throw new Error(
        'Failed to review request'
      );
    }

    const data = await response.json();
    clearRequestsCache();
    return data;

  }

};
export const availabilityAPI = {
  get: async (unitCode) => {
    const cacheKey = getAvailabilityCacheKey(unitCode);
    const cached = availabilityCache.get(cacheKey);
    const now = Date.now();

    if (cached && cached.data && now - cached.createdAt < AVAILABILITY_CACHE_TTL_MS) {
      return cached.data;
    }

    if (cached?.promise) {
      return cached.promise;
    }

    const promise = fetch(`${API_URL}/availability?unitCode=${unitCode}`, {
      headers: authHeader()
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Failed to fetch availability');
        const data = await response.json();
        availabilityCache.set(cacheKey, { data, createdAt: Date.now() });
        return data;
      })
      .catch((error) => {
        availabilityCache.delete(cacheKey);
        throw error;
      });

    availabilityCache.set(cacheKey, { promise, createdAt: now });
    return promise;
  },

  getFresh: async (unitCode) => {
    clearAvailabilityCache(unitCode);
    const response = await fetch(`${API_URL}/availability?unitCode=${unitCode}`, {
      headers: authHeader()
    });
    if (!response.ok) throw new Error('Failed to fetch availability');
    const data = await response.json();
    availabilityCache.set(getAvailabilityCacheKey(unitCode), { data, createdAt: Date.now() });
    return data;
  },

  prefetch: async (unitCode) => {
    if (!unitCode) return null;
    return availabilityAPI.get(unitCode);
  },

  submit: async (unitCode, slots) => {
    const response = await fetch(`${API_URL}/availability/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({
        unitCode,
        slots
      })
    });

    if (!response.ok) {
      throw new Error('Failed to submit availability');
    }

    clearAvailabilityCache(unitCode);
    return response.json();
  }
};

export const unitsAPI = {
  getMyAccess: async () => {
    const response = await fetch(`${API_URL}/units/my-access`, {
      headers: authHeader()
    });
    if (!response.ok) throw new Error('Failed to fetch unit access');
    return response.json();
  },

  getMyUnits: async () => {
    const response = await fetch(`${API_URL}/units/my-units`, {
      headers: authHeader()
    });
    if (!response.ok) throw new Error('Failed to fetch units');
    return response.json();
  },

  getAll: async () => {
    const response = await fetch(`${API_URL}/units`, {
      headers: authHeader()
    });
    if (!response.ok) throw new Error('Failed to fetch units');
    return response.json();
  },

  getOne: async (id) => {
    const response = await fetch(`${API_URL}/units/${id}`, {
      headers: authHeader()
    });
    if (!response.ok) throw new Error('Failed to fetch unit');
    return response.json();
  },

  getCoordinators: async (id) => {
    const response = await fetch(`${API_URL}/units/${id}/coordinators`, {
      headers: authHeader()
    });
    if (!response.ok) throw new Error('Failed to fetch unit coordinators');
    return response.json();
  },

  addCoordinator: async (id, email) => {
    const response = await fetch(`${API_URL}/units/${id}/coordinators`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ email })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to add unit coordinator');
    return data;
  },

  create: async (unitData) => {
    const response = await fetch(`${API_URL}/units`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify(unitData)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to create unit');
    return data;
  },

  update: async (id, unitData) => {
    const response = await fetch(`${API_URL}/units/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify(unitData)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to update unit');
    return data;
  },

  // Duplicates a unit into a new semester/year. Backs onto
  // POST /units/:id/duplicate on the server.
  duplicate: async (id, duplicateData) => {
    const response = await fetch(`${API_URL}/units/${id}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify(duplicateData)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to duplicate unit');
    return data;
  },

  delete: async (id) => {
    const response = await fetch(`${API_URL}/units/${id}`, {
      method: 'DELETE',
      headers: authHeader()
    });
    if (!response.ok) throw new Error('Failed to delete unit');
    return response.json();
  },

  lockSchedule: async (id, force) => {
    const response = await fetch(`${API_URL}/units/${id}/lock-schedule`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ force })
    });
    const data = await response.json();
    if (!response.ok) {
      const err = new Error(data.error || 'Failed to lock schedule');
      err.details = data;
      throw err;
    }
    return data;
  },

  unlockSchedule: async (id) => {
    const response = await fetch(`${API_URL}/units/${id}/unlock-schedule`, {
      method: 'PATCH',
      headers: authHeader()
    });
    if (!response.ok) throw new Error('Failed to unlock schedule');
    return response.json();
  },

  lockAvailability: async (id) => {
    const response = await fetch(`${API_URL}/units/${id}/lock-availability`, {
      method: 'PATCH',
      headers: authHeader()
    });
    if (!response.ok) throw new Error('Failed to lock availability');
    return response.json();
  },

  unlockAvailability: async (id) => {
    const response = await fetch(`${API_URL}/units/${id}/unlock-availability`, {
      method: 'PATCH',
      headers: authHeader()
    });
    if (!response.ok) throw new Error('Failed to unlock availability');
    return response.json();

},

 releaseDraft: async (id) => {
   const response = await fetch(`${API_URL}/units/${id}/release-draft`, {
     method: 'PATCH',
     headers: authHeader()
   });
   if (!response.ok) throw new Error('Failed to release draft schedule');
   return response.json();
 },

 unreleaseDraft: async (id) => {
   const response = await fetch(`${API_URL}/units/${id}/unrelease-draft`, {
     method: 'PATCH',
     headers: authHeader()
   });
   if (!response.ok) throw new Error('Failed to un-release draft schedule');
   return response.json();

  }
};

export const sessionsAPI = {
  getMyAssigned: async (unitId) => {
    const cacheKey = getSessionsCacheKey(unitId);
    const cached = assignedSessionsCache.get(cacheKey);
    const now = Date.now();

    if (cached?.data && now - cached.updatedAt < SESSIONS_CACHE_TTL_MS) {
      return cached.data;
    }

    if (cached?.promise) {
      return cached.promise;
    }

    const promise = fetch(`${API_URL}/units/${unitId}/sessions/my-assigned`, {
      headers: authHeader()
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to fetch your sessions');
        assignedSessionsCache.set(cacheKey, { data, updatedAt: Date.now() });
        return data;
      })
      .catch((error) => {
        assignedSessionsCache.delete(cacheKey);
        throw error;
      });

    assignedSessionsCache.set(cacheKey, { promise, updatedAt: now });
    return promise;
  },

  getFreshMyAssigned: async (unitId) => {
    assignedSessionsCache.delete(getSessionsCacheKey(unitId));
    return sessionsAPI.getMyAssigned(unitId);
  },

  confirmSession: async (unitId, sessionId, confirmed, reason) => {
    const response = await fetch(`${API_URL}/units/${unitId}/sessions/${sessionId}/confirm`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ confirmed, reason })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to update session');
    clearSessionsCache(unitId);
    return data;
  },

  getAll: async (unitId) => {
    const cacheKey = getSessionsCacheKey(unitId);
    const cached = sessionsCache.get(cacheKey);
    const now = Date.now();

    if (cached?.data && now - cached.updatedAt < SESSIONS_CACHE_TTL_MS) {
      return cached.data;
    }

    if (cached?.promise) {
      return cached.promise;
    }

    const promise = fetch(`${API_URL}/units/${unitId}/sessions`, {
      headers: authHeader()
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to fetch sessions');
        sessionsCache.set(cacheKey, { data, updatedAt: Date.now() });
        return data;
      })
      .catch((error) => {
        sessionsCache.delete(cacheKey);
        throw error;
      });

    sessionsCache.set(cacheKey, { promise, updatedAt: now });
    return promise;
  },

  getFresh: async (unitId) => {
    clearSessionsCache(unitId);
    return sessionsAPI.getAll(unitId);
  },

  prefetch: async (unitId) => {
    if (!unitId) return null;
    return sessionsAPI.getAll(unitId);
  },

  create: async (unitId, sessionData) => {
    const response = await fetch(`${API_URL}/units/${unitId}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify(sessionData)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to create session');
    clearSessionsCache(unitId);
    return data;
  },

  update: async (unitId, sessionId, sessionData) => {
    const response = await fetch(`${API_URL}/units/${unitId}/sessions/${sessionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify(sessionData)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to update session');
    clearSessionsCache(unitId);
    return data;
  },

  delete: async (unitId, sessionId) => {
    const response = await fetch(`${API_URL}/units/${unitId}/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: authHeader()
    });
    if (!response.ok) throw new Error('Failed to delete session');
    const data = await response.json();
    clearSessionsCache(unitId);
    return data;
  },

  import: async (unitId, sessions, replace) => {
    const response = await fetch(`${API_URL}/units/${unitId}/sessions/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ sessions, replace })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to import sessions');
    clearSessionsCache(unitId);
    return data;
  }
};

export const scheduleAPI = {
  getCandidates: async (unitId, sessionId) => {
    const response = await fetch(`${API_URL}/units/${unitId}/sessions/${sessionId}/candidates`, {
      headers: authHeader()
    });
    if (!response.ok) throw new Error('Failed to fetch candidates');
    return response.json();
  },

  assignTutor: async (unitId, sessionId, tutorId) => {
    const response = await fetch(`${API_URL}/units/${unitId}/sessions/${sessionId}/assign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ tutorId })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to assign tutor');
    clearSessionsCache(unitId);
    return data;
  }
,

  unassignTutor: async (unitId, sessionId, tutorId) => {
    const response = await fetch(`${API_URL}/units/${unitId}/sessions/${sessionId}/assign/${tutorId}`, {
      method: 'DELETE',
      headers: authHeader()
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to unassign tutor');
    clearSessionsCache(unitId);
    return data;
  }
};

export const tutorsAPI = {
  getAll: async (unitId) => {
    const cacheKey = getTutorsCacheKey(unitId);
    const cached = tutorsCache.get(cacheKey);
    const now = Date.now();

    if (cached?.data && now - cached.updatedAt < TUTORS_CACHE_TTL_MS) {
      return cached.data;
    }

    if (cached?.promise) {
      return cached.promise;
    }

    const promise = fetch(`${API_URL}/units/${unitId}/tutors`, {
      headers: authHeader()
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to fetch tutors');
        tutorsCache.set(cacheKey, { data, updatedAt: Date.now() });
        return data;
      })
      .catch((error) => {
        tutorsCache.delete(cacheKey);
        throw error;
      });

    tutorsCache.set(cacheKey, { promise, updatedAt: now });
    return promise;
  },

  getFresh: async (unitId) => {
    clearTutorsCache(unitId);
    return tutorsAPI.getAll(unitId);
  },

  prefetch: async (unitId) => {
    if (!unitId) return null;
    return tutorsAPI.getAll(unitId);
  },

  updateMarker: async (unitId, tutorId, priorityTag, internalNotes, tags) => {
    const response = await fetch(`${API_URL}/units/${unitId}/tutors/${tutorId}/marker`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ priorityTag, internalNotes, tags })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to update tutor marker');
    clearTutorsCache(unitId);
    return data;
    },

 setEarlyAccess: async (unitId, tutorId, earlyAccess) => {
   const response = await fetch(`${API_URL}/units/${unitId}/tutors/${tutorId}/early-access`, {
     method: 'PUT',
     headers: { 'Content-Type': 'application/json', ...authHeader() },
     body: JSON.stringify({ earlyAccess })
   });
   const data = await response.json();
   if (!response.ok) throw new Error(data.error || 'Failed to update early access');
   clearTutorsCache(unitId);
   return data;
  },

 setStarred: async (unitId, tutorId, starred) => {
   const response = await fetch(`${API_URL}/units/${unitId}/tutors/${tutorId}/starred`, {
     method: 'PUT',
     headers: { 'Content-Type': 'application/json', ...authHeader() },
     body: JSON.stringify({ starred })
   });
   const data = await response.json();
   if (!response.ok) throw new Error(data.error || 'Failed to update starred status');
   clearTutorsCache(unitId);
   return data;
  },

 setFlagged: async (unitId, tutorId, flagged) => {
   const response = await fetch(`${API_URL}/units/${unitId}/tutors/${tutorId}/flagged`, {
     method: 'PUT',
     headers: { 'Content-Type': 'application/json', ...authHeader() },
     body: JSON.stringify({ flagged })
   });
   const data = await response.json();
   if (!response.ok) throw new Error(data.error || 'Failed to update flagged status');
   clearTutorsCache(unitId);
   return data;
  }
};

export const ucDashboardAPI = {
  getSummary: async () => {
    const now = Date.now();

    if (ucDashboardCache?.data && now - ucDashboardCache.updatedAt < DASHBOARD_CACHE_TTL_MS) {
      return ucDashboardCache.data;
    }

    if (ucDashboardCache?.promise) {
      return ucDashboardCache.promise;
    }

    const promise = fetch(`${API_URL}/uc/dashboard-summary`, {
      headers: authHeader()
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to fetch dashboard summary');
        ucDashboardCache = { data, updatedAt: Date.now() };
        return data;
      })
      .catch((error) => {
        ucDashboardCache = null;
        throw error;
      });

    ucDashboardCache = { promise, updatedAt: now };
    return promise;
  },

  prefetch: async () => {
    return ucDashboardAPI.getSummary();
  }
};

export const tutorDashboardAPI = {
  getSummary: async () => {
    const now = Date.now();

    if (tutorDashboardCache?.data && now - tutorDashboardCache.updatedAt < DASHBOARD_CACHE_TTL_MS) {
      return tutorDashboardCache.data;
    }

    if (tutorDashboardCache?.promise) {
      return tutorDashboardCache.promise;
    }

    const promise = fetch(`${API_URL}/tutor/dashboard-summary`, {
      headers: authHeader()
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to fetch dashboard summary');
        tutorDashboardCache = { data, updatedAt: Date.now() };
        return data;
      })
      .catch((error) => {
        tutorDashboardCache = null;
        throw error;
      });

    tutorDashboardCache = { promise, updatedAt: now };
    return promise;
  },

  prefetch: async () => {
    return tutorDashboardAPI.getSummary();
  }
};

export const messagesAPI = {
  getGroupThread: async (unitId) => {
    const cacheKey = getMessageCacheKey(unitId);
    const cached = groupThreadCache.get(cacheKey);
    const now = Date.now();

    if (cached?.data && now - cached.updatedAt < MESSAGE_THREAD_CACHE_TTL_MS) {
      return cached.data;
    }

    if (cached?.promise) {
      return cached.promise;
    }

    const promise = fetch(`${API_URL}/messages/group/${unitId}`, {
      headers: authHeader()
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to fetch group chat');
        groupThreadCache.set(cacheKey, { data, updatedAt: Date.now() });
        return data;
      })
      .catch((error) => {
        groupThreadCache.delete(cacheKey);
        throw error;
      });

    groupThreadCache.set(cacheKey, { promise, updatedAt: now });
    return promise;
  },

  getFreshGroupThread: async (unitId) => {
    groupThreadCache.delete(getMessageCacheKey(unitId));
    return messagesAPI.getGroupThread(unitId);
  },

  sendGroup: async (unitId, content, attachment) => {
    const body = attachment ? new FormData() : JSON.stringify({ content });
    if (attachment) {
      body.append('content', content || '');
      body.append('attachment', attachment);
    }

    const response = await fetch(`${API_URL}/messages/group/${unitId}`, {
      method: 'POST',
      headers: attachment ? authHeader() : { 'Content-Type': 'application/json', ...authHeader() },
      body
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to send message');
    clearMessageUnitCache(unitId);
    return data;
  },

  markGroupRead: async (unitId) => {
    const response = await fetch(`${API_URL}/messages/group/${unitId}/read`, {
      method: 'PATCH',
      headers: authHeader()
    });
    if (!response.ok) throw new Error('Failed to mark as read');
    const data = await response.json();
    groupUnreadCache.delete(getMessageCacheKey(unitId));
    return data;
  },

  getGroupUnreadCount: async (unitId) => {
    const cacheKey = getMessageCacheKey(unitId);
    const cached = groupUnreadCache.get(cacheKey);
    const now = Date.now();

    if (cached?.data && now - cached.updatedAt < MESSAGE_CONTACTS_CACHE_TTL_MS) {
      return cached.data;
    }

    if (cached?.promise) {
      return cached.promise;
    }

    const promise = fetch(`${API_URL}/units/${unitId}/messages/group-unread-count`, {
      headers: authHeader()
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to fetch unread count');
        groupUnreadCache.set(cacheKey, { data, updatedAt: Date.now() });
        return data;
      })
      .catch((error) => {
        groupUnreadCache.delete(cacheKey);
        throw error;
      });

    groupUnreadCache.set(cacheKey, { promise, updatedAt: now });
    return promise;
  },

  getUnitContacts: async (unitId) => {
    const cacheKey = getMessageCacheKey(unitId);
    const cached = unitContactsCache.get(cacheKey);
    const now = Date.now();

    if (cached?.data && now - cached.updatedAt < MESSAGE_CONTACTS_CACHE_TTL_MS) {
      return cached.data;
    }

    if (cached?.promise) {
      return cached.promise;
    }

    const promise = fetch(`${API_URL}/units/${unitId}/messages/contacts`, {
      headers: authHeader()
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to fetch contacts');
        unitContactsCache.set(cacheKey, { data, updatedAt: Date.now() });
        return data;
      })
      .catch((error) => {
        unitContactsCache.delete(cacheKey);
        throw error;
      });

    unitContactsCache.set(cacheKey, { promise, updatedAt: now });
    return promise;
  },

  prefetchUnit: async (unitId) => {
    if (!unitId) return null;
    return Promise.allSettled([
      messagesAPI.getGroupThread(unitId),
      messagesAPI.getUnitContacts(unitId),
      messagesAPI.getGroupUnreadCount(unitId)
    ]);
  },

  getMyContacts: async () => {
    const response = await fetch(`${API_URL}/messages/my-contacts`, {
      headers: authHeader()
    });
    if (!response.ok) throw new Error('Failed to fetch contacts');
    return response.json();
  },

  getThread: async (otherUserId) => {
    const cacheKey = getMessageCacheKey(otherUserId);
    const cached = directThreadCache.get(cacheKey);
    const now = Date.now();

    if (cached?.data && now - cached.updatedAt < MESSAGE_THREAD_CACHE_TTL_MS) {
      return cached.data;
    }

    if (cached?.promise) {
      return cached.promise;
    }

    const promise = fetch(`${API_URL}/messages/thread/${otherUserId}`, {
      headers: authHeader()
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to fetch messages');
        directThreadCache.set(cacheKey, { data, updatedAt: Date.now() });
        return data;
      })
      .catch((error) => {
        directThreadCache.delete(cacheKey);
        throw error;
      });

    directThreadCache.set(cacheKey, { promise, updatedAt: now });
    return promise;
  },

  send: async (recipientId, content, attachment) => {
    const body = attachment ? new FormData() : JSON.stringify({ recipientId, content });
    if (attachment) {
      body.append('recipientId', recipientId);
      body.append('content', content || '');
      body.append('attachment', attachment);
    }

    const response = await fetch(`${API_URL}/messages`, {
      method: 'POST',
      headers: attachment ? authHeader() : { 'Content-Type': 'application/json', ...authHeader() },
      body
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to send message');
    clearDirectMessageCache(recipientId);
    return data;
  },

  markRead: async (otherUserId) => {
    const response = await fetch(`${API_URL}/messages/thread/${otherUserId}/read`, {
      method: 'PATCH',
      headers: authHeader()
    });
    if (!response.ok) throw new Error('Failed to mark as read');
    const data = await response.json();
    clearDirectMessageCache(otherUserId);
    return data;
  }
};

export const profileAPI = {
  get: async () => {
    const now = Date.now();

    if (profileCache?.data && now - profileCache.updatedAt < PROFILE_CACHE_TTL_MS) {
      return profileCache.data;
    }

    if (profileCache?.promise) {
      return profileCache.promise;
    }

    const promise = fetch(`${API_URL}/profile`, {
      headers: authHeader()
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to fetch profile');
        profileCache = { data, updatedAt: Date.now() };
        return data;
      })
      .catch((error) => {
        clearProfileCache();
        throw error;
      });

    profileCache = { promise, updatedAt: now };
    return promise;
  },

  getFresh: async () => {
    clearProfileCache();
    return profileAPI.get();
  },

  prefetch: async () => {
    return profileAPI.get();
  },

  update: async (data) => {
    const response = await fetch(`${API_URL}/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify(data)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to update profile');
    profileCache = { data: result, updatedAt: Date.now() };
    return result;
  },

  uploadAvatar: async (file) => {
    const body = new FormData();
    body.append('avatar', file);

    const response = await fetch(`${API_URL}/profile/avatar`, {
      method: 'POST',
      headers: authHeader(),
      body
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to upload profile picture');
    profileCache = { data: result, updatedAt: Date.now() };
    return result;
  },

  changePassword: async (currentPassword, newPassword) => {
    const response = await fetch(`${API_URL}/profile/password`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to change password');
    clearProfileCache();
    return result;
  },

  updateNotifications: async (notifySessionUpdates, notifyRequestUpdates) => {
    const response = await fetch(`${API_URL}/profile/notifications`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ notifySessionUpdates, notifyRequestUpdates })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to update notification preferences');
    clearProfileCache();
    return result;
  }
};

export const tutorApplicationsAPI = {
  getApplicationUnit: async (unitId) => {
    const response = await fetch(`${API_URL}/tutor-applications/unit/${unitId}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to fetch unit');
    return result;
  },

  submit: async (data) => {
    const response = await fetch(`${API_URL}/tutor-applications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to submit application');
    clearApplicationsCache();
    return result;
  },

  getAll: async (unitId) => {
    const now = Date.now();
    const cacheKey = getApplicationsCacheKey(unitId);
    const cached = applicationsCache.get(cacheKey);

    if (cached?.data && now - cached.updatedAt < APPLICATIONS_CACHE_TTL_MS) {
      return cached.data;
    }

    if (cached?.promise) {
      return cached.promise;
    }

    const params = new URLSearchParams({ unitId });
    const promise = fetch(`${API_URL}/tutor-applications?${params.toString()}`, {
      headers: authHeader()
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to fetch applications');
        applicationsCache.set(cacheKey, { data, updatedAt: Date.now() });
        return data;
      })
      .catch((error) => {
        clearApplicationsCache(unitId);
        throw error;
      });

    applicationsCache.set(cacheKey, { promise, updatedAt: now });
    return promise;
  },

  getFresh: async (unitId) => {
    clearApplicationsCache(unitId);
    return tutorApplicationsAPI.getAll(unitId);
  },

  prefetch: async (unitId) => {
    if (!unitId) return null;
    return tutorApplicationsAPI.getAll(unitId);
  },

  downloadResume: async (applicationId, filename) => {
    const response = await fetch(`${API_URL}/tutor-applications/${applicationId}/resume`, {
      headers: authHeader()
    });
    if (!response.ok) throw new Error('Failed to download resume');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  },

  downloadTutorResume: async (userId, filename) => {
    const response = await fetch(`${API_URL}/tutor-applications/user/${userId}/resume`, {
      headers: authHeader()
    });
    if (!response.ok) throw new Error('Failed to download resume');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  },

  invite: async (applicationId, unitId, role = 'tutor') => {
    const response = await fetch(`${API_URL}/tutor-applications/${applicationId}/invite`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ unitId, role })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to invite applicant');
    clearApplicationsCache(unitId);
    return result;
  },

  directInvite: async (email, unitId, role = 'tutor') => {
    const response = await fetch(`${API_URL}/tutor-applications/direct-invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ email, unitId, role })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to create invite');
    clearApplicationsCache(unitId);
    return result;
  },

  verifyInvite: async (token) => {
    const response = await fetch(`${API_URL}/tutor-applications/verify-invite/${token}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Invalid invite link');
    return result;
  },

  acceptInvite: async (token, password, profile = {}) => {
    const response = await fetch(`${API_URL}/tutor-applications/accept-invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password, ...profile })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to create account');
    clearApplicationsCache();
    return result;
  }
};

export const notificationsAPI = {
  getAll: async () => {
    const now = Date.now();

    if (notificationsCache?.data && now - notificationsCache.updatedAt < NOTIFICATIONS_CACHE_TTL_MS) {
      return notificationsCache.data;
    }

    if (notificationsCache?.promise) {
      return notificationsCache.promise;
    }

    const promise = fetch(`${API_URL}/notifications`, {
      headers: authHeader()
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Failed to fetch notifications');
        notificationsCache = { data, updatedAt: Date.now() };
        return data;
      })
      .catch((error) => {
        notificationsCache = null;
        throw error;
      });

    notificationsCache = { promise, updatedAt: now };
    return promise;
  },

  prefetch: async () => {
    return notificationsAPI.getAll();
  },

  markRead: async (id) => {
    const response = await fetch(`${API_URL}/notifications/${id}/read`, {
      method: 'PATCH',
      headers: authHeader()
    });
    if (!response.ok) throw new Error('Failed to mark notification as read');
    const data = await response.json();
    clearNotificationsCache();
    return data;
  },

  markAllRead: async () => {
    const response = await fetch(`${API_URL}/notifications/read-all`, {
      method: 'PATCH',
      headers: authHeader()
    });
    if (!response.ok) throw new Error('Failed to mark notifications as read');
    const data = await response.json();
    clearNotificationsCache();
    return data;
  }
};