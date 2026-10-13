import { test, expect, type Page } from '@playwright/test';
import { openApp, seedAppts } from './helpers';

async function expectLinkedToSeeded(page: Page) {
  await expect.poll(() => page.evaluate(() => (window as any).__vizitai.db.appointments.count())).toBe(2); // eslint-disable-line @typescript-eslint/no-explicit-any
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
  await page.getByTestId('field-name').fill('Žydrūnė');                  // typing, no tap (autofocus)
  await page.getByTestId('svc-1').click();                               // tap 2 (Dažymas)
  await page.getByTestId('btn-save').click();                            // tap 3
  expect(await page.evaluate(() => (window as any).__taps)).toBe(3);     // eslint-disable-line @typescript-eslint/no-explicit-any
  await expect(page.getByTestId('sheet')).toHaveCount(0);
  await expect(page.getByTestId('col-2026-10-14')).toContainText('Žydrūnė');
  await expect(page.getByTestId('col-2026-10-14')).toContainText('Dažymas');
});

test('Išsaugoti is disabled until a name is typed', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('slot-2026-10-14T10:30').click();
  await expect(page.getByTestId('btn-save')).toBeDisabled();
  await page.getByTestId('field-name').fill('  ');
  await expect(page.getByTestId('btn-save')).toBeDisabled();
});

test('searching "zydrune" finds Žydrūnė, and a typed existing name links that client', async ({ page }) => {
  await openApp(page);
  await seedAppts(page, [{ name: 'Žydrūnė', start: '2026-10-13T10:00', service: 2 }]);
  await page.getByTestId('slot-2026-10-14T11:00').click();
  await page.getByTestId('field-name').fill('zydrune');
  await expect(page.getByTestId('suggest-0')).toHaveText('Žydrūnė');
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
  await page.getByTestId('field-name').fill('Žydrūnė');
  await page.getByTestId('btn-save').click();
  await expect(page.getByTestId('sheet')).toHaveCount(0);
  await expectLinkedToSeeded(page);
});

test('a double tap on Išsaugoti creates exactly one appointment', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('slot-2026-10-14T10:30').click();
  await page.getByTestId('field-name').fill('Ona');
  await page.getByTestId('btn-save').dblclick();
  await expect(page.getByTestId('sheet')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as any).__vizitai.db.appointments.count())).toBe(1); // eslint-disable-line @typescript-eslint/no-explicit-any
});

test('empty name field lists the recent clients', async ({ page }) => {
  await openApp(page);
  await seedAppts(page, [{ name: 'Ona', start: '2026-10-13T10:00' }, { name: 'Jonas', start: '2026-10-13T11:00' }]);
  await page.getByTestId('slot-2026-10-14T11:00').click();
  await expect(page.getByTestId('suggest-0')).toHaveText('Jonas');
  await expect(page.getByTestId('suggest-1')).toHaveText('Ona');
});

test('an overlap warns on the first Išsaugoti and saves on the second', async ({ page }) => {
  await openApp(page);
  await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await page.getByTestId('slot-2026-10-14T09:45').click();
  await page.getByTestId('field-name').fill('Jonas');
  await page.getByTestId('btn-save').click();
  await expect(page.getByTestId('overlap-warning')).toHaveText('Šiuo laiku jau užregistruota: Ona – Kirpimas');
  await expect(page.getByTestId('sheet')).toBeVisible();
  await page.getByTestId('btn-save').click();
  await expect(page.getByTestId('sheet')).toHaveCount(0);
});

test('Asmeninis uses a title and hides the services', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('slot-2026-10-14T12:00').click();
  await page.getByTestId('type-personal').click();
  await expect(page.getByTestId('svc-0')).toHaveCount(0);
  await page.getByTestId('field-name').fill('Pietūs');
  await page.getByTestId('btn-save').click();
  await expect(page.getByTestId('col-2026-10-14')).toContainText('Pietūs');
});

test('"+" proposes the next free slot today and dayStart on other days', async ({ page }) => {
  await openApp(page, '2026-10-14T09:05:00');
  await page.getByTestId('btn-add').click();
  await expect.poll(() => page.evaluate(() => (window as any).__vizitai.ui.get().sheet?.start)).toBe('2026-10-14T09:15'); // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.getByTestId('btn-dismiss').click();
  await page.getByTestId('chip-2026-10-15').click();
  await page.getByTestId('btn-add').click();
  await expect.poll(() => page.evaluate(() => (window as any).__vizitai.ui.get().sheet?.start)).toBe('2026-10-15T08:00'); // eslint-disable-line @typescript-eslint/no-explicit-any
});
