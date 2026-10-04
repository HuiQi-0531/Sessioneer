// User stories:
//  "As a Tutor, I want to mark when I can teach so the coordinator can plan."
//  "As a Tutor, I want to ask to swap a session, and as a Coordinator I want
//   to approve it so the timetable updates."
const { test, expect } = require('@playwright/test');
const { resetWorld, sql, USERS } = require('../seed');
const { loginAs, apiAs } = require('./helpers');

let world;
test.beforeEach(async () => { world = await resetWorld(); });

test('E2E-05 a tutor submits availability and the coordinator sees it', async ({ page, request }) => {
  await loginAs(page, USERS.cover.email);
  await page.goto('/availability');
  await page.getByRole('button', { name: 'Preferred', exact: true }).click();
  await page.locator('tr', { hasText: '9:00am' }).getByRole('button').nth(1).click(); // Monday 9am
  await page.getByRole('button', { name: 'Avoid', exact: true }).click();
  await page.locator('tr', { hasText: '1:00pm' }).getByRole('button').nth(2).click(); // Tuesday 1pm
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  await expect(page.getByText(/Availability saved/)).toBeVisible();

  const uc = await apiAs(request, USERS.uc.email);
  const grid = await uc.get(`/availability?unitId=${world.unitId}`);
  expect(grid.submissionStatus.find(s => s.tutorId === world.ids.cover).submitted).toBe(true);
  expect(grid.availability.MON[world.ids.cover]['9:00am']).toBe('preferred');
  expect(grid.availability.TUE[world.ids.cover]['1:00pm']).toBe('avoid');

  // Assign Staff now ranks Cal using it.
  const cands = await uc.get(`/units/${world.unitId}/sessions/${world.sessions.tut02}/candidates`);
  expect(cands.candidates.find(c => c.id === world.ids.cover).warnings).toContain('Marked "avoid" for this time');
});

test('E2E-06 a tutor asks to swap, the coordinator approves, the schedule moves', async ({ page, browser }) => {
  await loginAs(page, USERS.tutor.email);
  await page.goto('/requests');
  await page.getByRole('button', { name: '+ Request' }).click();
  const selects = page.locator('select');
  await selects.nth(2).selectOption({ label: 'E2E101' });
  // Current session: the Tuesday one (TUT02). Preferred: the free Wednesday one (TUT03).
  const tueOption = await selects.nth(3).locator('option', { hasText: 'TUE' }).first().textContent();
  await selects.nth(3).selectOption({ label: tueOption });
  const wedOption = await selects.nth(4).locator('option', { hasText: 'WED' }).first().textContent();
  await selects.nth(4).selectOption({ label: wedOption });
  await page.getByPlaceholder(/detailed reason/).fill('Clashes with my lab');
  await page.getByRole('button', { name: 'Submit Request' }).click();
  await expect(page.getByText('Clashes with my lab')).toBeVisible();

  const ucContext = await browser.newContext();
  const uc = await ucContext.newPage();
  await loginAs(uc, USERS.uc.email);
  await uc.goto('/uc-requests');
  await expect(uc.getByText('Clashes with my lab')).toBeVisible();
  await uc.getByRole('button', { name: 'Approve' }).click();
  await uc.getByRole('button', { name: 'Done' }).click();
  await expect(uc.getByText('No confirmed requests yet')).toHaveCount(0);
  await ucContext.close();

  await page.goto(`/tutor-schedule/${world.unitId}`);
  await expect(page.locator('tr', { hasText: 'TUT03' })).toBeVisible();
  await expect(page.locator('tr', { hasText: 'TUT02' })).toHaveCount(0);
  await expect(page.locator('tr', { hasText: 'TUT01' })).toBeVisible(); // untouched
  const rows = await sql('SELECT session_id FROM session_tutors WHERE tutor_id = $1 ORDER BY session_id', [world.ids.tutor]);
  expect(rows.map(r => r.session_id).sort()).toEqual([world.sessions.tut01, world.sessions.tut03].sort());
});
