import { test, expect } from '@playwright/test';
import { openApp, seedAppts, expectPickedTime } from './helpers';

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

test('Užregistruoti į priekį on an appointment opens the calendar for the same client and service', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00', service: 2 }]);
  await page.getByTestId(`entry-${id}`).click();
  await expect(page.getByTestId('act-repeat')).toHaveText('Užregistruoti į priekį');
  await page.getByTestId('act-repeat').click();
  // no 4/6/8-week shortcuts: straight to the calendar, tomorrow at the visit's time preselected
  await expect(page.getByTestId('action-title')).toHaveCount(0);
  await expect(page.getByTestId('timewheel')).toBeVisible();
  await expect(page.getByTestId('pick-day-2026-10-15')).toHaveClass(/sel/);
  await expectPickedTime(page, '10:00');
  await page.getByTestId('pick-next').click();
  await page.getByTestId('pick-day-2026-11-25').click();
  await page.getByTestId('btn-save-time').click();
  // same client and the same service as the visit it was started from
  await expect.poll(() => page.evaluate(async () => {
    const { db } = (window as any).__vizitai;
    const all = await db.appointments.toArray();
    const src = all.find((a: { start: string }) => a.start === '2026-10-14T10:00');
    const now = all.filter((a: { start: string }) => a.start === '2026-11-25T10:00');
    return now.length === 1 && now[0].clientId === src.clientId && now[0].serviceId === src.serviceId;
  })).toBe(true);
});

test('Užregistruoti į priekį on the client card repeats the latest visit', async ({ page }) => {
  await openApp(page);
  await seedAppts(page, [{ name: 'Ona', start: '2026-10-01T09:30', service: 1 }]);
  await page.getByTestId('tab-clients').click();
  await page.getByTestId('client-row-0').click();
  const box = await page.getByTestId('card-repeat').boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await page.getByTestId('card-repeat').click();
  await expectPickedTime(page, '09:30'); // the visit's time of day
  await expect(page.getByTestId('client-card')).toBeVisible(); // still there behind the modal: Atgal returns to it
  await page.getByTestId('btn-save-time').click();
  await expect(page.getByTestId('sheet')).toHaveCount(0);
  // saved: the card is left for the calendar (Day view), so the new entry is seen
  await expect(page.getByTestId('client-card')).toHaveCount(0);
  await expect(page.getByTestId('calendar')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__vizitai.ui.get().view)).toBe('day');
  await expect(page.getByTestId('col-2026-10-15')).toContainText('Ona');
});

test('smart defaults: the next free slot skips today’s booking, recent clients come first, last service is preselected', async ({ page }) => {
  await openApp(page, '2026-10-14T09:05:00');
  await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T09:00' }, { name: 'Jonas', start: '2026-10-13T10:00', service: 3 }]);
  await page.getByTestId('btn-add').click();
  await expect.poll(() => page.evaluate(() => (window as any).__vizitai.ui.get().sheet?.start)).toBe('2026-10-14T09:15');
  await expect(page.getByTestId('suggest-0')).toContainText('Jonas');
  await page.getByTestId('suggest-0').click();
  await expect(page.getByTestId('svc-3')).toHaveClass(/on/);
});

test('Atgal from Užregistruoti į priekį returns to the appointment sheet it was started from, saving nothing', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00', service: 2 }]);
  await page.getByTestId(`entry-${id}`).click();
  await page.getByTestId('act-repeat').click();
  await expect(page.getByTestId('timewheel')).toBeVisible();
  await page.getByTestId('btn-back').click();
  await expect(page.getByTestId('timewheel')).toHaveCount(0);       // no walk through the service and name screens
  await expect(page.getByTestId('act-repeat')).toBeVisible();        // back on the appointment sheet
  await expect(page.getByTestId('appt-name')).toHaveText('Ona');
  expect(await page.evaluate(async () => (await (window as any).__vizitai.db.appointments.count()))).toBe(1);
});

test('Atgal from Užregistruoti į priekį on the client card returns to the card', async ({ page }) => {
  await openApp(page);
  await seedAppts(page, [{ name: 'Ona', start: '2026-10-01T09:30', service: 1 }]);
  await page.getByTestId('tab-clients').click();
  await page.getByTestId('client-row-0').click();
  await page.getByTestId('card-repeat').click();
  await expect(page.getByTestId('timewheel')).toBeVisible();
  await page.getByTestId('btn-back').click();
  await expect(page.getByTestId('sheet')).toHaveCount(0);
  await expect(page.getByTestId('client-card')).toBeVisible();
  await expect(page.getByTestId('card-repeat')).toBeVisible();
  expect(await page.evaluate(async () => (await (window as any).__vizitai.db.appointments.count()))).toBe(1);
});

test('swiping the Užregistruoti į priekį modal down also returns to where it started', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await page.getByTestId('act-repeat').click();
  await page.waitForTimeout(500);
  const g = (await page.getByTestId('sheet').locator('.grabber').boundingBox())!;
  await page.mouse.move(g.x + g.width / 2, g.y + 3);
  await page.mouse.down();
  await page.mouse.move(g.x + g.width / 2, g.y + 400, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByTestId('act-repeat')).toBeVisible();
  await expect(page.getByTestId('timewheel')).toHaveCount(0);
});
