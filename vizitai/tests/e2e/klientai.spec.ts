import { test, expect, type Page } from '@playwright/test';
import { openApp, seedAppts } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */
const NOW = '2026-10-14T12:00:00';

async function seedList(page: Page) {
  await seedAppts(page, [
    { name: 'Zzz Laukia', start: '2026-10-13T09:00' },   // took place, no amount: waiting
    { name: 'Mmm Ateis', start: '2026-10-17T10:00' },     // comes in three days
    { name: 'Aaa Sena', start: '2026-07-01T10:00' },      // long gone
  ]);
  await page.evaluate(async () => {
    const { repo, db } = (window as any).__vizitai;
    const old = (await db.appointments.toArray()).find((a: any) => a.start === '2026-07-01T10:00');
    await repo.setAmount(old.id, 5000);
    const c = (await db.clients.toArray()).find((x: any) => x.name === 'Mmm Ateis');
    await repo.updateClient(c.id, { phone: '+370 600 11122' });
  });
}

test.describe('Klientai list', () => {
  test('a tile filters the list below it in place, and "Rodyti visus" brings everybody back', async ({ page }) => {
    await openApp(page, NOW);
    await seedList(page);
    await page.getByTestId('tab-clients').click();
    await expect(page.getByTestId('client-row-2')).toBeVisible();
    await expect(page.getByTestId('client-row-0')).toContainText('Zzz Laukia'); // waiting first, the app's own order
    await expect(page.getByTestId('client-row-1')).toContainText('Mmm Ateis');
    await expect(page.getByTestId('client-row-2')).toContainText('Aaa Sena');
    await expect(page.getByTestId('tile-due').locator('.num')).toHaveText('1');
    await page.getByTestId('tile-due').click();
    await expect(page.getByTestId('clients')).toBeVisible(); // no other screen
    await expect(page.getByTestId('client-row-0')).toContainText('Zzz Laukia');
    await expect(page.getByTestId('client-row-1')).toHaveCount(0);
    await expect(page.getByTestId('list-head')).toContainText('Laukia sumos · 1');
    await page.getByTestId('tile-old').click();
    await expect(page.getByTestId('client-row-0')).toContainText('Aaa Sena');
    await expect(page.getByTestId('client-row-1')).toHaveCount(0);
    await page.getByTestId('tile-old').click(); // pressing the active tile again
    await expect(page.getByTestId('client-row-2')).toBeVisible();
    await page.getByTestId('tile-week').click();
    await expect(page.getByTestId('client-row-0')).toContainText('Mmm Ateis');
    await page.getByTestId('show-all').click();
    await expect(page.getByTestId('client-row-2')).toBeVisible();
  });

  test('the filter button opens a sheet with counts; sorting by name and by money; it shows how many things are changed', async ({ page }) => {
    await openApp(page, NOW);
    await seedList(page);
    await page.getByTestId('tab-clients').click();
    await expect(page.getByTestId('filter-count')).toHaveText('0');
    await page.getByTestId('client-filter').click();
    await expect(page.getByTestId('filter-sheet')).toBeVisible();
    await expect(page.getByTestId('filter-due')).toContainText('1');
    await page.getByTestId('sort-az').click();
    await expect(page.getByTestId('filter-sheet')).toHaveCount(0);
    await expect(page.getByTestId('filter-count')).toHaveText('1');
    await expect(page.getByTestId('client-row-0')).toContainText('Aaa Sena');
    await expect(page.getByTestId('client-row-2')).toContainText('Zzz Laukia');
    await expect(page.getByTestId('cancelled-head')).toHaveCount(0);
    await page.getByTestId('client-filter').click();
    await page.getByTestId('sort-spent').click();
    await expect(page.getByTestId('client-row-0')).toContainText('Aaa Sena');
    await expect(page.getByTestId('client-row-0')).toContainText('Iš viso 50 €');
    await page.getByTestId('client-filter').click();
    await page.getByTestId('sort-auto').click();
    await expect(page.getByTestId('filter-count')).toHaveText('0');
    await expect(page.getByTestId('client-row-0')).toContainText('Zzz Laukia');
  });

  test('search finds a client by name without diacritics and by the digits of the phone', async ({ page }) => {
    await openApp(page, NOW);
    await seedList(page);
    await page.getByTestId('tab-clients').click();
    await page.getByTestId('client-search').fill('600 111');
    await expect(page.getByTestId('client-row-0')).toContainText('Mmm Ateis');
    await expect(page.getByTestId('client-row-1')).toHaveCount(0);
    await page.getByTestId('client-search').fill('zzz');
    await expect(page.getByTestId('client-row-0')).toContainText('Zzz Laukia');
  });

  test('a client can be added without a visit', async ({ page }) => {
    await openApp(page, NOW);
    await page.getByTestId('tab-clients').click();
    await page.getByTestId('client-add').click();
    await expect(page.getByTestId('new-client-sheet')).toBeVisible();
    await expect(page.getByTestId('new-client-save')).toBeDisabled();
    await page.getByTestId('new-client-name').fill('Nauja Klientė');
    await page.getByTestId('new-client-phone').fill('+370 611 22233');
    await page.getByTestId('new-client-save').click();
    await expect(page.getByTestId('new-client-sheet')).toHaveCount(0);
    await expect(page.getByTestId('client-row-0')).toContainText('Nauja Klientė');
    await expect.poll(() => page.evaluate(async () => (await (window as any).__vizitai.db.clients.toArray())[0].phone)).toBe('+370 611 22233');
  });

  test('the orange pill adds the amount straight from the list, then the row turns green for two weeks', async ({ page }) => {
    await openApp(page, NOW);
    await seedList(page);
    await page.getByTestId('tab-clients').click();
    await page.getByTestId('client-pending-0').click();
    await page.getByTestId('amount-input').fill('45');
    await page.getByTestId('amount-confirm').click();
    await page.getByTestId('again-no').click();
    await expect(page.getByTestId('client-paid-0')).toContainText('45,00');
    await expect(page.getByTestId('client-paid-0')).toContainText('spalio 13 d.');
    await expect(page.getByTestId('tile-due').locator('.num')).toHaveText('0');
  });
});

