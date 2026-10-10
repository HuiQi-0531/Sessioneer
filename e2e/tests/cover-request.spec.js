// User story: "As a Unit Coordinator, when a tutor cannot make a session I
// want to ask the other tutors to cover it, and see who took it."
// AC1 the coordinator picks the absent tutor, the session and the dates, and sends it
// AC2 another tutor sees it under Cover Requests and claims it
// AC3 the coordinator's Sessions page shows who is covering and when
// AC4 the claiming tutor sees it on their schedule as "Covering"
const { test, expect } = require('@playwright/test');
const { resetWorld, sql, USERS } = require('../seed');
const { loginAs } = require('./helpers');

let world;
test.beforeEach(async () => { world = await resetWorld(); });

test('E2E-04 a coordinator broadcasts a cover, another tutor claims it, everyone sees it', async ({ page, browser }) => {
  await sql('UPDATE session_tutors SET tutor_confirmed = TRUE WHERE tutor_id = $1', [world.ids.tutor]);

  // AC1
  await loginAs(page, USERS.uc.email);
  await page.goto(`/sessions/${world.unitId}`);
  await page.getByRole('button', { name: 'Request Cover' }).click();
  const modal = page.locator('.ss-cover-modal');
  await modal.locator('select').selectOption({ label: 'Tia Tutor' });
  await modal.getByLabel(/TUT01/).check();
  await modal.locator('textarea').fill('Tia is at a conference');
  const today = String(new Date().getDate());
  const dayButton = modal.locator('.ss-cal-grid button', { hasText: new RegExp(`^${today}$`) });
  await dayButton.click();
  await dayButton.click();
  await modal.getByRole('button', { name: 'Send (1)' }).click();
  await expect(page.getByText(/Broadcast sent to 1 tutor/)).toBeVisible();

  // AC2
  const calContext = await browser.newContext();
  const cal = await calContext.newPage();
  await loginAs(cal, USERS.cover.email);
  await cal.goto('/requests');
  await expect(cal.getByText('Tia is at a conference')).toBeVisible();
  await cal.getByRole('button', { name: 'Claim This Session' }).click();
  await expect(cal.getByRole('button', { name: 'Claim This Session' })).toHaveCount(0);

  // AC4
  await cal.goto(`/tutor-schedule/${world.unitId}`);
  await expect(cal.locator('tr', { hasText: 'TUT01' })).toContainText('Covering');
  await calContext.close();

  // AC3
  await page.reload();
  // The list view shows the cover as a pill: a "Cover" tag, then who is covering
  // (the full "Cover: Cal Cover (...)" text is the pill's tooltip).
  const coverPill = page.locator('tr', { hasText: 'TUT01' }).locator('.ss-cover-pill');
  await expect(coverPill).toContainText('Cover');
  await expect(coverPill).toContainText('Cal Cover');
  await expect(coverPill).toHaveAttribute('title', /^Cover: Cal Cover \(/);
  await expect(page.locator('tr', { hasText: 'TUT01' })).toContainText('Tia Tutor');
});