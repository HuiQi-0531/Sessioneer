// API Configuration
export const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

// Reads the saved token and returns the Authorization header,
// or an empty object if there is no token (e.g. not logged in).
const authHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
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
    const response = await fetch(`${API_URL}/auth/forgot-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to send reset email');
    }

    return data;
  },

  resetPassword: async (token, newPassword) => {
    const response = await fetch(`${API_URL}/auth/reset-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token, newPassword })
    });

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
    const response = await fetch(`${API_URL}/requests`, {
      headers: authHeader()
    });
    if (!response.ok) throw new Error('Failed to fetch requests');
    return response.json();
  },

  // Create request
  create: async (requestData) => {
    const response = await fetch(`${API_URL}/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify(requestData)
    });
    if (!response.ok) throw new Error('Failed to create request');
    return response.json();
  },

  // Update request
  update: async (id, data) => {
    const res = await fetch(`${API_URL}/requests/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Failed to update');
    return res.json();
  },

  // Delete request
  delete: async (id) => {
    const response = await fetch(`${API_URL}/requests/${id}`, {
      method: 'DELETE',
      headers: authHeader()
    });
    if (!response.ok) throw new Error('Failed to delete request');
    return response.json();
  }

};

export const ucAPI = {

  getAllRequests: async () => {

    const response = await fetch(
      `${API_URL}/uc/requests`,
      {
        headers: authHeader()
      }
    );

    if (!response.ok) {
      throw new Error(
        'Failed to fetch UC requests'
      );
    }

    return response.json();

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

    return response.json();

  }

};
export const availabilityAPI = {
  get: async (unitCode) => {
    const response = await fetch(`${API_URL}/availability?unitCode=${unitCode}`, {
      headers: authHeader()
    });
    if (!response.ok) throw new Error('Failed to fetch availability');
    return response.json();
  },

  submit: async (unitCode, slots) => {
    const savedUser = localStorage.getItem('currentUser');
    const currentUser = savedUser ? JSON.parse(savedUser) : null;

    const response = await fetch(`${API_URL}/availability/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({
        tutorEmail: currentUser?.email,
        unitCode,
        slots
      })
    });

    if (!response.ok) {
      throw new Error('Failed to submit availability');
    }

    return response.json();
  }
};

export const unitsAPI = {
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
  }
};

export const sessionsAPI = {
  getMyAssigned: async (unitId) => {
    const response = await fetch(`${API_URL}/units/${unitId}/sessions/my-assigned`, {
      headers: authHeader()
    });
    if (!response.ok) throw new Error('Failed to fetch your sessions');
    return response.json();
  },

  confirmSession: async (unitId, sessionId, confirmed, reason) => {
    const response = await fetch(`${API_URL}/units/${unitId}/sessions/${sessionId}/confirm`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ confirmed, reason })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to update session');
    return data;
  },

  getAll: async (unitId) => {
    const response = await fetch(`${API_URL}/units/${unitId}/sessions`, {
      headers: authHeader()
    });
    if (!response.ok) throw new Error('Failed to fetch sessions');
    return response.json();
  },

  create: async (unitId, sessionData) => {
    const response = await fetch(`${API_URL}/units/${unitId}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify(sessionData)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to create session');
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
    return data;
  },

  delete: async (unitId, sessionId) => {
    const response = await fetch(`${API_URL}/units/${unitId}/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: authHeader()
    });
    if (!response.ok) throw new Error('Failed to delete session');
    return response.json();
  },

  import: async (unitId, sessions, replace) => {
    const response = await fetch(`${API_URL}/units/${unitId}/sessions/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ sessions, replace })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to import sessions');
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
    return data;
  }
};

export const tutorsAPI = {
  getAll: async (unitId) => {
    const response = await fetch(`${API_URL}/units/${unitId}/tutors`, {
      headers: authHeader()
    });
    if (!response.ok) throw new Error('Failed to fetch tutors');
    return response.json();
  },

  updateMarker: async (unitId, tutorId, priorityTag, internalNotes, tags) => {
    const response = await fetch(`${API_URL}/units/${unitId}/tutors/${tutorId}/marker`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ priorityTag, internalNotes, tags })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to update tutor marker');
    return data;
  }
};

export const ucDashboardAPI = {
  getSummary: async () => {
    const response = await fetch(`${API_URL}/uc/dashboard-summary`, {
      headers: authHeader()
    });
    if (!response.ok) throw new Error('Failed to fetch dashboard summary');
    return response.json();
  }
};

