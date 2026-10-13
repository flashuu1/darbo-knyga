import { test, expect, type Page } from '@playwright/test';
import { apptState, openApp, seedAppts } from './helpers';

// WebKit's fill() fires only `input`. The iOS picker fires `change` as soon as a day is tapped (time not
// yet set), and `blur` when it closes: a change alone must not move anything; the blur saves.
async function pickMove(page: Page, id: string, value: string) {
  const before = (await apptState(page, id)).start;
  const input = page.getByTestId('move-input');
  await input.fill(value);
  await input.dispatchEvent('change');
  await page.waitForTimeout(200);
  await expect(page.getByTestId('sheet')).toBeVisible();
  expect((await apptState(page, id)).start).toBe(before);
  await input.dispatchEvent('blur');
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
  await page.getByTestId('toast-undo').click();
  await expect.poll(() => apptState(page, id)).toMatchObject({ status: 'booked', cancelReason: null });
  // cancelled again: the slot is free, the thin line does not block the tap
  await page.getByTestId(`entry-${id}`).click();
  await page.getByTestId('act-cancel').click();
  await page.getByTestId('action-item-3').click();
  await expect.poll(async () => (await apptState(page, id)).status).toBe('cancelled');
  await page.getByTestId('slot-2026-10-14T10:00').click();
  await expect(page.getByTestId('sheet')).toBeVisible();
});

test('opening another sheet hides the undo toast, so a tap there cannot undo the last action', async ({ page }) => {
  await openApp(page);
  const [a, b] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }, { name: 'Jonas', start: '2026-10-14T11:00' }]);
  await page.getByTestId(`entry-${a}`).click();
  await page.getByTestId('act-cancel').click();
  await page.getByTestId('action-item-3').click();
  await expect(page.getByTestId('toast-undo')).toBeVisible();
  await expect.poll(async () => (await apptState(page, a)).status).toBe('cancelled');
  await page.waitForTimeout(350); // the toast has finished rising into place
  const undo = (await page.getByTestId('toast-undo').boundingBox())!;
  await page.getByTestId(`entry-${b}`).click({ timeout: 2000 }); // well above the toast
  await expect(page.getByTestId('sheet')).toBeVisible();
  // short timeouts: the toast's own 5 s timer must not be what makes these pass
  await expect(page.getByTestId('toast')).toHaveCount(0, { timeout: 1000 });
  await page.mouse.click(undo.x + undo.width / 2, undo.y + undo.height / 2); // where Anuliuoti was
  await page.waitForTimeout(300);
  expect((await apptState(page, a)).status).toBe('cancelled');
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
  await pickMove(page, id, '2026-10-15T14:00');
  await expect(page.getByTestId('sheet')).toHaveCount(0);
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
  await pickMove(page, a, '2026-10-14T14:15');
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

test('Perkelti: the picker lies over the row, and closing the sheet with a picked time still moves it', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  // measured in one frame: the sheet is still rising
  const geo = await page.getByTestId('act-move').evaluate((row) => {
    const r = row.getBoundingClientRect(), i = row.querySelector('input')!.getBoundingClientRect();
    return { dx: Math.abs(i.left - r.left), dy: Math.abs(i.top - r.top), dw: Math.abs(i.width - r.width), dh: Math.abs(i.height - r.height), h: r.height, opacity: getComputedStyle(row.querySelector('input')!).opacity };
  });
  expect(geo).toEqual({ dx: 0, dy: 0, dw: 0, dh: 0, h: geo.h, opacity: '0' });
  expect(geo.h).toBeGreaterThanOrEqual(44);
  await page.getByTestId('move-input').fill('2026-10-16T12:07');
  await page.getByTestId('move-input').dispatchEvent('change');
  await page.getByTestId('btn-close').click();
  await expect(page.getByTestId('sheet')).toHaveCount(0);
  await expect.poll(async () => (await apptState(page, id)).start).toBe('2026-10-16T12:00'); // snapped to 15 min
  await expect(page.getByTestId('toast')).toContainText('Perkelta: spalio 16 d., pn · 12:00');
});
