import { test, expect } from '@playwright/test';
import { openApp, seedAppts } from './helpers';

const names = [{ name: 'Žydrūnė', start: '2026-10-01T10:00' }, { name: 'Zita', start: '2026-10-02T10:00' }, { name: 'Ona', start: '2026-10-03T10:00' }];

test('lists clients sorted with lt rules and shows the last visit', async ({ page }) => {
  await openApp(page);
  await seedAppts(page, names);
  await page.getByTestId('tab-clients').click();
  await expect(page.getByTestId('client-row-0')).toContainText('Ona');
  await expect(page.getByTestId('client-row-1')).toContainText('Zita');
  await expect(page.getByTestId('client-row-2')).toContainText('Žydrūnė');
  await expect(page.getByTestId('client-row-0')).toContainText('Paskutinis vizitas: spalio 3 d.');
});

test('search ignores diacritics and case', async ({ page }) => {
  await openApp(page);
  await seedAppts(page, names);
  await page.getByTestId('tab-clients').click();
  await expect(page.getByTestId('client-row-2')).toBeVisible();
  await page.getByTestId('client-search').fill('ZYDRUNE');
  await expect(page.getByTestId('client-row-0')).toContainText('Žydrūnė');
  await expect(page.getByTestId('client-row-1')).toHaveCount(0);
});

test('shows an empty state with no clients', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('tab-clients').click();
  await expect(page.getByTestId('clients-empty')).toHaveText('Klientų dar nėra');
});

test('the card shows visits and counts, and saves name and phone', async ({ page }) => {
  await openApp(page);
  const [a, b] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-01T10:00' }, { name: 'Ona', start: '2026-10-05T10:00' }, { name: 'Ona', start: '2026-10-20T10:00' }]);
  await page.evaluate(async (id) => (window as any).__vizitai.repo.cancelAppointment(id, 'ill'), b); // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.evaluate(async (id) => (window as any).__vizitai.repo.markNoShow(id), a); // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.getByTestId('tab-clients').click();
  await page.getByTestId('client-row-0').click();
  await expect(page.getByTestId('card-visits')).toHaveText('Vizitų skaičius: 0');
  await expect(page.getByTestId('card-cancelled')).toHaveText('Atšaukė: 1');
  await expect(page.getByTestId('card-noshow')).toHaveText('Neatvyko: 1');
  await expect(page.getByTestId('upcoming-0')).toBeVisible();
  await expect(page.getByTestId('visit-0')).toBeVisible();
  await expect(page.getByTestId('visit-1')).toBeVisible();
  await expect(page.getByTestId('visit-2')).toHaveCount(0);
  await page.getByTestId('card-phone').fill('+370 600 00000');
  await page.getByTestId('card-name').fill('Ona Onaitė');
  await page.getByTestId('card-back').click();
  await expect(page.getByTestId('client-row-0')).toContainText('Ona Onaitė');
  await expect.poll(() => page.evaluate(async () => (await (window as any).__vizitai.db.clients.toArray())[0].phone)).toBe('+370 600 00000'); // eslint-disable-line @typescript-eslint/no-explicit-any
});

test('renaming to another client\'s name keeps the old name', async ({ page }) => {
  await openApp(page);
  await seedAppts(page, [{ name: 'Ona', start: '2026-10-01T10:00' }, { name: 'Zita', start: '2026-10-02T10:00' }]);
  await page.getByTestId('tab-clients').click();
  await page.getByTestId('client-row-0').click();
  await page.getByTestId('card-name').fill('ZITA');
  await page.getByTestId('card-back').click();
  await expect(page.getByTestId('client-row-0')).toContainText('Ona');
  await expect(page.getByTestId('client-row-1')).toContainText('Zita');
  await expect(page.getByTestId('client-row-1')).not.toContainText('ZITA');
  await expect.poll(() => page.evaluate(async () => (await (window as any).__vizitai.db.clients.toArray()).map((c: { name: string }) => c.name).sort())).toEqual(['Ona', 'Zita']); // eslint-disable-line @typescript-eslint/no-explicit-any
});

test('Registruoti opens the new sheet with the client and their last service', async ({ page }) => {
  await openApp(page);
  await seedAppts(page, [{ name: 'Ona', start: '2026-10-01T10:00', service: 2 }]);
  await page.getByTestId('tab-clients').click();
  await page.getByTestId('client-row-0').click();
  await page.getByTestId('card-book').click();
  await expect(page.getByTestId('field-name')).toHaveValue('Ona');
  await page.getByTestId('btn-next').click();
  await expect(page.getByTestId('svc-2')).toHaveClass(/on/);
});

test('tapping the name in an appointment opens the client card', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await page.getByTestId('appt-name').click();
  await expect(page.getByTestId('card-name')).toHaveValue('Ona');
});
