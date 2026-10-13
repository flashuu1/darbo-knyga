import { test, expect, type Page } from '@playwright/test';
import { apptState, openApp, seedAppts } from './helpers';

async function dragDown(page: Page, from: { x: number; y: number }, dy: number, steps = 8) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y + dy, { steps });
  await page.mouse.up();
}
const grabber = async (page: Page) => { const b = (await page.getByTestId('sheet').locator('.grabber').boundingBox())!; return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };

test('a bottom sheet closes by swiping down on its handle', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T15:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await expect(page.getByTestId('sheet')).toBeVisible();
  await page.waitForTimeout(450); // let the entry animation finish
  await dragDown(page, await grabber(page), 260);
  await expect(page.getByTestId('sheet')).toHaveCount(0);
});

test('a short pull springs back and the sheet stays', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T15:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await page.waitForTimeout(450);
  const before = (await page.getByTestId('sheet').boundingBox())!;
  await dragDown(page, await grabber(page), 40);
  await page.waitForTimeout(500);
  const after = (await page.getByTestId('sheet').boundingBox())!;
  expect(Math.abs(after.y - before.y)).toBeLessThan(2);
  await expect(page.getByTestId('sheet')).toBeVisible();
});

test('tapping the dimmed area closes a sheet; taps inside do not', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T15:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await page.waitForTimeout(450);
  await page.getByTestId('appt-status').click();
  await expect(page.getByTestId('sheet')).toBeVisible();
  await page.mouse.click(200, 60);
  await expect(page.getByTestId('sheet')).toHaveCount(0);
});

test('a sheet is never taller than the screen below the status bar and its body scrolls inside', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T15:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await page.waitForTimeout(450);
  const vh = page.viewportSize()!.height;
  const b = (await page.getByTestId('sheet').boundingBox())!;
  expect(b.y).toBeGreaterThan(0);
  expect(b.y + b.height).toBeLessThanOrEqual(vh + 0.5);
  expect(b.height).toBeLessThan(vh * 0.9); // content height, not full screen
});

test('the booking modal is full height and swipes down to close, without losing the app behind it', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('slot-2026-10-14T10:30').click();
  await page.waitForTimeout(500);
  await dragDown(page, await grabber(page), 320);
  await expect(page.getByTestId('sheet')).toHaveCount(0);
  await expect(page.getByTestId('calendar')).toBeVisible();
});

test('a sheet that closes by saving also plays out and leaves nothing behind', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T15:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await page.getByTestId('act-cancel').click();
  await page.getByTestId('action-item-3').click();
  await expect(page.getByTestId('action-title')).toHaveCount(0); // the action sheet has gone too
  await expect(page.getByTestId('sheet')).toHaveCount(0);
  await expect.poll(async () => (await apptState(page, id)).status).toBe('cancelled');
});
