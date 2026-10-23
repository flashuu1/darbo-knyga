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

/** Puts the entry in the middle of the timeline, away from the auto-scroll zones at its edges. */
async function centre(page: Page, id: string) {
  await page.evaluate((x) => {
    const el = document.querySelector(`[data-testid="entry-${x}"]`)!;
    const sc = document.querySelector('[data-testid="timeline"]')!;
    sc.scrollTop += el.getBoundingClientRect().top - (sc.getBoundingClientRect().top + sc.getBoundingClientRect().height * 0.4);
  }, id);
  await page.waitForTimeout(60);
}
async function lift(page: Page, id: string) {
  // a busy machine can move the grid under the press or swallow it: measure again and try the long press up to four times
  let x = 0, y = 0;
  for (let attempt = 0; attempt < 4; attempt++) {
    await centre(page, id);
    await bound(page, id);
    await page.waitForTimeout(150);
    const box = (await page.getByTestId(`entry-${id}`).boundingBox())!;
    x = box.x + box.width / 2; y = box.y + 10;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.waitForTimeout(450);
    if (await page.getByTestId('drag-ghost').isVisible()) break;
    await page.mouse.move(5, 5); // let go away from the entry, so the failed press is not a tap that opens its sheet
    await page.mouse.up();
    await page.waitForTimeout(300);
  }
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
  await centre(page, a);
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

test('the lifted entry follows the finger in every direction, not only up and down', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  const { x, y } = await lift(page, id);
  const g0 = (await page.getByTestId('drag-ghost').boundingBox())!;
  await page.mouse.move(x - 60, y + 90, { steps: 6 });
  await expect.poll(async () => (await page.getByTestId('drag-ghost').boundingBox())!.x).toBeCloseTo(g0.x - 60, -1);
  await expect.poll(async () => (await page.getByTestId('drag-ghost').boundingBox())!.y).toBeCloseTo(g0.y + 90, -1);
  await page.mouse.up();
});

test('hovering a day in the week strip highlights it, and dropping there moves the entry to that day', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  const { x, y } = await lift(page, id);
  const chip = (await page.getByTestId('chip-2026-10-17').boundingBox())!;
  await page.mouse.move(x, y - 20, { steps: 3 });
  await page.mouse.move(chip.x + chip.width / 2, chip.y + chip.height / 2, { steps: 8 });
  await expect(page.getByTestId('chip-2026-10-17')).toHaveClass(/drop/);
  await page.mouse.up();
  await expect.poll(async () => (await apptState(page, id)).start).toBe('2026-10-17T10:00');
});

test('holding over the last day of the strip pages to the next week, so any date can be reached', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  const { x, y } = await lift(page, id);
  const sun = (await page.getByTestId('chip-2026-10-18').boundingBox())!;
  await page.mouse.move(x, y - 20, { steps: 3 });
  await page.mouse.move(sun.x + sun.width / 2, sun.y + sun.height / 2, { steps: 8 });
  await expect(page.getByTestId('chip-2026-10-25')).toBeVisible({ timeout: 4000 }); // the strip now shows 19-25 October
  const mon = (await page.getByTestId('chip-2026-10-22').boundingBox())!;
  await page.mouse.move(mon.x + mon.width / 2, mon.y + mon.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await apptState(page, id)).start).toBe('2026-10-22T10:00');
});

