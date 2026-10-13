import { test, expect, type Page } from '@playwright/test';
import { openApp } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */
/** A touch sequence on an element: each step is the list of [x, y] finger positions (first = start, last = end). */
async function fingers(page: Page, testId: string, steps: [number, number][][], pause = 0) {
  await page.evaluate(async ({ testId, steps, pause }) => {
    const el = document.querySelector(`[data-testid="${testId}"]`)!;
    const r = el.getBoundingClientRect();
    for (let i = 0; i < steps.length; i++) {
      const type = i === 0 ? 'touchstart' : i === steps.length - 1 ? 'touchend' : 'touchmove';
      const list = steps[i]!.map(([x, y], n) => ({ identifier: n + 1, target: el, clientX: r.left + x, clientY: r.top + y, pageX: r.left + x, pageY: r.top + y }));
      const ev = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(ev, { touches: type === 'touchend' ? [] : list, changedTouches: list, targetTouches: type === 'touchend' ? [] : list });
      el.dispatchEvent(ev);
      if (pause) await new Promise((res) => setTimeout(res, pause));
    }
  }, { testId, steps, pause });
}
const rowHeight = (page: Page) => page.evaluate(() => document.querySelector('[data-testid="slot-2026-10-14T10:00"]')!.getBoundingClientRect().height);
const padTransform = (page: Page) => page.evaluate(() => (document.querySelector('.grid-pad') as HTMLElement).style.transform);
const swipe = (page: Page, dx: number, dy = 0) => fingers(page, 'timeline', [[[150, 300]], [[150 + dx * 0.3, 300 + dy * 0.3]], [[150 + dx * 0.6, 300 + dy * 0.6]], [[150 + dx, 300 + dy]], [[150 + dx, 300 + dy]]], 20);

test('fingers together show more of the day (smaller hours), fingers apart make them bigger, and it is remembered', async ({ page }) => {
  await openApp(page);
  await expect(page.getByTestId('slot-2026-10-14T10:00')).toBeVisible();
  const h0 = await rowHeight(page);
  await fingers(page, 'timeline', [[[150, 100], [150, 400]], [[150, 150], [150, 350]], [[150, 200], [150, 300]], [[150, 200], [150, 300]]]); // fingers together
  await expect.poll(() => rowHeight(page)).toBeLessThan(h0 * 0.6);
  const small = await rowHeight(page);
  expect(await page.evaluate(() => (window as any).__vizitai.ui.get().zoom)).toBeLessThan(0.6);
  expect(await page.evaluate(() => Number(localStorage.getItem('vizitai.zoom')))).toBeLessThan(0.6);
  await fingers(page, 'timeline', [[[150, 200], [150, 300]], [[150, 150], [150, 350]], [[150, 50], [150, 450]], [[150, 50], [150, 450]]]); // fingers apart
  await expect.poll(() => rowHeight(page)).toBeGreaterThan(small * 1.8);
});

test('zoomed far out, the whole working day fits on one screen, and the Week view uses the same zoom', async ({ page }) => {
  await openApp(page);
  await fingers(page, 'timeline', [[[150, 50], [150, 500]], [[150, 150], [150, 400]], [[150, 200], [150, 240]], [[150, 200], [150, 240]]]); // together
  await expect.poll(() => rowHeight(page)).toBeLessThan(20);
  const tl = (await page.getByTestId('timeline').boundingBox())!;
  const a = (await page.getByTestId('slot-2026-10-14T08:00').boundingBox())!, z = (await page.getByTestId('slot-2026-10-14T19:45').boundingBox())!;
  expect(z.y + z.height - a.y).toBeLessThan(tl.height); // 08:00-20:00 in one view, no scrolling
  await page.getByTestId('seg-week').click();
  await expect.poll(() => rowHeight(page)).toBeLessThan(20);
});

