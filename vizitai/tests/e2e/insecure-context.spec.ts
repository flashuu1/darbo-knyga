import { test, expect } from '@playwright/test';
import { openApp } from './helpers';

// Regression: over plain-http LAN (insecure context) crypto.randomUUID is undefined.
test('app boots, seeds and books without crypto.randomUUID', async ({ page }) => {
  await page.addInitScript(() => {
    (crypto as unknown as { randomUUID: undefined }).randomUUID = undefined;
    Object.defineProperty(Crypto.prototype, 'randomUUID', { value: undefined, configurable: true });
  });
  await openApp(page);
  await expect(page.getByTestId('boot-error')).toHaveCount(0);
  expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe('undefined');
  const n = await page.evaluate(async () => (await (window as any).__vizitai.repo.listServices()).length); // eslint-disable-line @typescript-eslint/no-explicit-any
  expect(n).toBe(7);
  await page.getByTestId('slot-2026-10-14T10:30').click();
  await page.getByTestId('field-name').fill('Žydrūnė');
  await page.getByTestId('field-name').press('Enter');
  await page.getByTestId('btn-save').click();
  await expect(page.getByTestId('sheet')).toHaveCount(0);
  await expect(page.getByTestId('col-2026-10-14')).toContainText('Žydrūnė');
});
