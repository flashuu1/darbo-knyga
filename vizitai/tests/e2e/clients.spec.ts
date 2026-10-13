import { test, expect } from '@playwright/test';
import { openApp, seedAppts } from './helpers';

const names = [{ name: 'Žydrūnė', start: '2026-10-01T10:00' }, { name: 'Zita', start: '2026-10-02T10:00' }, { name: 'Ona', start: '2026-10-03T10:00' }];

test('clients without a payment status or a coming visit are listed A-Z with lt rules', async ({ page }) => {
  await openApp(page);
  await page.evaluate(async () => {
    const { repo } = (window as any).__vizitai; // eslint-disable-line @typescript-eslint/no-explicit-any
    for (const n of ['Žydrūnė', 'Zita', 'Ona']) await repo.matchOrCreateClient(n);
  });
  await page.getByTestId('tab-clients').click();
  await expect(page.getByTestId('client-row-0')).toContainText('Ona');
  await expect(page.getByTestId('client-row-1')).toContainText('Zita');
  await expect(page.getByTestId('client-row-2')).toContainText('Žydrūnė');
});

test('pending payment first, then paid this month in green, then the next visit', async ({ page }) => {
  await openApp(page, '2026-10-14T12:00:00');
  const [pending, paid, , next, old] = await seedAppts(page, [
    { name: 'Aaa Laukia', start: '2026-10-14T09:00' },   // passed, no amount
    { name: 'Bbb Sumokėjo', start: '2026-10-13T10:00' },
    { name: 'Bbb Sumokėjo', start: '2026-10-30T10:00' }, // and comes again
    { name: 'Ccc Netrukus', start: '2026-10-20T10:00' },
    { name: 'Ddd Niekas', start: '2026-09-01T10:00' },   // paid last month: nothing to show now
  ]);
  await page.evaluate(async (id) => (window as any).__vizitai.repo.setAmount(id, 4500), paid); // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.evaluate(async (id) => (window as any).__vizitai.repo.setAmount(id, 5000), old); // eslint-disable-line @typescript-eslint/no-explicit-any
  void pending; void next;
  await page.getByTestId('tab-clients').click();
  await expect(page.getByTestId('client-row-0')).toContainText('Aaa Laukia');
  await expect(page.getByTestId('client-pending-0')).toHaveText('Pridėti sumą');
  await expect(page.getByTestId('client-row-1')).toContainText('Bbb Sumokėjo');
  await expect(page.getByTestId('client-paid-1')).toContainText('Sumokėta 45,00');
  await expect(page.getByTestId('client-next-1')).toContainText('spalio 30 d.');
  await expect(page.getByTestId('client-row-2')).toContainText('Ccc Netrukus');
  await expect(page.getByTestId('client-next-2')).toContainText('spalio 20 d.');
  await expect(page.getByTestId('client-row-3')).toContainText('Ddd Niekas');
  await expect(page.getByTestId('client-paid-3')).toHaveCount(0);
  await expect(page.getByTestId('client-pending-3')).toHaveCount(0);
});

test('entering the amount turns the pending client green and moves them below the pending ones', async ({ page }) => {
  await openApp(page, '2026-10-14T12:00:00');
  const [a, b] = await seedAppts(page, [{ name: 'Aaa', start: '2026-10-14T09:00' }, { name: 'Bbb', start: '2026-10-14T10:00' }]);
  await page.getByTestId('tab-clients').click();
  await expect(page.getByTestId('client-pending-0')).toBeVisible();
  await page.evaluate(async (id) => (window as any).__vizitai.repo.setAmount(id, 3000), a); // eslint-disable-line @typescript-eslint/no-explicit-any
  await expect(page.getByTestId('client-row-0')).toContainText('Bbb'); // still waiting: now first
  await expect(page.getByTestId('client-pending-0')).toBeVisible();
  await expect(page.getByTestId('client-row-1')).toContainText('Aaa');
  await expect(page.getByTestId('client-paid-1')).toContainText('Sumokėta 30,00');
  void b;
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
