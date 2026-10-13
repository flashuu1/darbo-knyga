import { test, expect } from '@playwright/test';
import { openApp, seedAppts } from './helpers';

test('Savaitė shows seven columns with compact entries', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-15T10:00' }]);
  await page.getByTestId('seg-week').click();
  for (const d of ['2026-10-12', '2026-10-14', '2026-10-18']) await expect(page.getByTestId(`col-${d}`)).toBeVisible();
  await expect(page.getByTestId('col-2026-10-15').getByTestId(`entry-${id}`)).toContainText('Ona');
  await expect(page.getByTestId(`entry-${id}`)).toContainText('10:00');
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
  await expect(page.getByTestId('month-cell-2026-10-20').locator('.count')).toHaveText('2');
  await expect(page.getByTestId('month-cell-2026-10-21').locator('.count')).toHaveCount(0);
  await page.getByTestId('month-cell-2026-10-20').click();
  await expect(page.getByTestId('title')).toHaveText('spalio 20 d., antradienis');
});

test('Savaitė header chips open the day', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('seg-week').click();
  await page.getByTestId('weekhead-2026-10-16').click();
  await expect(page.getByTestId('title')).toHaveText('spalio 16 d., penktadienis');
});

test('swiping the month grid moves to the next and previous month', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('month-name').click();
  await expect(page.getByTestId('title')).toHaveText('spalis 2026');
  const swipe = (dx: number) => page.getByTestId('month').evaluate((el, d) => {
    const fire = (type: string, x: number) => {
      const ev = new Event(type, { bubbles: true });
      const pt = { clientX: x, clientY: 200 };
      Object.assign(ev, { touches: type === 'touchend' ? [] : [pt], changedTouches: [pt] });
      el.dispatchEvent(ev);
    };
    fire('touchstart', 200); fire('touchend', 200 + d);
  }, dx);
  await swipe(-120);
  await expect(page.getByTestId('title')).toHaveText('lapkritis 2026');
  await swipe(120);
  await swipe(120);
  await expect(page.getByTestId('title')).toHaveText('rugsėjis 2026');
});

/** Bounding boxes of every entry card and "+N" chip in a column, measured in one frame. */
const boxes = (page: import('@playwright/test').Page, date: string) => page.getByTestId(`col-${date}`).evaluate((col) => {
  const c = col.getBoundingClientRect();
  return { col: { left: c.left, right: c.right }, items: [...col.querySelectorAll<HTMLElement>('[data-entry-box]')].map((el) => {
    const r = el.getBoundingClientRect();
    return { id: el.dataset.testid!, left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width };
  }) };
});
function expectNoIntersections(g: Awaited<ReturnType<typeof boxes>>, expected: number) {
  expect(g.items).toHaveLength(expected);
  for (const a of g.items) {
    expect(a.left).toBeGreaterThanOrEqual(g.col.left - 0.5);
    expect(a.right).toBeLessThanOrEqual(g.col.right + 0.5);
    for (const b of g.items) {
      if (a === b) continue;
      const overlap = a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
      expect(overlap, `${a.id} intersects ${b.id}`).toBe(false);
    }
  }
}
const crowd = [
  { name: 'Ona', start: '2026-10-15T10:00' }, { name: 'Jonas', start: '2026-10-15T10:00', service: 1 },
  { name: 'Rasa', start: '2026-10-15T10:00', service: 2 },
  { name: 'Asta', start: '2026-10-15T11:00' }, { name: 'Inga', start: '2026-10-15T11:00', service: 1 },
  { name: 'Eglė', start: '2026-10-15T11:00', service: 2 }, { name: 'Lina', start: '2026-10-15T11:00', service: 3 },
  { name: 'Rūta', start: '2026-10-15T11:00', service: 4 },
];

test('Day view: same-start entries sit side by side as equal cards and never intersect; 4+ collapse into "+N"', async ({ page }) => {
  await openApp(page);
  const ids = await seedAppts(page, crowd);
  await page.getByTestId('chip-2026-10-15').click();
  await expect(page.getByTestId(`entry-${ids[2]}`)).toBeVisible();
  await expect(page.getByTestId('more-2026-10-15T11:00')).toHaveText('+3'); // 5 at 11:00: two cards and "+3"
  const g = await boxes(page, '2026-10-15');
  expectNoIntersections(g, 3 + 2 + 1);
  const at10 = g.items.filter((b) => ids.slice(0, 3).some((id) => b.id === `entry-${id}`));
  expect(at10).toHaveLength(3);
  for (const b of at10) expect(Math.abs(b.width - at10[0]!.width)).toBeLessThan(1); // equal widths
  expect(at10[0]!.width).toBeGreaterThan((g.col.right - g.col.left) / 3 - 12);
  // the "+N" chip lists the hidden entries in an action sheet and opens one
  await page.getByTestId('more-2026-10-15T11:00').click();
  await expect(page.getByTestId('action-title')).toHaveText('Kiti vizitai šiuo metu');
  await expect(page.getByTestId('action-item-0')).toHaveText('11:00 · Eglė – Kirpimas ir dažymas');
  await page.getByTestId('action-item-2').click();
  await expect(page.getByTestId('appt-name')).toHaveText('Rūta');
});

test('Week view: overlapping entries stay inside their day column and never intersect', async ({ page }) => {
  await openApp(page);
  const ids = await seedAppts(page, crowd);
  await page.getByTestId('seg-week').click();
  await expect(page.getByTestId(`entry-${ids[0]}`)).toBeVisible();
  const g = await boxes(page, '2026-10-15');
  expectNoIntersections(g, 1 + 1 + 1 + 1); // two lanes: one card and "+N" at each time
  for (const b of g.items) expect(b.width).toBeLessThanOrEqual((g.col.right - g.col.left) / 2 + 0.5);
  await expect(page.getByTestId('more-2026-10-15T10:00')).toHaveText('+2');
  await expect(page.getByTestId('more-2026-10-15T11:00')).toHaveText('+4');
});
