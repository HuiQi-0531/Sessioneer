// Shared steps for the E2E stories.
const { expect } = require('@playwright/test');
const { PASSWORD } = require('../seed');

const API = 'http://localhost:5001';

// Log in through the real login form.
const loginAs = async (page, email, password = PASSWORD) => {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: 'Log In' }).click();
  await expect(page).not.toHaveURL(/\/login$/);
};

// Call the backend directly (for set-up or checks the UI does not show).
const apiAs = async (request, email, password = PASSWORD) => {
  const res = await request.post(`${API}/auth/login`, { data: { email, password } });
  const { token } = await res.json();
  const headers = { Authorization: `Bearer ${token}` };
  return {
    get: async (url) => (await request.get(`${API}${url}`, { headers })).json(),
    post: async (url, data) => request.post(`${API}${url}`, { headers, data }),
    patch: async (url, data) => request.patch(`${API}${url}`, { headers, data })
  };
};

module.exports = { API, loginAs, apiAs };
