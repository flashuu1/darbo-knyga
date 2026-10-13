import { test, expect, type Page } from '@playwright/test';
import { apptState, openApp, seedAppts } from './helpers';

async function lift(page: Page, id: string) {
  const box = (await page.getByTestId(`entry-${id}`).boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + 10;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(450);
  await expect(page.getByTestId('drag-ghost')).toBeVisible();
  return { x, y };
}
const rowHeight = async (page: Page) => {
  const a = (await page.getByTestId('slot-2026-10-14T10:00').boundingBox())!;
  const b = (await page.getByTestId('slot-2026-10-14T10:15').boundingBox())!;
  return b.y - a.y;
};
const start = (page: Page, id: string) => async () => (await apptState(page, id)).start as string;

test('hold then drag snaps to 15 minutes, saves on release and Anuliuoti undoes it', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  const row = await rowHeight(page);
  const { x, y } = await lift(page, id);
  await expect(page.getByTestId('drag-ghost')).toBeVisible();
  await page.mouse.move(x, y + 2 * row + 3, { steps: 8 });
  await expect(page.getByTestId('drag-ghost')).toContainText('10:30');
  await page.mouse.up();
  await expect(page.getByTestId('drag-ghost')).toHaveCount(0);
  await expect(page.getByTestId('toast')).toContainText('Perkelta: spalio 14 d., tr · 10:30');
  await expect.poll(start(page, id)).toBe('2026-10-14T10:30');
  expect((await apptState(page, id)).moves).toHaveLength(1);
  await page.getByTestId('toast-undo').click();
  await expect.poll(start(page, id)).toBe('2026-10-14T10:00');
});

test('dropping on a week-strip chip changes the date and keeps the time', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  const { x, y } = await lift(page, id);
  const chip = (await page.getByTestId('chip-2026-10-16').boundingBox())!;
  await page.mouse.move(x, y - 5, { steps: 3 });
  await page.mouse.move(chip.x + chip.width / 2, chip.y + chip.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect.poll(start(page, id)).toBe('2026-10-16T10:00');
});

test('in Week view, dragging across columns changes the date', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await page.getByTestId('seg-week').click();
  // the remounted grid scrolls to the first booking once loaded; lift only after that so the entry stays under the pointer
  await expect.poll(() => page.getByTestId('timeline').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  const { y } = await lift(page, id);
  const target = (await page.getByTestId('col-2026-10-16').boundingBox())!;
  await page.mouse.move(target.x + target.width / 2, y, { steps: 10 });
  await page.mouse.up();
  await expect.poll(start(page, id)).toBe('2026-10-16T10:00');
});

test('holding at the screen edge for 600 ms flips the day', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  const { y } = await lift(page, id);
  await page.mouse.move(3, y, { steps: 6 });
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => (window as any).__vizitai.ui.get().date)).toBe('2026-10-13'); // eslint-disable-line @typescript-eslint/no-explicit-any
  await expect(page.getByTestId('drag-ghost')).toBeVisible();
  await page.mouse.move(200, y, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await start(page, id)()).slice(0, 10)).toBe('2026-10-13');
});

test('a quick swipe never starts a drag', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  const box = (await page.getByTestId(`entry-${id}`).boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 40, box.y + 70, { steps: 5 });
  await page.waitForTimeout(500); // still pressed past the 400 ms hold: the early move must have ruled out a drag
  await expect(page.getByTestId('drag-ghost')).toHaveCount(0);
  await page.mouse.up();
  await page.waitForTimeout(300);
  await expect(page.getByTestId('drag-ghost')).toHaveCount(0);
  expect((await apptState(page, id)).moves).toHaveLength(0);
});

test('a short tap still opens the appointment', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await expect(page.getByTestId('sheet')).toBeVisible();
});

test('a drag does not also open the sheet', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  const row = await rowHeight(page);
  const { x, y } = await lift(page, id);
  await page.mouse.move(x, y + row, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByTestId('toast')).toBeVisible();
  await expect(page.getByTestId('sheet')).toHaveCount(0);
});

test('entries disable the iOS text callout and selection', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  const entry = page.getByTestId(`entry-${id}`);
  expect(await entry.evaluate((el) => getComputedStyle(el).userSelect)).toBe('none');
  // Playwright's WebKit does not implement -webkit-touch-callout (computed value is null); tests/unit/drag.test.ts checks the CSS source.
  await expect.poll(() => entry.evaluate((el) => !el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })))).toBe(true); // listeners bind after paint
});
