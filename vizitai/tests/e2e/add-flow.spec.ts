import { test, expect, type Page } from '@playwright/test';
import { openApp, seedAppts } from './helpers';

/** Types the name on the first screen and presses return (keyboard "Toliau") to reach Paslauga. */
async function nameThenEnter(page: Page, name: string) {
  await page.getByTestId('field-name').fill(name);
  await page.getByTestId('field-name').press('Enter');
}
const apptCount = (page: Page) => page.evaluate(() => (window as any).__vizitai.db.appointments.count()); // eslint-disable-line @typescript-eslint/no-explicit-any

async function expectLinkedToSeeded(page: Page) {
  await expect.poll(() => apptCount(page)).toBe(2);
  const r = await page.evaluate(async () => {
    const { db } = (window as any).__vizitai; // eslint-disable-line @typescript-eslint/no-explicit-any
    const clients = await db.clients.toArray();
    const appts = await db.appointments.toArray();
    return { clients: clients.length, ids: appts.map((a: { clientId: string }) => a.clientId), id: clients[0]?.id };
  });
  expect(r.clients).toBe(1);
  expect(r.ids).toEqual([r.id, r.id]);
}

test('booking from an empty slot takes 3 taps plus typing the name', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    (window as any).__taps = 0; // eslint-disable-line @typescript-eslint/no-explicit-any
    document.addEventListener('click', (e) => { if (e.isTrusted) (window as any).__taps++; }, true); // eslint-disable-line @typescript-eslint/no-explicit-any
  });
  await page.getByTestId('slot-2026-10-14T10:30').click();               // tap 1
  await expect(page.getByTestId('field-name')).toBeFocused();             // keyboard up without a tap
  await nameThenEnter(page, 'Žydrūnė');                                  // typing + return, no tap
  await expect(page.getByTestId('flow-who')).toHaveText('Žydrūnė');
  await page.getByTestId('svc-1').click();                               // tap 2 (Dažymas card)
  await page.getByTestId('btn-save').click();                            // tap 3
  expect(await page.evaluate(() => (window as any).__taps)).toBe(3);     // eslint-disable-line @typescript-eslint/no-explicit-any
  await expect(page.getByTestId('sheet')).toHaveCount(0);
  await expect(page.getByTestId('col-2026-10-14')).toContainText('Žydrūnė');
  await expect(page.getByTestId('col-2026-10-14')).toContainText('Dažymas');
});

test('Toliau is disabled until a name is typed, and return does nothing on an empty name', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('slot-2026-10-14T10:30').click();
  await expect(page.getByTestId('btn-next')).toBeDisabled();
  await page.getByTestId('field-name').fill('  ');
  await expect(page.getByTestId('btn-next')).toBeDisabled();
  await page.getByTestId('field-name').press('Enter');
  await expect(page.getByTestId('svc-0')).toBeHidden(); // still on the first screen
  await page.getByTestId('field-name').fill('Ona');
  await expect(page.getByTestId('btn-next')).toBeEnabled();
  await page.getByTestId('btn-next').click();
  await expect(page.getByTestId('svc-0')).toBeVisible();
});

test('Atgal returns to the client screen and keeps the name', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('slot-2026-10-14T10:30').click();
  await nameThenEnter(page, 'Ona');
  await expect(page.getByTestId('svc-0')).toBeVisible();
  await page.getByTestId('btn-back').click();
  await expect(page.getByTestId('field-name')).toBeVisible();
  await expect(page.getByTestId('field-name')).toHaveValue('Ona');
});

test('searching "zydrune" finds Žydrūnė; tapping it links that client and goes straight to the services', async ({ page }) => {
  await openApp(page);
  await seedAppts(page, [{ name: 'Žydrūnė', start: '2026-10-13T10:00', service: 2 }]);
  await page.getByTestId('slot-2026-10-14T11:00').click();
  await page.getByTestId('field-name').fill('zydrune');
  await expect(page.getByTestId('suggest-0')).toContainText('Žydrūnė');
  await page.getByTestId('suggest-0').click();
  await expect(page.getByTestId('svc-2')).toHaveClass(/on/); // last service preselected
  await page.getByTestId('btn-save').click();
  await expect(page.getByTestId('sheet')).toHaveCount(0);
  await expectLinkedToSeeded(page);
});

test('typing an existing name exactly, without tapping a suggestion, links that client', async ({ page }) => {
  await openApp(page);
  await seedAppts(page, [{ name: 'Žydrūnė', start: '2026-10-13T10:00', service: 2 }]);
  await page.getByTestId('slot-2026-10-14T11:00').click();
  await nameThenEnter(page, 'Žydrūnė');
  await page.getByTestId('btn-save').click();
  await expect(page.getByTestId('sheet')).toHaveCount(0);
  await expectLinkedToSeeded(page);
});

