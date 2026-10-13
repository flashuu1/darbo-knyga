import { test, expect } from '@playwright/test';

test('standalone launch shows the three Lithuanian tabs', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('app')).toBeVisible();
  await expect(page.getByTestId('tab-calendar')).toHaveText('Kalendorius');
  await expect(page.getByTestId('tab-clients')).toHaveText('Klientai');
  await expect(page.getByTestId('tab-settings')).toHaveText('Nustatymai');
});

test('a Safari tab shows only the install screen and writes nothing', async ({ page }) => {
  await page.goto('/?safari');
  await expect(page.getByTestId('install')).toContainText('Įdiekite programėlę pagrindiniame ekrane');
  const dbs = await page.evaluate(() => indexedDB.databases());
  expect(dbs).toEqual([]);
});

test('if the database cannot be opened, a Lithuanian message replaces the blank screen', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => {
    IDBFactory.prototype.open = function () { throw new DOMException('blocked for the test', 'UnknownError'); };
  });
  await page.goto('/');
  await expect(page.getByTestId('boot-error')).toHaveText('Nepavyko atidaryti programėlės. Uždarykite ją ir atidarykite iš naujo.');
  await expect(page.getByTestId('app')).toHaveCount(0);
  expect(errors.length).toBeGreaterThan(0); // logged with console.error
});