async function seedBooks(page: Page) {
  await page.evaluate(async () => {
    const { repo } = (window as any).__vizitai;
    const svc = await repo.listServices(true);
    const mk = async (name: string, start: string, cents: number | null, s = 0) => {
      const a = await repo.createAppointment({ kind: 'client', name, serviceId: svc[s].id, start });
      if (cents) await repo.setAmount(a.id, cents);
    };
    for (const d of ['2026-05-05', '2026-06-09', '2026-07-14', '2026-08-11', '2026-09-08', '2026-10-06']) await mk('Ona Petraitė', `${d}T10:00`, 4000);
    for (const d of ['2026-08-12', '2026-10-07']) await mk('Zita Zitaitė', `${d}T14:00`, 6000, 1);
    await mk('Rasa Nauja', '2026-10-13T11:00', 3500);
  });
}

test.describe('Išlaidos > Analizė', () => {
  test('says so when there is nothing to analyse yet', async ({ page }) => {
    await openApp(page, NOW);
    await page.getByTestId('tab-expenses').click();
    await page.getByTestId('expenses-seg-stats').click();
    await expect(page.getByTestId('stats-empty')).toBeVisible();
  });

  test('new clients: the numbers count up, a chart reads out a month when touched, the period can be changed', async ({ page }) => {
    await openApp(page, NOW);
    await seedBooks(page);
    await page.getByTestId('tab-expenses').click();
    await page.getByTestId('expenses-seg-stats').click();
    await expect(page.getByTestId('card-new')).toBeVisible();
    await expect(page.getByTestId('win-text')).toContainText('spalis 2026');
    await expect(page.getByTestId('card-new').getByTestId('chart-tip')).toContainText('Braukite');
    // three new clients (Ona, Zita, Rasa) in the last twelve months
    await expect(page.getByTestId('card-new').locator('.bignum span').first()).toHaveText('3', { timeout: 4000 });
    await page.getByTestId('card-new').getByTestId('chart').click({ position: { x: 200, y: 80 } });
    await expect(page.getByTestId('card-new').getByTestId('chart-tip')).toContainText('Nauji:');
    // the glass buttons change the period for every chart, and the thumb follows
    await page.getByTestId('glass-24').click();
    await expect(page.getByTestId('win-text')).toContainText('lapkritis 2024');
    await page.getByTestId('glass-3').click();
    await expect(page.getByTestId('win-text')).toContainText('rugpjūtis 2026');
    await expect(page.getByTestId('glass')).toBeVisible();
    // retention: of three new clients two came more than once
    await expect(page.getByTestId('card-retention')).toContainText('sugrįžo bent kartą');
  });

  test('the period bar can be dragged to move the window', async ({ page }) => {
    await openApp(page, NOW);
    await seedBooks(page);
    await page.getByTestId('tab-expenses').click();
    await page.getByTestId('expenses-seg-stats').click();
    const before = await page.getByTestId('win-text').textContent();
    const box = (await page.getByTestId('period-bar').boundingBox())!;
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 18 / 24, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 12 / 24, y, { steps: 6 });
    await page.mouse.up();
    await expect(page.getByTestId('win-text')).not.toHaveText(before!);
  });

  test('frequent: rhythm card, the when-they-come map, and a ranking whose rows open', async ({ page }) => {
    await openApp(page, NOW);
    await seedBooks(page);
    await page.getByTestId('tab-expenses').click();
    await page.getByTestId('expenses-seg-stats').click();
    await page.getByTestId('stat-seg-freq').click();
    await expect(page.getByTestId('card-gap')).toBeVisible();
    await expect(page.getByTestId('rank-0')).toContainText('Ona Petraitė');
    await page.getByTestId('rank-0').click();
    await expect(page.getByTestId('rank-0')).toContainText('Iš viso vizitų: 6');
    await page.getByTestId('heat-1-0').click(); // Tuesday morning
    await expect(page.getByTestId('heat-tip')).toContainText('Antradienis');
    await expect(page.getByTestId('heat-tip')).toContainText('vizitų 6');
    await page.getByTestId('top-10').click();
    await expect(page.getByTestId('rank-2')).toBeVisible();
  });

  test('profitable: records, income, lost money, the ring by service and its legend', async ({ page }) => {
    await openApp(page, NOW);
    await seedBooks(page);
    await page.getByTestId('tab-expenses').click();
    await page.getByTestId('expenses-seg-stats').click();
    await page.getByTestId('stat-seg-profit').click();
    await expect(page.getByTestId('rec-day')).toHaveText('Antradienis');
    await expect(page.getByTestId('rec-rich')).toContainText('spalis 2026');
    await expect(page.getByTestId('card-income').locator('.bignum span').first()).toContainText('395', { timeout: 4000 });
    await expect(page.getByTestId('card-lost')).toBeVisible();
    await expect(page.getByTestId('donut')).toBeVisible();
    await page.getByTestId('legend-0').click();
    await expect(page.getByTestId('legend-0')).toHaveClass(/on/);
    await page.getByTestId('legend-0').click();
    await expect(page.getByTestId('legend-0')).not.toHaveClass(/on/);
    await expect(page.getByTestId('rank-0')).toContainText('Ona Petraitė');
  });

  test('time: utilisation and hours', async ({ page }) => {
    await openApp(page, NOW);
    await seedBooks(page);
    await page.getByTestId('tab-expenses').click();
    await page.getByTestId('expenses-seg-stats').click();
    await page.getByTestId('stat-seg-time').click();
    await expect(page.getByTestId('card-util')).toContainText('darbo laiko užimta');
    await expect(page.getByTestId('card-util').locator('.bignum span').first()).toHaveText(/\d+%/, { timeout: 4000 });
  });

  test('Išlaidos remembers the analysis page after a visit to another tab', async ({ page }) => {
    await openApp(page, NOW);
    await seedBooks(page);
    await page.getByTestId('tab-expenses').click();
    await page.getByTestId('expenses-seg-stats').click();
    await page.getByTestId('stat-seg-profit').click();
    await page.getByTestId('tab-calendar').click();
    await page.getByTestId('tab-expenses').click();
    await expect(page.getByTestId('stats')).toBeVisible();
    await expect(page.getByTestId('stat-seg-profit')).toHaveClass(/on/);
  });

  test('a sideways swipe turns the pages: the month, the four analysis pages, and back', async ({ page }) => {
    await openApp(page, NOW);
    await seedBooks(page);
    await page.getByTestId('tab-expenses').click();
    // a left swipe starts on the right of the screen, a right swipe on the left, so the finger stays on the screen
    const swipe = async (dx: number) => {
      const box = (await page.getByTestId('expenses-seg').boundingBox())!;
      const y = box.y + box.height / 2, x = dx < 0 ? 360 : 70;
      await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx, y, { steps: 8 }); await page.mouse.up();
    };
    await swipe(-170); // left: to Analizė, its first page
    await expect(page.getByTestId('stats')).toBeVisible();
    await expect(page.getByTestId('stat-seg-new')).toHaveClass(/on/);
    for (const next of ['freq', 'profit', 'time']) { await swipe(-170); await expect(page.getByTestId(`stat-seg-${next}`)).toHaveClass(/on/); }
    await swipe(-170); // nothing after the last page
    await expect(page.getByTestId('stat-seg-time')).toHaveClass(/on/);
    for (const prev of ['profit', 'freq', 'new']) { await swipe(170); await expect(page.getByTestId(`stat-seg-${prev}`)).toHaveClass(/on/); }
    await swipe(170); // from the first analysis page back to the month
    await expect(page.getByTestId('exp-net')).toBeVisible();
    await expect(page.getByTestId('expenses-seg-main')).toHaveClass(/on/);
  });

  test('a short drag or a vertical scroll does not turn the page', async ({ page }) => {
    await openApp(page, NOW);
    await seedBooks(page);
    await page.getByTestId('tab-expenses').click();
    const box = (await page.getByTestId('exp-net').boundingBox())!;
    const x = 300, y = box.y + box.height / 2;
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x - 30, y, { steps: 4 }); await page.mouse.up();
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x - 120, y + 160, { steps: 6 }); await page.mouse.up();
    await expect(page.getByTestId('expenses-seg-main')).toHaveClass(/on/);
    await expect(page.getByTestId('stats')).toHaveCount(0);
  });

  test('Klientai is only about clients: no analysis there', async ({ page }) => {
    await openApp(page, NOW);
    await seedBooks(page);
    await page.getByTestId('tab-clients').click();
    await expect(page.getByTestId('clients-seg')).toHaveCount(0);
    await expect(page.getByTestId('tile-due')).toBeVisible();
  });
});
