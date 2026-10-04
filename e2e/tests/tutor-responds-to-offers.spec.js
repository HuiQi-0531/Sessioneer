// User story: "As a Tutor, I want to accept or decline the sessions my Unit
// Coordinator offered me, so that the coordinator knows who will teach."
// AC1 the tutor logs in and lands on the tutor dashboard
// AC2 both offered sessions show "Awaiting response" on My Schedule
// AC3 Confirm changes the status to "Confirmed"
// AC4 Decline needs a reason; with one, the session shows "Declined" and the reason
// AC5 the coordinator's timetable shows the result
const { test, expect } = require('@playwright/test');
const { resetWorld, USERS } = require('../seed');
const { loginAs, apiAs } = require('./helpers');

let world;
test.beforeEach(async () => { world = await resetWorld(); });

test('E2E-01 a tutor confirms one offered session and declines the other', async ({ page, request }) => {
  await loginAs(page, USERS.tutor.email);
  await expect(page).toHaveURL(/\/tutor-dashboard/);

  await page.goto(`/tutor-schedule/${world.unitId}`);
  const row = (code) => page.locator('tr', { hasText: code });
  await expect(row('TUT01')).toContainText('Awaiting response');
  await expect(row('TUT02')).toContainText('Awaiting response');

  await row('TUT01').getByRole('button', { name: 'Confirm' }).click();
  await expect(row('TUT01')).toContainText('Confirmed');

  await row('TUT02').getByRole('button', { name: 'Decline' }).click();
  const modal = page.locator('.ts-modal-content');
  await modal.getByRole('button', { name: 'Decline' }).click();
  await expect(modal).toContainText('Please provide a reason');
  await modal.locator('textarea').fill('I have a lab at that time');
  await modal.getByRole('button', { name: 'Decline' }).click();
  await expect(row('TUT02')).toContainText('Declined');
  await expect(row('TUT02')).toContainText('I have a lab at that time');
  await expect(page.getByRole('button', { name: 'Confirm' })).toHaveCount(0);

  const uc = await apiAs(request, USERS.uc.email);
  const timetable = await uc.get(`/units/${world.unitId}/sessions`);
  const tut01 = timetable.find(s => s.sessionCode === 'TUT01');
  const tut02 = timetable.find(s => s.sessionCode === 'TUT02');
  expect(tut01.tutors.map(t => [t.tutorName, t.confirmed])).toEqual([['Tia Tutor', true]]);
  expect(tut02.isAssigned).toBe(false);
  expect(tut02.declinedTutors[0].rejectReason).toBe('I have a lab at that time');
});
