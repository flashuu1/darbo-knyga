import { test, expect, type Page } from '@playwright/test';
import { apptState, openApp, seedAppts, openSettings } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */
const count = (page: Page, table: 'clients' | 'appointments' | 'services') => page.evaluate((t) => (window as any).__vizitai.db[t].count(), table);

async function swipeLeft(page: Page, testId: string, dx = 130) {
  await page.getByTestId(testId).scrollIntoViewIfNeeded();
  const b = (await page.getByTestId(testId).boundingBox())!;
  const y = b.y + b.height / 2, x = b.x + b.width - 40;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) { await page.mouse.move(x - (dx * i) / 6, y); await page.waitForTimeout(25); }
  await page.mouse.up();
}

test('swiping a client to the left reveals a trash button; deleting asks first and takes the visits along', async ({ page }) => {
  await openApp(page);
  await seedAppts(page, [{ name: 'Ona', start: '2026-10-20T10:00' }, { name: 'Ona', start: '2026-10-21T10:00' }, { name: 'Rasa', start: '2026-10-22T10:00' }]);
  await page.getByTestId('tab-clients').click();
  await expect(page.getByTestId('client-row-1')).toBeVisible();
  const before = (await page.getByTestId('client-swipe-0-trash').boundingBox())!;
  expect(before.width).toBeGreaterThanOrEqual(44);
  await swipeLeft(page, 'client-swipe-0');
  await expect.poll(async () => (await page.getByTestId('client-swipe-0').locator('.swipe-content').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41))).toBeLessThan(-60);
  await page.getByTestId('client-swipe-0-trash').click();
  await expect(page.getByTestId('action-title')).toContainText('Ištrinti klientą');
  await expect(page.getByTestId('action-item-0')).toHaveText('Ištrinti');
  expect(await count(page, 'clients')).toBe(2); // nothing is deleted before the confirmation
  await page.getByTestId('action-item-0').click();
  await expect.poll(() => count(page, 'clients')).toBe(1);
  await expect.poll(() => count(page, 'appointments')).toBe(1); // only Rasa's visit is left
  await expect(page.getByTestId('toast')).toContainText('Klientas ištrintas');
  await page.getByTestId('toast-undo').click();
  await expect.poll(() => count(page, 'clients')).toBe(2);
  await expect.poll(() => count(page, 'appointments')).toBe(3);
});

test('"Palikti" keeps the client; a tap on an open row only closes it; a short swipe springs back', async ({ page }) => {
  await openApp(page);
  await seedAppts(page, [{ name: 'Ona', start: '2026-10-20T10:00' }]);
  await page.getByTestId('tab-clients').click();
  await swipeLeft(page, 'client-swipe-0');
  await page.getByTestId('client-swipe-0-trash').click();
  await page.getByTestId('action-item-1').click(); // Palikti
  expect(await count(page, 'clients')).toBe(1);
  await expect(page.getByTestId('client-card')).toHaveCount(0);
  await page.getByTestId('client-row-0').click(); // the row was closed by the trash tap: a tap opens the card
  await expect(page.getByTestId('client-card')).toBeVisible();
  await page.getByTestId('card-back').click();
  await swipeLeft(page, 'client-swipe-0', 25); // far too short
  await page.waitForTimeout(400);
  expect(await page.getByTestId('client-swipe-0').locator('.swipe-content').evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41)).toBeGreaterThan(-5);
});

test('a swipe never opens the client card', async ({ page }) => {
  await openApp(page);
  await seedAppts(page, [{ name: 'Ona', start: '2026-10-20T10:00' }]);
  await page.getByTestId('tab-clients').click();
  await swipeLeft(page, 'client-swipe-0');
  await page.waitForTimeout(200);
  await expect(page.getByTestId('client-card')).toHaveCount(0);
});

test('a service can be deleted by swiping; one that has visits is hidden instead; the last one cannot go', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-20T10:00', service: 0 }]);
  await openSettings(page, 'services');
  await page.getByTestId('svc-add').click();
  await expect(page.getByTestId('svc-row-7')).toBeVisible();
  expect(await count(page, 'services')).toBe(8);
  await swipeLeft(page, 'svc-swipe-7');
  await page.getByTestId('svc-swipe-7-trash').click();
  await expect(page.getByTestId('action-title')).toContainText('Ištrinti paslaugą');
  await page.getByTestId('action-item-0').click();
  await expect.poll(() => count(page, 'services')).toBe(7);
  await expect(page.getByTestId('toast')).toContainText('Paslauga ištrinta');
  // the first service has a visit: it is only hidden, so the visit keeps its label
  await swipeLeft(page, 'svc-swipe-0');
  await page.getByTestId('svc-swipe-0-trash').click();
  await page.getByTestId('action-item-0').click();
  await expect(page.getByTestId('toast')).toContainText('tik paslėpta');
  expect(await count(page, 'services')).toBe(7);
  expect((await apptState(page, id)).serviceId).not.toBeNull();
});

test('the last active service cannot be deleted', async ({ page }) => {
  await openApp(page);
  await page.evaluate(async () => {
    const { repo } = (window as any).__vizitai;
    const all = await repo.listServices();
    for (const s of all.slice(1)) await repo.deleteService(s.id);
  });
  await openSettings(page, 'services');
  await expect(page.getByTestId('svc-row-0')).toBeVisible();
  await swipeLeft(page, 'svc-swipe-0');
  await page.getByTestId('svc-swipe-0-trash').click();
  await page.getByTestId('action-item-0').click();
  await expect(page.getByTestId('toast')).toContainText('Turi likti bent viena paslauga');
  expect(await count(page, 'services')).toBe(1);
});

test('cancelled visits are listed at the bottom of Klientai, and can be renewed, replaced or deleted from there', async ({ page }) => {
  await openApp(page);
  const [a, b, c] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-20T10:00' }, { name: 'Rasa', start: '2026-10-21T10:00' }, { name: 'Jonas', start: '2026-10-22T10:00' }]);
  await page.evaluate(async ([x, y]) => { const { repo } = (window as any).__vizitai; await repo.cancelAppointment(x, null); await repo.cancelAppointment(y, null); }, [a, b]);
  await page.getByTestId('tab-clients').click();
  await expect(page.getByTestId('cancelled-head')).toHaveText('Atšaukti vizitai');
  await expect(page.getByTestId('cancelled-row-1')).toBeVisible();
  // the list of clients comes first, the cancelled section after it
  const last = (await page.getByTestId('client-row-2').boundingBox())!, head = (await page.getByTestId('cancelled-head').boundingBox())!;
  expect(head.y).toBeGreaterThan(last.y);
  await page.getByTestId('cancelled-row-0').click();
  await expect(page.getByTestId('action-item-0')).toHaveText('Atnaujinti vizitą');
  await expect(page.getByTestId('action-item-1')).toHaveText('Pakeisti nauju vizitu');
  await expect(page.getByTestId('action-item-2')).toHaveText('Ištrinti visam laikui');
  await page.getByTestId('action-item-0').click(); // newest cancellation first (Rasa): renewed
  await expect.poll(async () => (await apptState(page, b)).status).toBe('booked');
  await expect(page.getByTestId('cancelled-row-1')).toHaveCount(0);
  await page.getByTestId('cancelled-row-0').click(); // Ona
  await page.getByTestId('action-item-2').click(); // delete for good
  await expect.poll(() => count(page, 'appointments')).toBe(2);
  await expect(page.getByTestId('cancelled-head')).toHaveCount(0);
  void c;
});