test('in Savaitė, holding a lifted entry at the right edge turns to the next week, says so, and the drop lands there', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await page.getByTestId('seg-week').click();
  await expect.poll(() => page.getByTestId('timeline').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  const { y } = await lift(page, id);
  const width = page.viewportSize()!.width;
  await page.mouse.move(width - 3, y, { steps: 8 });
  await expect(page.getByTestId('edge-hint')).toBeVisible(); // the edge lights up while she holds there
  await expect.poll(() => page.evaluate(() => (window as any).__vizitai.ui.get().date)).toBe('2026-10-21'); // eslint-disable-line @typescript-eslint/no-explicit-any
  await expect(page.getByTestId('turn-note')).toContainText('Kita savaitė');
  await expect(page.getByTestId('turn-note')).toContainText('spalio 19');
  await expect(page.getByTestId('col-2026-10-22')).toBeVisible(); // the next week is on screen, the ghost is still in her hand
  await expect(page.getByTestId('drag-ghost')).toBeVisible();
  await page.mouse.move(width - 3, y, { steps: 1 });
  await page.mouse.move(60, y, { steps: 4 }); // leave the edge: it stops turning
  await page.waitForTimeout(900);
  expect(await page.evaluate(() => (window as any).__vizitai.ui.get().date)).toBe('2026-10-21'); // eslint-disable-line @typescript-eslint/no-explicit-any
  const target = (await page.getByTestId('col-2026-10-22').boundingBox())!;
  await page.mouse.move(target.x + target.width / 2, y, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await start(page, id)()).slice(0, 10)).toBe('2026-10-22');
  await expect(page.getByTestId('toast')).toContainText('Perkelta');
});

test('in Savaitė, the left edge goes back a week, and the page does not turn when she is not at an edge', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await page.getByTestId('seg-week').click();
  await expect.poll(() => page.getByTestId('timeline').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  const { y } = await lift(page, id);
  await page.mouse.move(200, y, { steps: 4 });
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => (window as any).__vizitai.ui.get().date)).toBe('2026-10-14'); // eslint-disable-line @typescript-eslint/no-explicit-any
  await expect(page.getByTestId('edge-hint')).toHaveCount(0);
  await page.mouse.move(3, y, { steps: 6 });
  await expect.poll(() => page.evaluate(() => (window as any).__vizitai.ui.get().date)).toBe('2026-10-07'); // eslint-disable-line @typescript-eslint/no-explicit-any
  await expect(page.getByTestId('turn-note')).toContainText('Ankstesnė savaitė');
  await page.mouse.move(200, y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => (await start(page, id)()).slice(0, 10)).toMatch(/^2026-10-(0[6-9]|1[01])$/); // dropped in the previous week
});

test('letting go while the week is still turning is safe: the entry stays a single entry', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await page.getByTestId('seg-week').click();
  await expect.poll(() => page.getByTestId('timeline').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  const { y } = await lift(page, id);
  await page.mouse.move(page.viewportSize()!.width - 3, y, { steps: 6 });
  await expect.poll(() => page.evaluate(() => (window as any).__vizitai.ui.get().date)).toBe('2026-10-21'); // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.mouse.up(); // released right at the edge, over no column: nothing is moved
  await expect(page.getByTestId('drag-ghost')).toHaveCount(0);
  expect(await page.evaluate(async () => (await (window as any).__vizitai.db.appointments.toArray()).length)).toBe(1); // eslint-disable-line @typescript-eslint/no-explicit-any
  expect((await apptState(page, id)).moves.length).toBeLessThanOrEqual(1);
});

test('turning back onto the current week says "Ši savaitė", not "Ankstesnė savaitė"', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await page.getByTestId('seg-week').click();
  await expect.poll(() => page.getByTestId('timeline').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  const { y } = await lift(page, id);
  const width = page.viewportSize()!.width;
  await page.mouse.move(width - 3, y, { steps: 6 });
  await expect.poll(() => page.evaluate(() => (window as any).__vizitai.ui.get().date)).toBe('2026-10-21'); // eslint-disable-line @typescript-eslint/no-explicit-any
  await expect(page.getByTestId('turn-note')).toContainText('Kita savaitė');
  await page.mouse.move(200, y, { steps: 4 }); // out of the edge: it stops turning
  await page.mouse.move(3, y, { steps: 6 }); // and back the other way
  await expect.poll(() => page.evaluate(() => (window as any).__vizitai.ui.get().date)).toBe('2026-10-14'); // eslint-disable-line @typescript-eslint/no-explicit-any
  await expect(page.getByTestId('turn-note')).toContainText('Ši savaitė');
  await expect(page.getByTestId('turn-note')).not.toContainText('Ankstesnė');
  await expect(page.getByTestId('turn-note')).toContainText('spalio 12'); // with its dates
  await page.mouse.move(200, y, { steps: 4 });
  await page.mouse.up();
});