test('swiping sideways slides the day with the finger and then on to the next day', async ({ page }) => {
  await openApp(page);
  await expect(page.getByTestId('title')).toHaveText('spalio 14 d., trečiadienis');
  // while the finger is down the content follows it
  await fingers(page, 'timeline', [[[300, 300]], [[260, 302]], [[200, 304]]]); // no touchend yet: the last "step" above is a touchend, so re-send moves below
  await page.waitForTimeout(100);
  await expect(page.getByTestId('title')).toHaveText('spalio 15 d., ketvirtadienis'); // 100 px to the left is a swipe
  await expect.poll(() => padTransform(page)).toBe(''); // and it settles
  await swipe(page, 220);
  await expect(page.getByTestId('title')).toHaveText('spalio 14 d., trečiadienis');
});

test('while the finger is down the content follows it', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="timeline"]')!;
    const fire = (type: string, x: number, y: number) => {
      const t = { identifier: 1, target: el, clientX: x, clientY: y };
      const ev = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(ev, { touches: type === 'touchend' ? [] : [t], changedTouches: [t] });
      el.dispatchEvent(ev);
    };
    (window as any).__fire = fire;
    fire('touchstart', 300, 300);
    fire('touchmove', 260, 302);
    fire('touchmove', 200, 304);
  });
  await expect.poll(() => padTransform(page)).toContain('translateX(-90px)');
  await page.evaluate(() => (window as any).__fire('touchmove', 290, 304)); // back towards the start...
  await page.evaluate(() => (window as any).__fire('touchend', 290, 304)); // ...and let go too early: it springs back
  await expect.poll(() => padTransform(page)).toBe('');
  await expect(page.getByTestId('title')).toHaveText('spalio 14 d., trečiadienis');
});

test('a mostly vertical drag never changes the day, and a short sideways drag springs back', async ({ page }) => {
  await openApp(page);
  await swipe(page, 40, 200);
  await swipe(page, -40);
  await page.waitForTimeout(500);
  await expect(page.getByTestId('title')).toHaveText('spalio 14 d., trečiadienis');
  await expect.poll(() => padTransform(page)).toBe('');
});

test('switching Diena and Savaitė slides the grid over and keeps the same hours in view', async ({ page }) => {
  await openApp(page);
  const top = () => page.getByTestId('timeline').evaluate((el) => el.scrollTop);
  await page.waitForTimeout(700); // let the first scroll to "now" finish
  const before = await top();
  await page.getByTestId('seg-week').click();
  await expect.poll(() => page.evaluate(() => document.querySelector('.grid')!.getAnimations().length)).toBeGreaterThan(0);
  await expect(page.getByTestId('col-2026-10-18')).toBeVisible();
  expect(Math.abs((await top()) - before)).toBeLessThan(2);
  await page.getByTestId('seg-day').click();
  await expect.poll(() => page.evaluate(() => document.querySelector('.grid')!.getAnimations().length)).toBeGreaterThan(0);
  expect(Math.abs((await top()) - before)).toBeLessThan(2);
});

test('zoomed far out only some hours get a label, and the labels come back when zoomed in', async ({ page }) => {
  await openApp(page);
  const visible = () => page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.hour-label')].filter((l) => getComputedStyle(l).display !== 'none').length);
  const all = await page.evaluate(() => document.querySelectorAll('.hour-label').length);
  expect(await visible()).toBe(all);
  await fingers(page, 'timeline', [[[150, 50], [150, 500]], [[150, 150], [150, 400]], [[150, 200], [150, 240]], [[150, 200], [150, 240]]]);
  await expect.poll(visible).toBeLessThan(all / 2);
  await fingers(page, 'timeline', [[[150, 200], [150, 240]], [[150, 150], [150, 400]], [[150, 50], [150, 500]], [[150, 50], [150, 500]]]);
  await expect.poll(visible).toBe(all);
});

test('the empty-day message fades out by itself and at once when she scrolls; a new empty day shows it again', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('chip-2026-10-16').click();
  const wrap = page.getByTestId('empty-day-wrap');
  await expect(wrap).not.toHaveClass(/gone/);
  await page.clock.fastForward(3000);
  await expect(wrap).toHaveClass(/gone/);
  await page.getByTestId('chip-2026-10-17').click(); // another empty day: shown again
  await expect(wrap).not.toHaveClass(/gone/);
  await page.waitForTimeout(600); // let the day settle
  await page.getByTestId('timeline').evaluate((el) => { el.scrollTop += 80; }); // a scroll the app did not make itself
  await expect(wrap).toHaveClass(/gone/);
});
