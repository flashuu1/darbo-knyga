import { test, expect } from '@playwright/test';
import { openApp, seedAppts } from './helpers';

test('Savaitė shows seven columns with compact entries', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-15T10:00' }]);
  await page.getByTestId('seg-week').click();
  for (const d of ['2026-10-12', '2026-10-14', '2026-10-18']) await expect(page.getByTestId(`col-${d}`)).toBeVisible();
  await expect(page.getByTestId('col-2026-10-15').getByTestId(`entry-${id}`)).toContainText('Ona');
  await expect(page.getByTestId('title')).toContainText('spalio 12 d.');
});

test('the year-end week runs 28 Dec to 3 Jan', async ({ page }) => {
  await openApp(page, '2026-12-30T09:00:00');
  await page.getByTestId('seg-week').click();
  await expect(page.getByTestId('col-2026-12-28')).toBeVisible();
  await expect(page.getByTestId('col-2027-01-03')).toBeVisible();
});

test('Mėnuo shows booking counts and a tap opens that day', async ({ page }) => {
  await openApp(page);
  await seedAppts(page, [{ name: 'A', start: '2026-10-20T10:00' }, { name: 'B', start: '2026-10-20T12:00' }]);
  await page.getByTestId('month-name').click();
  await expect(page.getByTestId('month-cell-2026-10-20')).toContainText('2');
  await page.getByTestId('month-cell-2026-10-20').click();
  await expect(page.getByTestId('title')).toHaveText('spalio 20 d., antradienis');
});

test('Savaitė header chips open the day', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('seg-week').click();
  await page.getByTestId('weekhead-2026-10-16').click();
  await expect(page.getByTestId('title')).toHaveText('spalio 16 d., penktadienis');
});
