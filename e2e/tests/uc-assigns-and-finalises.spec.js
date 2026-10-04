// User story: "As a Unit Coordinator, I want to assign staff to sessions and
// finalise the timetable once everyone has accepted, so the semester's
// teaching is fixed."
// AC1 Assign Staff lists the unit's staff, ranked, with reasons
// AC2 a tutor who would be double-booked cannot be picked
// AC3 after assigning, the session moves to "Assigned" and the tutor sees the offer
// AC4 finalising is only offered once everything is confirmed; after it, tutors cannot change answers
const { test, expect } = require('@playwright/test');
const { resetWorld, sql, USERS } = require('../seed');
const { loginAs, apiAs } = require('./helpers');

let world;
test.beforeEach(async () => { world = await resetWorld(); });

test('E2E-02 a coordinator assigns a tutor in Schedule Builder and the tutor accepts', async ({ page, browser }) => {
  // A Monday 09:30 session that clashes with Tia's Monday 09:00 offer.
  await sql(`INSERT INTO sessions (unit_id, session_code, day, start_time, end_time, location, campus, session_type, capacity, required_tutors, status)
             VALUES ($1, 'TUT09', 'MON', '09:30', '10:30', 'GP-P-109', 'GP', 'Tutorial', 30, 1, 'Confirmed')`, [world.unitId]);

  await loginAs(page, USERS.uc.email);
  await page.goto(`/schedule-builder/${world.unitId}`);

  // AC2: Tia is shown but cannot be picked for the clashing session.
  await page.locator('tr', { hasText: 'TUT09' }).getByRole('button', { name: 'Assign Staff' }).click();
  const tia = page.locator('.sb-candidate-row', { hasText: 'Tia Tutor' });
  await expect(tia).toContainText('overlapping session in E2E101');
  await expect(tia.getByRole('button', { name: 'Assign' })).toBeDisabled();
  await page.getByRole('button', { name: '×' }).first().click();

  // AC1 + AC3: assign Cal to TUT03.
  await page.locator('tr', { hasText: 'TUT03' }).getByRole('button', { name: 'Assign Staff' }).click();
  await expect(page.getByRole('heading', { name: 'Assign teaching staff' })).toBeVisible();
  await page.locator('.sb-candidate-row', { hasText: 'Cal Cover' }).getByRole('button', { name: 'Assign' }).click();
  await expect(page.locator('tr', { hasText: 'TUT03' })).toContainText('Cal Cover');

  // The tutor sees and accepts the offer in their own browser.
  const calContext = await browser.newContext();
  const cal = await calContext.newPage();
  await loginAs(cal, USERS.cover.email);
  await cal.goto(`/tutor-schedule/${world.unitId}`);
  const row = cal.locator('tr', { hasText: 'TUT03' });
  await expect(row).toContainText('Awaiting response');
  await row.getByRole('button', { name: 'Confirm' }).click();
  await expect(row).toContainText('Confirmed');
  await calContext.close();
});

test('E2E-03 the timetable can be finalised, after which tutors cannot change their answers', async ({ page, request }) => {
  // Everything staffed and accepted except one offer Tia has not answered.
  await sql(`DELETE FROM sessions WHERE unit_id = $1 AND session_code = 'TUT03'`, [world.unitId]);
  await sql(`UPDATE session_tutors SET tutor_confirmed = TRUE WHERE session_id = $1`, [world.sessions.tut01]);

  const uc = await apiAs(request, USERS.uc.email);
  const notReady = await uc.patch(`/units/${world.unitId}/lock-schedule`, {});
  expect(notReady.status()).toBe(409);
  expect((await notReady.json()).pendingCount).toBe(1);

  // Tia accepts the last one in the browser...
  await loginAs(page, USERS.tutor.email);
  await page.goto(`/tutor-schedule/${world.unitId}`);
  await page.locator('tr', { hasText: 'TUT02' }).getByRole('button', { name: 'Confirm' }).click();
  await expect(page.locator('tr', { hasText: 'TUT02' })).toContainText('Confirmed');

  // ...so the coordinator can finalise.
  expect((await uc.patch(`/units/${world.unitId}/lock-schedule`, {})).status()).toBe(200);

  // A tutor can no longer decline after finalising.
  const tia = await apiAs(request, USERS.tutor.email);
  const late = await tia.patch(`/units/${world.unitId}/sessions/${world.sessions.tut02}/confirm`, { confirmed: false, reason: 'too late' });
  expect(late.status()).toBe(409);
  await page.reload();
  await expect(page.locator('tr', { hasText: 'TUT02' })).toContainText('Confirmed');
});

// User story: "As a Unit Coordinator, I want to see in Schedule Builder who
// has not answered yet and who declined (and why), without digging through
// notifications."
test('E2E-11 Schedule Builder List View shows Awaiting / Confirmed and who declined', async ({ page, browser }) => {
  // Before anyone answers: both of Tia's offers are "Awaiting".
  await loginAs(page, USERS.uc.email);
  await page.goto(`/schedule-builder/${world.unitId}`);
  const row = (code) => page.locator('tr', { hasText: code });
  await expect(row('TUT01')).toContainText('Tia Tutor');
  await expect(row('TUT01')).toContainText('Awaiting');
  await expect(row('TUT02')).toContainText('Awaiting');

  // Tia accepts one and declines the other in her own browser.
  const tiaContext = await browser.newContext();
  const tia = await tiaContext.newPage();
  await loginAs(tia, USERS.tutor.email);
  await tia.goto(`/tutor-schedule/${world.unitId}`);
  await tia.locator('tr', { hasText: 'TUT01' }).getByRole('button', { name: 'Confirm' }).click();
  await tia.locator('tr', { hasText: 'TUT02' }).getByRole('button', { name: 'Decline' }).click();
  await tia.locator('.ts-modal-content textarea').fill('I have a lab at that time');
  await tia.locator('.ts-modal-content').getByRole('button', { name: 'Decline' }).click();
  await expect(tia.locator('tr', { hasText: 'TUT02' })).toContainText('Declined');
  await tiaContext.close();

  // The coordinator sees both answers straight in the List View.
  await page.reload();
  await expect(row('TUT01')).toContainText('Confirmed');
  await expect(row('TUT02')).toContainText('Declined by Tia Tutor: "I have a lab at that time"');
  await expect(row('TUT02').getByRole('button', { name: 'Assign Staff' })).toBeVisible();

  // And Assign Staff reminds them she declined it.
  await row('TUT02').getByRole('button', { name: 'Assign Staff' }).click();
  await expect(page.locator('.sb-candidate-row', { hasText: 'Tia Tutor' }))
    .toContainText('Declined this session: "I have a lab at that time"');
});
