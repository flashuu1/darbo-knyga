import { test, expect } from '@playwright/test';
import { openApp, seedAppts } from './helpers';

test('opens on today with a Lithuanian title and week strip', async ({ page }) => {
  await openApp(page);
  await expect(page.getByTestId('title')).toHaveText('spalio 14 d., trečiadienis');
  await expect(page.getByTestId('chip-2026-10-14')).toHaveClass(/sel/);
  await expect(page.getByTestId('empty-day')).toHaveText('Šią dieną vizitų nėra');
});

test('entries render at their times and a bookings dot appears', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Žydrūnė', start: '2026-10-14T10:00' }]);
  const entry = page.getByTestId(`entry-${id}`);
  await expect(entry).toContainText('10:00');
  await expect(entry).toContainText('Žydrūnė');
  const slot = await page.getByTestId('slot-2026-10-14T10:00').boundingBox();
  const box = await entry.boundingBox();
  expect(Math.abs(box!.y - slot!.y)).toBeLessThan(2);
  await expect(page.getByTestId('chip-2026-10-14').locator('.dot.on')).toHaveCount(1);
});

test('tapping an empty row opens the new sheet for that slot', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('slot-2026-10-14T10:30').click();
  const sheet = await page.evaluate(() => (window as any).__vizitai.ui.get().sheet); // eslint-disable-line @typescript-eslint/no-explicit-any
  expect(sheet).toMatchObject({ type: 'new', start: '2026-10-14T10:30' });
});

test('the week strip and Šiandien change the day', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('chip-2026-10-16').click();
  await expect(page.getByTestId('title')).toHaveText('spalio 16 d., penktadienis');
  await page.getByTestId('btn-today').click();
  await expect(page.getByTestId('title')).toHaveText('spalio 14 d., trečiadienis');
});

test('a booking at 10:00 on the DST change day still shows 10:00', async ({ page }) => {
  await openApp(page, '2026-10-25T09:00:00');
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-25T10:00' }]);
  await expect(page.getByTestId(`entry-${id}`)).toContainText('10:00');
});

test('a booking outside working hours stays visible', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T06:30' }]);
  await expect(page.getByTestId(`entry-${id}`)).toBeVisible();
  await expect(page.getByTestId('slot-2026-10-14T06:30')).toBeVisible();
});
