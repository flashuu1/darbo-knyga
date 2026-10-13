import { test, expect, type Page } from '@playwright/test';
import { apptState, openApp, seedAppts as seedOnly } from './helpers';

/** Seeding shows the backup banner a moment later, which pushes the grid down; measure only after that. */
async function seedAppts(page: Page, list: Parameters<typeof seedOnly>[1]) {
  const ids = await seedOnly(page, list);
  await expect(page.getByTestId('backup-banner')).toBeVisible();
  return ids;
}

/** Gesture listeners bind in a useEffect after paint; wait until they are attached (the contextmenu guard is one of them). */
const bound = (page: Page, id: string) =>
  expect.poll(() => page.getByTestId(`entry-${id}`).evaluate((el) => !el.dispatchEvent(new MouseEvent('contextmenu', { cancelable: true })))).toBe(true);

async function lift(page: Page, id: string) {
  await bound(page, id);
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
  // the destination day has its own entry, so the flip loads data and re-renders the column under the drag
  const [id, other] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }, { name: 'Jonas', start: '2026-10-13T12:00' }]);
  const { y } = await lift(page, id);
  await page.mouse.move(3, y, { steps: 6 });
  await expect.poll(() => page.evaluate(() => (window as any).__vizitai.ui.get().date)).toBe('2026-10-13'); // eslint-disable-line @typescript-eslint/no-explicit-any
  await expect(page.getByTestId(`entry-${other}`)).toBeVisible();
  await expect(page.getByTestId('drag-ghost')).toBeVisible();
  await page.mouse.move(200, y, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await start(page, id)()).slice(0, 10)).toBe('2026-10-13');
});

test('a quick swipe never starts a drag', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await bound(page, id);
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

const dragState = (page: Page) =>
  page.evaluate(() => { const d = (window as any).__vizitai.ui.get().drag; return d ? (d.entry.appt.id as string) : null; }); // eslint-disable-line @typescript-eslint/no-explicit-any

/** Synthetic touch pointers (distinct pointerIds): Playwright's mouse has only one pointer. */
async function touch(page: Page, id: string, type: 'pointerdown' | 'pointermove' | 'pointerup', pointerId: number, x: number, y: number) {
  await page.getByTestId(`entry-${id}`).evaluate((el, a) => {
    el.dispatchEvent(new PointerEvent(a.type, { bubbles: true, cancelable: true, pointerId: a.pointerId, pointerType: 'touch', isPrimary: a.pointerId === 11, clientX: a.x, clientY: a.y }));
  }, { type, pointerId, x, y });
}

test('a second finger holding another entry cannot take over the drag', async ({ page }) => {
  await openApp(page);
  const [a, b] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }, { name: 'Rasa', start: '2026-10-14T11:30' }]);
  await expect(page.getByTestId(`entry-${b}`)).toBeVisible();
  const row = await rowHeight(page);
  const boxA = (await page.getByTestId(`entry-${a}`).boundingBox())!;
  const boxB = (await page.getByTestId(`entry-${b}`).boundingBox())!;
  const ax = boxA.x + boxA.width / 2, ay = boxA.y + 10, bx = boxB.x + boxB.width / 2, by = boxB.y + 10;
  await bound(page, a);
  await bound(page, b);
  await touch(page, a, 'pointerdown', 11, ax, ay);
  await page.waitForTimeout(450);
  expect(await dragState(page)).toBe(a);
  await touch(page, a, 'pointermove', 11, ax, ay + 2 * row + 3);
  await touch(page, b, 'pointerdown', 12, bx, by);
  await page.waitForTimeout(450);
  expect(await dragState(page)).toBe(a);
  await touch(page, b, 'pointerup', 12, bx, by);
  expect(await dragState(page)).toBe(a);
  await touch(page, a, 'pointerup', 11, ax, ay + 2 * row + 3);
  await expect.poll(start(page, a)).toBe('2026-10-14T10:30');
  expect(await dragState(page)).toBeNull();
  expect(await apptState(page, b)).toMatchObject({ start: '2026-10-14T11:30', moves: [] });
});

test('two entries held at once: only the first to reach 400 ms lifts', async ({ page }) => {
  await openApp(page);
  const [a, b] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }, { name: 'Rasa', start: '2026-10-14T11:30' }]);
  await expect(page.getByTestId(`entry-${b}`)).toBeVisible();
  const boxA = (await page.getByTestId(`entry-${a}`).boundingBox())!;
  const boxB = (await page.getByTestId(`entry-${b}`).boundingBox())!;
  const ax = boxA.x + boxA.width / 2, ay = boxA.y + 10, bx = boxB.x + boxB.width / 2, by = boxB.y + 10;
  await bound(page, a);
  await bound(page, b);
  await touch(page, a, 'pointerdown', 11, ax, ay);
  await touch(page, b, 'pointerdown', 12, bx, by); // B's hold starts before A lifts
  await page.waitForTimeout(600);
  expect(await dragState(page)).toBe(a);
  await touch(page, b, 'pointerup', 12, bx, by);
  await touch(page, a, 'pointerup', 11, ax, ay);
  await expect.poll(() => dragState(page)).toBeNull();
  expect((await apptState(page, a)).moves).toHaveLength(0);
  expect((await apptState(page, b)).moves).toHaveLength(0);
});

test('holding still while lifted does not re-render the app every frame', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await lift(page, id);
  const writes = await page.evaluate(async () => {
    const { ui } = (window as any).__vizitai; // eslint-disable-line @typescript-eslint/no-explicit-any
    let n = 0;
    const off = ui.subscribe(() => { n++; });
    await new Promise((r) => setTimeout(r, 500));
    off();
    return n;
  });
  expect(writes).toBe(0);
  await page.mouse.up();
});
