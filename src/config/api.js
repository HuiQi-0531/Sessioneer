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
  }
};

export const sessionsAPI = {
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
