import { test, expect } from '@playwright/test';
import { apptState, openApp, pickTime } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */
const all = (page: any) => page.evaluate(async () => (window as any).__vizitai.db.appointments.toArray());

test('Vestuvės is a fourth kind of entry: a name, a length in hours, a time; it is long, pink and labelled', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('slot-2026-10-14T10:00').click();
  await expect(page.getByTestId('type-wedding')).toHaveText('Vestuvės');
  await page.getByTestId('type-wedding').click();
  await page.getByTestId('field-name').fill('Gintarė');
  await page.getByTestId('btn-next').click();
  await expect(page.getByTestId('wedding-value')).toHaveText('3 val.'); // a wedding takes hours: 3 h to start from
  await expect(page.getByTestId('svc-0')).toHaveCount(0); // no service cards
  await page.getByTestId('wedding-plus').click();
  await expect(page.getByTestId('wedding-value')).toHaveText('3 val. 30 min.');
  await page.getByTestId('wedding-chip-4').click();
  await expect(page.getByTestId('wedding-value')).toHaveText('4 val.');
  await page.getByTestId('btn-save').click();
  await expect(page.getByTestId('sheet')).toHaveCount(0);
  const [a] = await all(page);
  expect(a).toMatchObject({ kind: 'client', wedding: true, durationMinutes: 240, serviceId: null, start: '2026-10-14T10:00' });
  const e = page.getByTestId(`entry-${a.id}`);
  await expect(e).toContainText('Gintarė');
  await expect(e).toContainText('Vestuvės');
  // four hours tall: 16 quarter-hour rows
  const slot = (await page.getByTestId('slot-2026-10-14T10:00').boundingBox())!, box = (await e.boundingBox())!;
  expect(Math.round(box.height / slot.height)).toBe(16);
});

test('a wedding blocks its whole length: booking inside it warns', async ({ page }) => {
  await openApp(page);
  await page.evaluate(async () => (window as any).__vizitai.repo.createAppointment({ kind: 'client', name: 'Gintarė', wedding: true, minutes: 240, start: '2026-10-14T10:00' }));
  await page.getByTestId('slot-2026-10-14T15:00').click();
  await page.getByTestId('field-name').fill('Ona');
  await page.getByTestId('btn-next').click();
  await page.getByTestId('time-row').click();
  await page.waitForTimeout(450);
  await pickTime(page, '13:00'); // inside the wedding (10:00 to 14:00)
  await page.getByTestId('btn-save-time').click();
  await expect(page.getByTestId('overlap-warning')).toContainText('Gintarė – Vestuvės');
});

test('the sheet of a wedding shows its length and lets her change it', async ({ page }) => {
  await openApp(page);
  const id = await page.evaluate(async () => (await (window as any).__vizitai.repo.createAppointment({ kind: 'client', name: 'Gintarė', wedding: true, minutes: 180, start: '2026-10-16T10:00' })).id);
  await page.getByTestId('chip-2026-10-16').click();
  await page.getByTestId(`entry-${id}`).click();
  await expect(page.getByTestId('appt-when')).toContainText('Vestuvės · 3 val.');
  await expect(page.getByTestId('appt-svc-0')).toHaveCount(0); // no service chips
  await page.getByTestId('appt-length-plus').click();
  await expect(page.getByTestId('appt-length-value')).toHaveText('3 val. 30 min.');
  await expect.poll(async () => (await apptState(page, id)).durationMinutes).toBe(210);
  await page.getByTestId('appt-length-minus').click();
  await page.getByTestId('appt-length-minus').click();
  await expect.poll(async () => (await apptState(page, id)).durationMinutes).toBe(150);
});

test('once the wedding is done (its amount is in) flowers drift up from it, and until then there are none', async ({ page }) => {
  await openApp(page, '2026-10-14T18:00:00');
  const id = await page.evaluate(async () => (await (window as any).__vizitai.repo.createAppointment({ kind: 'client', name: 'Gintarė', wedding: true, minutes: 240, start: '2026-10-14T09:00' })).id);
  await expect(page.getByTestId(`due-${id}`)).toBeVisible(); // waiting for the money: orange, no flowers yet
  await expect(page.getByTestId(`bloom-${id}`)).toHaveCount(0);
  await page.evaluate(async (x) => (window as any).__vizitai.repo.setAmount(x, 90000), id);
  await expect(page.getByTestId(`bloom-${id}`)).toBeAttached();
  const petals = await page.getByTestId(`bloom-${id}`).locator('i').count();
  expect(petals).toBe(5);
  const anim = await page.getByTestId(`bloom-${id}`).locator('i').first().evaluate((el) => getComputedStyle(el).animationName);
  expect(anim).toBe('bloom-up');
  await expect(page.getByTestId(`amount-${id}`)).toContainText('🌸');
  // an ordinary visit never gets flowers
  const other = await page.evaluate(async () => { const { repo } = (window as any).__vizitai; const s = await repo.listServices(true); const a = await repo.createAppointment({ kind: 'client', name: 'Ona', serviceId: s[0].id, start: '2026-10-14T16:00' }); await repo.setAmount(a.id, 3000); return a.id; });
  await expect(page.getByTestId(`amount-${other}`)).toBeVisible();
  await expect(page.getByTestId(`bloom-${other}`)).toHaveCount(0);
});

test('a flower burst follows the amount of a wedding, and Užregistruoti į priekį keeps the length', async ({ page }) => {
  await openApp(page, '2026-10-14T18:00:00');
  const id = await page.evaluate(async () => (await (window as any).__vizitai.repo.createAppointment({ kind: 'client', name: 'Gintarė', wedding: true, minutes: 300, start: '2026-10-14T09:00' })).id);
  await page.getByTestId(`entry-${id}`).click();
  await page.getByTestId('amount-input').fill('900');
  await page.getByTestId('amount-confirm').click();
  await expect(page.getByTestId('burst').locator('i.petal').first()).toBeAttached();
  await expect(page.getByTestId('burst').locator('i.petal').first()).toContainText(/🌸|🌷/);
  await page.getByTestId('again-yes').click();
  await expect(page.getByTestId('timewheel')).toBeVisible();
  await page.getByTestId('btn-save-time').click();
  await expect.poll(async () => (await all(page)).length).toBe(2);
  const next = (await all(page)).find((x: any) => x.id !== id);
  expect(next).toMatchObject({ wedding: true, durationMinutes: 300 });
});