export const tutorDashboardAPI = {
  getSummary: async () => {
    const response = await fetch(`${API_URL}/tutor/dashboard-summary`, {
      headers: authHeader()
    });
    if (!response.ok) throw new Error('Failed to fetch dashboard summary');
    return response.json();
  }
};

export const messagesAPI = {
  getGroupThread: async (unitId) => {
    const response = await fetch(`${API_URL}/messages/group/${unitId}`, {
      headers: authHeader()
    });
    if (!response.ok) throw new Error('Failed to fetch group chat');
    return response.json();
  },

  sendGroup: async (unitId, content) => {
    const response = await fetch(`${API_URL}/messages/group/${unitId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ content })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to send message');
    return data;
  },

  markGroupRead: async (unitId) => {
    const response = await fetch(`${API_URL}/messages/group/${unitId}/read`, {
      method: 'PATCH',
      headers: authHeader()
    });
    if (!response.ok) throw new Error('Failed to mark as read');
    return response.json();
  },

  getGroupUnreadCount: async (unitId) => {
    const response = await fetch(`${API_URL}/units/${unitId}/messages/group-unread-count`, {
      headers: authHeader()
    });
    if (!response.ok) throw new Error('Failed to fetch unread count');
    return response.json();
  },

  getUnitContacts: async (unitId) => {
    const response = await fetch(`${API_URL}/units/${unitId}/messages/contacts`, {
      headers: authHeader()
    });
    if (!response.ok) throw new Error('Failed to fetch contacts');
    return response.json();
  },

  getMyContacts: async () => {
    const response = await fetch(`${API_URL}/messages/my-contacts`, {
      headers: authHeader()
    });
    if (!response.ok) throw new Error('Failed to fetch contacts');
    return response.json();
  },

  getThread: async (otherUserId) => {
    const response = await fetch(`${API_URL}/messages/thread/${otherUserId}`, {
      headers: authHeader()
    });
    if (!response.ok) throw new Error('Failed to fetch messages');
    return response.json();
  },

  send: async (recipientId, content) => {
    const response = await fetch(`${API_URL}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ recipientId, content })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to send message');
    return data;
  },

  markRead: async (otherUserId) => {
    const response = await fetch(`${API_URL}/messages/thread/${otherUserId}/read`, {
      method: 'PATCH',
      headers: authHeader()
    });
    if (!response.ok) throw new Error('Failed to mark as read');
    return response.json();
  }
};

export const profileAPI = {
  get: async () => {
    const response = await fetch(`${API_URL}/profile`, {
      headers: authHeader()
    });
    if (!response.ok) throw new Error('Failed to fetch profile');
    return response.json();
  },

  update: async (data) => {
    const response = await fetch(`${API_URL}/profile`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify(data)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to update profile');
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
    return result;
  }
};

export const tutorApplicationsAPI = {
  submit: async (data) => {
    const response = await fetch(`${API_URL}/tutor-applications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to submit application');
    return result;
  },

  getAll: async () => {
    const response = await fetch(`${API_URL}/tutor-applications`, {
      headers: authHeader()
    });
    if (!response.ok) throw new Error('Failed to fetch applications');
    return response.json();
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

  invite: async (applicationId) => {
    const response = await fetch(`${API_URL}/tutor-applications/${applicationId}/invite`, {
      method: 'PATCH',
      headers: authHeader()
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to invite applicant');
    return result;
  },

  directInvite: async (name, email) => {
    const response = await fetch(`${API_URL}/tutor-applications/direct-invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ name, email })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to create invite');
    return result;
  },

  verifyInvite: async (token) => {
    const response = await fetch(`${API_URL}/tutor-applications/verify-invite/${token}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Invalid invite link');
    return result;
  },

  acceptInvite: async (token, password) => {
    const response = await fetch(`${API_URL}/tutor-applications/accept-invite`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Failed to create account');
    return result;
  }
};

export const notificationsAPI = {
  getAll: async () => {
    const response = await fetch(`${API_URL}/notifications`, {
      headers: authHeader()
    });
    if (!response.ok) throw new Error('Failed to fetch notifications');
    return response.json();
  },

  markRead: async (id) => {
    const response = await fetch(`${API_URL}/notifications/${id}/read`, {
      method: 'PATCH',
      headers: authHeader()
    });
    if (!response.ok) throw new Error('Failed to mark notification as read');
    return response.json();
  },

  markAllRead: async () => {
    const response = await fetch(`${API_URL}/notifications/read-all`, {
      method: 'PATCH',
      headers: authHeader()
    });
    if (!response.ok) throw new Error('Failed to mark notifications as read');
    return response.json();
  }
};