test('a double tap on Išsaugoti creates exactly one appointment', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('slot-2026-10-14T10:30').click();
  await nameThenEnter(page, 'Ona');
  await page.getByTestId('btn-save').dblclick();
  await expect(page.getByTestId('sheet')).toHaveCount(0);
  await expect.poll(() => apptCount(page)).toBe(1);
});

test('empty name field lists the recent clients', async ({ page }) => {
  await openApp(page);
  await seedAppts(page, [{ name: 'Ona', start: '2026-10-13T10:00' }, { name: 'Jonas', start: '2026-10-13T11:00' }]);
  await page.getByTestId('slot-2026-10-14T11:00').click();
  await expect(page.getByTestId('suggest-0')).toContainText('Jonas');
  await expect(page.getByTestId('suggest-1')).toContainText('Ona');
});

test('an overlap warns on the first Išsaugoti and saves on the second', async ({ page }) => {
  await openApp(page);
  await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await page.getByTestId('slot-2026-10-14T10:15').click();
  await nameThenEnter(page, 'Jonas');
  await page.getByTestId('time-row').click();
  await page.getByTestId('pick-time-10:00').click(); // 15-minute defaults: the same start clashes
  await page.getByTestId('btn-save-time').click();
  await expect(page.getByTestId('overlap-warning')).toHaveText('Šiuo laiku jau užregistruota: Ona – Kirpimas');
  await expect(page.getByTestId('sheet')).toBeVisible();
  await page.getByTestId('btn-save-time').click();
  await expect(page.getByTestId('sheet')).toHaveCount(0);
  await expect.poll(() => apptCount(page)).toBe(2);
});

test('Asmeninis uses a title and skips the services', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('slot-2026-10-14T12:00').click();
  await page.getByTestId('type-personal').click();
  await nameThenEnter(page, 'Pietūs');
  await expect(page.getByTestId('svc-0')).toBeHidden();
  await expect(page.getByTestId('pick-slots')).toBeVisible(); // straight to Laikas
  await page.getByTestId('btn-save-time').click();
  await expect(page.getByTestId('col-2026-10-14')).toContainText('Pietūs');
});

test('the calendar picker books another day and time', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('slot-2026-10-14T10:30').click();
  await nameThenEnter(page, 'Ona');
  await page.getByTestId('time-row').click();
  await expect(page.getByTestId('pick-month')).toHaveText('spalis 2026');
  await page.getByTestId('pick-next').click();
  await expect(page.getByTestId('pick-month')).toHaveText('lapkritis 2026');
  await page.getByTestId('pick-day-2026-11-03').click();
  await page.getByTestId('pick-time-14:30').click();
  await page.getByTestId('btn-back').click();
  await expect(page.getByTestId('time-value')).toHaveText('lapkričio 3 d., an · 14:30');
  await page.getByTestId('btn-save').click();
  await expect(page.getByTestId('sheet')).toHaveCount(0);
  await expect.poll(() => page.evaluate(async () => (await (window as any).__vizitai.db.appointments.toArray()).map((a: { start: string }) => a.start))).toEqual(['2026-11-03T14:30']); // eslint-disable-line @typescript-eslint/no-explicit-any
});

test('Atšaukti closes the booking without saving', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('slot-2026-10-14T10:30').click();
  await page.getByTestId('field-name').fill('Ona');
  await page.getByTestId('btn-dismiss').click();
  await expect(page.getByTestId('sheet')).toHaveCount(0);
  expect(await apptCount(page)).toBe(0);
});

test('"+" proposes the next free slot today and dayStart on other days', async ({ page }) => {
  await openApp(page, '2026-10-14T09:05:00');
  await page.getByTestId('btn-add').click();
  await expect.poll(() => page.evaluate(() => (window as any).__vizitai.ui.get().sheet?.start)).toBe('2026-10-14T09:15'); // eslint-disable-line @typescript-eslint/no-explicit-any
  await expect(page.getByTestId('field-name')).toBeFocused();
  await page.getByTestId('btn-dismiss').click();
  await expect(page.getByTestId('sheet')).toHaveCount(0);
  await page.getByTestId('chip-2026-10-15').click();
  await page.getByTestId('btn-add').click();
  await expect.poll(() => page.evaluate(() => (window as any).__vizitai.ui.get().sheet?.start)).toBe('2026-10-15T08:00'); // eslint-disable-line @typescript-eslint/no-explicit-any
});
