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
