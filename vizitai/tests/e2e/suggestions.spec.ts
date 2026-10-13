import { test, expect } from '@playwright/test';
import { openApp, seedAppts } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */
test('the backup banner shows when data exists but no backup, and opens the export', async ({ page }) => {
  await openApp(page);
  await expect(page.getByTestId('backup-banner')).toHaveCount(0); // no data yet
  await expect(page.getByTestId('tab-settings-badge')).toHaveCount(0);
  await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await expect(page.getByTestId('backup-banner')).toHaveText('Sukurti atsarginę kopiją?');
  await expect(page.getByTestId('tab-settings-badge')).toBeVisible();
  const box = await page.getByTestId('backup-banner').boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('backup-banner').click()]);
  expect(download.suggestedFilename()).toMatch(/^vizitai-2026-10-14\.json$/);
  await expect(page.getByTestId('backup-banner')).toHaveCount(0);
  await expect(page.getByTestId('tab-settings-badge')).toHaveCount(0);
});

test('the banner and badge show again once the last backup is older than 7 days', async ({ page }) => {
  await openApp(page);
  await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await page.evaluate(() => (window as any).__vizitai.repo.updateSettings({ lastBackupAt: '2026-10-10T09:00:00.000Z' }));
  await expect(page.getByTestId('backup-banner')).toHaveCount(0);
  await expect(page.getByTestId('tab-settings-badge')).toHaveCount(0);
  await page.evaluate(() => (window as any).__vizitai.repo.updateSettings({ lastBackupAt: '2026-10-01T09:00:00.000Z' }));
  await expect(page.getByTestId('backup-banner')).toBeVisible();
  await expect(page.getByTestId('tab-settings-badge')).toBeVisible();
});

test('Kartoti on an appointment books the same client and service 6 weeks later', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00', service: 2 }]);
  await page.getByTestId(`entry-${id}`).click();
  await page.getByTestId('act-repeat').click();
  await expect(page.getByTestId('action-title')).toHaveText('Kartoti po');
  await expect(page.getByTestId('action-item-0')).toHaveText('po 4 sav.');
  await expect(page.getByTestId('action-item-1')).toHaveText('po 6 sav.');
  await expect(page.getByTestId('action-item-2')).toHaveText('po 8 sav.');
  await page.getByTestId('action-item-1').click(); // 6 weeks
  await expect(page.getByTestId('field-name')).toHaveValue('Ona');
  await expect(page.getByTestId('svc-2')).toHaveClass(/on/);
  await expect(page.getByTestId('time-value')).toHaveText('lapkričio 25 d., tr · 10:00');
  await page.getByTestId('btn-save').click();
  await expect.poll(() => page.evaluate(async () => (await (window as any).__vizitai.db.appointments.toArray()).filter((a: { start: string }) => a.start === '2026-11-25T10:00').length)).toBe(1);
});

test('Kartoti on the client card repeats the latest visit', async ({ page }) => {
  await openApp(page);
  await seedAppts(page, [{ name: 'Ona', start: '2026-10-01T09:30', service: 1 }]);
  await page.getByTestId('tab-clients').click();
  await page.getByTestId('client-row-0').click();
  const box = await page.getByTestId('card-repeat').boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await page.getByTestId('card-repeat').click();
  await page.getByTestId('action-item-2').click(); // 8 weeks
  await expect(page.getByTestId('time-value')).toHaveText('lapkričio 26 d., kt · 09:30'); // 2026-10-01 + 56 days (Thursday)
  await expect(page.getByTestId('svc-1')).toHaveClass(/on/);
});

test('smart defaults: the next free slot skips today’s booking, recent clients come first, last service is preselected', async ({ page }) => {
  await openApp(page, '2026-10-14T09:05:00');
  await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T09:00' }, { name: 'Jonas', start: '2026-10-13T10:00', service: 3 }]);
  await page.getByTestId('btn-add').click();
  await expect.poll(() => page.evaluate(() => (window as any).__vizitai.ui.get().sheet?.start)).toBe('2026-10-14T09:45');
  await expect(page.getByTestId('suggest-0')).toHaveText('Jonas');
  await page.getByTestId('suggest-0').click();
  await expect(page.getByTestId('svc-3')).toHaveClass(/on/);
});
