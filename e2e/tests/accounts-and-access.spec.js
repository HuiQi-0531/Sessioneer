// User stories:
//  "As a new user I can register and log in."
//  "As an Admin I can disable an account, and that person can no longer log in."
//  "Pages are only open to the right role." (RBAC in the browser)
const { test, expect } = require('@playwright/test');
const { resetWorld, USERS } = require('../seed');
const { loginAs } = require('./helpers');

test.beforeEach(async () => { await resetWorld(); });

const fillRegister = async (page, password, confirm = password) => {
  await page.goto('/register');
  await page.locator('input[name="firstName"]').fill('Nia');
  await page.locator('input[name="lastName"]').fill('New');
  await page.locator('input[name="email"]').fill('nia.new@e2e.test');
  await page.locator('select[name="role"]').selectOption('Tutor');
  await page.locator('input[name="password"]').fill(password);
  await page.locator('input[name="confirmPassword"]').fill(confirm);
  await page.getByRole('button', { name: 'Create Account' }).click();
};

test('E2E-07 register: a short password is refused, a good one works and the user can log in', async ({ page }) => {
  await fillRegister(page, '123');
  await expect(page.locator('.error-message')).toHaveText('Password must be at least 6 characters');
  await fillRegister(page, 'abcdef', 'abcdeg');
  await expect(page.locator('.error-message')).toHaveText('Passwords do not match');
  await fillRegister(page, 'abcdef');
  await expect(page).toHaveURL(/\/login/);
  await loginAs(page, 'nia.new@e2e.test', 'abcdef');
  await expect(page).toHaveURL(/\/tutor-dashboard/);
});

test('E2E-08 a wrong password shows an error and keeps you on the login page', async ({ page }) => {
  await page.goto('/login');
  await page.locator('input[name="email"]').fill(USERS.tutor.email);
  await page.locator('input[name="password"]').fill('wrong-password');
  await page.getByRole('button', { name: 'Log In' }).click();
  await expect(page.locator('.login-error-message')).toHaveText('Invalid email or password');
  await expect(page).toHaveURL(/\/login/);
});

test('E2E-09 pages are guarded by role in the browser', async ({ page }) => {
  await page.goto('/uc-dashboard');
  await expect(page).toHaveURL(/\/login/);
  await loginAs(page, USERS.tutor.email);
  await page.goto('/uc-dashboard');
  await expect(page).toHaveURL(/\/tutor-dashboard/);
  await page.goto('/admin/users');
  await expect(page).not.toHaveURL(/\/admin\/users/);
});

test('E2E-10 an admin disables an account and that user can no longer log in', async ({ page, browser }) => {
  await loginAs(page, USERS.admin.email);
  await expect(page).toHaveURL(/\/admin-dashboard/);
  await page.goto('/admin/users');
  await page.locator('tr', { hasText: USERS.cover.email }).getByRole('button', { name: 'Modify' }).click();
  const dialog = page.getByRole('dialog', { name: 'Modify User' });
  await dialog.getByLabel('Account status').selectOption('disabled');
  await dialog.getByRole('button', { name: 'Save User' }).click();
  await expect(page.locator('tr', { hasText: USERS.cover.email })).toContainText('Disabled');

  const other = await (await browser.newContext()).newPage();
  await other.goto('/login');
  await other.locator('input[name="email"]').fill(USERS.cover.email);
  await other.locator('input[name="password"]').fill('Password123!');
  await other.getByRole('button', { name: 'Log In' }).click();
  await expect(other.locator('.login-error-message')).toContainText('disabled');
});

test('E2E-12 logging out ends the session on the server: the old token is refused and pages go back to login', async ({ page, request }) => {
  await loginAs(page, USERS.tutor.email);
  const token = await page.evaluate(() => localStorage.getItem('token'));
  expect((await request.get('http://localhost:5001/profile', { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(200);

  await page.goto('/logout');
  await page.getByRole('button', { name: 'Log Out' }).click();
  await expect(page).toHaveURL(/\/login/);
  expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull();

  // A copied token no longer works.
  expect((await request.get('http://localhost:5001/profile', { headers: { Authorization: `Bearer ${token}` } })).status()).toBe(401);

  await page.goto('/tutor-dashboard');
  await expect(page).toHaveURL(/\/login/);
});

test('E2E-13 a browser whose login was ended elsewhere is sent back to the login page', async ({ browser }) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const pageA = await first.newPage();
  const pageB = await second.newPage();

  await loginAs(pageA, USERS.tutor.email);
  await loginAs(pageB, USERS.tutor.email);

  await pageA.goto('/logout');
  await pageA.getByRole('button', { name: 'Log Out' }).click();
  await expect(pageA).toHaveURL(/\/login/);

  // B still has its token saved, but the server now answers 401.
  await pageB.goto('/tutor-dashboard');
  await expect(pageB).toHaveURL(/\/login/);
  expect(await pageB.evaluate(() => localStorage.getItem('token'))).toBeNull();

  await first.close();
  await second.close();
});
