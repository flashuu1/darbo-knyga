import { test, expect, type Page } from '@playwright/test';
import { apptState, openApp, seedAppts } from './helpers';

// WebKit's fill() fires only `input`; a real picker also fires `change` when the value is committed.
async function pickMove(page: Page, value: string) {
  const input = page.getByTestId('move-input');
  await input.fill(value);
  await input.dispatchEvent('change');
}

test('tapping an entry opens the sheet with name, service, time and status', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await expect(page.getByTestId('appt-name')).toHaveText('Ona');
  await expect(page.getByTestId('appt-status')).toHaveText('Užregistruota');
  await expect(page.getByTestId('sheet')).toContainText('spalio 14 d., tr · 10:00');
  await expect(page.getByTestId('act-noshow')).toHaveCount(0); // start time has not passed
});

test('tapping a service chip changes the service immediately', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  const before = (await apptState(page, id)).serviceId;
  await page.getByTestId('appt-svc-1').click();
  await expect.poll(async () => (await apptState(page, id)).serviceId).not.toBe(before);
});

test('cancelling with a reason takes two taps; the slot frees up; Anuliuoti restores it', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await page.getByTestId('act-cancel').click();
  await expect(page.getByTestId('action-title')).toHaveText('Atšaukti vizitą?');
  await expect(page.getByTestId('action-item-0')).toHaveText('Kliento prašymu');
  await page.getByTestId('action-item-1').click(); // Liga
  await expect(page.getByTestId('toast')).toContainText('Vizitas atšauktas');
  await expect.poll(() => apptState(page, id)).toMatchObject({ status: 'cancelled', cancelReason: 'ill' });
  // slot is free: the thin line does not block the tap
  await page.getByTestId('slot-2026-10-14T10:00').click();
  await expect(page.getByTestId('sheet')).toBeVisible();
  await page.getByTestId('btn-dismiss').click();
  await page.getByTestId('toast-undo').click();
  await expect.poll(() => apptState(page, id)).toMatchObject({ status: 'booked', cancelReason: null });
});

test('cancelling without a reason works', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await page.getByTestId('act-cancel').click();
  await page.getByTestId('action-item-3').click(); // Be priežasties
  await expect.poll(() => apptState(page, id)).toMatchObject({ status: 'cancelled', cancelReason: null });
});

test('"Palikti" keeps the appointment', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await page.getByTestId('act-cancel').click();
  await page.getByTestId('action-item-4').click();
  await expect(page.getByTestId('action-title')).toHaveCount(0);
  expect((await apptState(page, id)).status).toBe('booked');
});

test('Neatvyko appears only after the start time, and Atkurti vizitą brings it back', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T08:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await page.getByTestId('act-noshow').click();
  await expect.poll(async () => (await apptState(page, id)).status).toBe('noshow');
  await page.getByTestId(`entry-${id}`).click();
  await expect(page.getByTestId('act-noshow')).toHaveCount(0);
  await page.getByTestId('act-restore').click();
  await expect.poll(async () => (await apptState(page, id)).status).toBe('booked');
});

test('Perkelti moves the appointment, shows the toast and Anuliuoti undoes it', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await page.getByTestId('act-move').click();
  await pickMove(page, '2026-10-15T14:00');
  await expect(page.getByTestId('toast')).toContainText('Perkelta: spalio 15 d., kt · 14:00');
  expect((await apptState(page, id)).start).toBe('2026-10-15T14:00');
  await page.getByTestId('toast-undo').click();
  await expect.poll(async () => (await apptState(page, id)).start).toBe('2026-10-14T10:00');
});

test('moving onto another booking adds the overlap warning to the toast', async ({ page }) => {
  await openApp(page);
  const [a] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }, { name: 'Jonas', start: '2026-10-14T14:00' }]);
  await page.getByTestId(`entry-${a}`).click();
  await page.getByTestId('act-move').click();
  await pickMove(page, '2026-10-14T14:15');
  await expect(page.getByTestId('toast')).toContainText('Šiuo laiku jau užregistruota: Jonas – Kirpimas');
});

test('the toast disappears after 5 seconds', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await page.getByTestId('act-cancel').click();
  await page.getByTestId('action-item-3').click();
  await expect(page.getByTestId('toast')).toBeVisible();
  await page.clock.fastForward(5200);
  await expect(page.getByTestId('toast')).toHaveCount(0);
});
