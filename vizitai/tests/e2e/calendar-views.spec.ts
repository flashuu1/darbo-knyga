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

test('in Week view, two overlapping entries stay inside their own day column', async ({ page }) => {
  await openApp(page);
  const ids = await seedAppts(page, [{ name: 'Ona', start: '2026-10-15T10:00' }, { name: 'Jonas', start: '2026-10-15T10:15' }]);
  await page.getByTestId('seg-week').click();
  await expect(page.getByTestId(`entry-${ids[1]}`)).toBeVisible();
  // one frame, so a late scroll cannot skew the comparison
  const geo = await page.getByTestId('col-2026-10-15').evaluate((col, list) => {
    const c = col.getBoundingClientRect();
    return list.map((id) => {
      const r = col.querySelector(`[data-entry-id="${id}"]`)!.getBoundingClientRect();
      return { insideLeft: r.left >= c.left - 0.5, insideRight: r.right <= c.right + 0.5, width: r.width, half: c.width / 2 };
    });
  }, ids);
  for (const g of geo) {
    expect(g).toMatchObject({ insideLeft: true, insideRight: true });
    expect(g.width).toBeLessThanOrEqual(g.half + 0.5);
  }
});
