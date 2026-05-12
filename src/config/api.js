// API Configuration
export const API_URL = 'http://localhost:5001';


export const requestsAPI = {
  // Get all requests
  getAll: async () => {
    const response = await fetch(`${API_URL}/requests`);
    if (!response.ok) throw new Error('Failed to fetch requests');
    return response.json();
  },

  // Create request
  create: async (requestData) => {
    const response = await fetch(`${API_URL}/requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData)
    });
    if (!response.ok) throw new Error('Failed to create request');
    return response.json();
  },

  // Delete request
  delete: async (id) => {
    const response = await fetch(`${API_URL}/requests/${id}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to delete request');
    return response.json();
  }
  
};

export const ucAPI = {

  getAllRequests: async () => {

    const response = await fetch(
      `${API_URL}/uc/requests`
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
          'Content-Type': 'application/json'
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