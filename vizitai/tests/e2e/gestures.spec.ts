import { test, expect, type Page } from '@playwright/test';
import { apptState, openApp, seedAppts } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Dispatches a touch sequence (single finger) on an element, like a phone does. */
async function touchSwipe(page: Page, testId: string, from: { dx?: number; dy?: number }, steps = [0.3, 0.6, 1], pause = 0) {
  await page.evaluate(async ({ testId, from, steps, pause }) => {
    const el = document.querySelector(`[data-testid="${testId}"]`)!;
    const r = el.getBoundingClientRect();
    const x0 = r.left + r.width / 2, y0 = r.top + r.height / 2;
    const fire = (type: string, x: number, y: number) => {
      const t = { identifier: 1, target: el, clientX: x, clientY: y, pageX: x, pageY: y };
      const ev = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(ev, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], targetTouches: type === 'touchend' ? [] : [t] });
      el.dispatchEvent(ev);
    };
    fire('touchstart', x0, y0);
    for (const s of steps) { fire('touchmove', x0 + (from.dx ?? 0) * s, y0 + (from.dy ?? 0) * s); if (pause) await new Promise((r) => setTimeout(r, pause)); }
    fire('touchend', x0 + (from.dx ?? 0), y0 + (from.dy ?? 0));
  }, { testId, from, steps, pause });
}

test('a visit sheet closes by swiping down from anywhere on it, not just the top', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T15:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await page.waitForTimeout(450);
  await touchSwipe(page, 'appt-status', { dy: 260 }); // the middle of the sheet
  await expect(page.getByTestId('sheet')).toHaveCount(0);
});

test('a short or sideways touch on the sheet does not close it, and it springs back', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T15:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await page.waitForTimeout(450);
  const y0 = (await page.getByTestId('sheet').boundingBox())!.y;
  await touchSwipe(page, 'appt-status', { dy: 40 }, [0.5, 1], 70); // a slow, short pull
  await page.waitForTimeout(500);
  expect(Math.abs((await page.getByTestId('sheet').boundingBox())!.y - y0)).toBeLessThan(2);
  await touchSwipe(page, 'appt-status', { dx: 200, dy: 20 }, [0.3, 0.6, 1], 30);
  await page.waitForTimeout(300);
  await expect(page.getByTestId('sheet')).toBeVisible();
});

test('swiping up never closes a sheet and a tap on a button inside still works', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T15:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await page.waitForTimeout(450);
  await touchSwipe(page, 'appt-status', { dy: -200 });
  await page.waitForTimeout(300);
  await expect(page.getByTestId('sheet')).toBeVisible();
  await page.getByTestId('act-move').click();
  await expect(page.getByTestId('move-sheet')).toBeVisible();
});

test('the time wheels inside Perkelti scroll without closing the sheet', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T15:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await page.getByTestId('act-move').click();
  await page.waitForTimeout(500);
  await touchSwipe(page, 'wheel-m', { dy: 220 });
  await page.waitForTimeout(300);
  await expect(page.getByTestId('move-sheet')).toBeVisible();
});

test('the main button of the booking flow sits at the bottom, and rides up above the keyboard', async ({ page }) => {
  await openApp(page);
  const vh = page.viewportSize()!.height;
  await page.getByTestId('slot-2026-10-14T10:30').click();
  await page.getByTestId('field-name').fill('Ona');
  await page.waitForTimeout(450);
  const closed = (await page.getByTestId('btn-next').boundingBox())!;
  expect(closed.y + closed.height).toBeGreaterThan(vh - 60); // at the bottom
  expect(closed.height).toBeGreaterThanOrEqual(44);
  // keyboard up: iOS shrinks the visual viewport
  await page.evaluate(() => {
    const vv = window.visualViewport!;
    Object.defineProperty(vv, 'height', { configurable: true, get: () => window.innerHeight - 336 });
    vv.dispatchEvent(new Event('resize'));
  });
  await expect.poll(async () => { const b = (await page.getByTestId('btn-next').boundingBox())!; return b.y + b.height; }).toBeLessThan(vh - 300);
  await expect.poll(async () => { const b = (await page.getByTestId('btn-next').boundingBox())!; return b.y + b.height; }).toBeGreaterThan(vh - 400);
  // next screen: the same button position, now "Išsaugoti"
  await page.getByTestId('btn-next').click();
  await page.evaluate(() => { Object.defineProperty(window.visualViewport!, 'height', { configurable: true, get: () => window.innerHeight }); window.visualViewport!.dispatchEvent(new Event('resize')); });
  await expect(page.getByTestId('btn-save')).toBeVisible();
  await expect.poll(async () => { const b = (await page.getByTestId('btn-save').boundingBox())!; return Math.round(b.y); }).toBe(Math.round(closed.y));
});

test('every screen of the flow has its main button in the same place', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('slot-2026-10-14T10:30').click();
  await page.getByTestId('field-name').fill('Ona');
  await page.waitForTimeout(450);
  const a = (await page.getByTestId('btn-next').boundingBox())!;
  await page.getByTestId('btn-next').click();
  await expect(page.getByTestId('btn-save')).toBeVisible();
  const b = (await page.getByTestId('btn-save').boundingBox())!;
  await page.getByTestId('time-row').click();
  await expect(page.getByTestId('btn-save-time')).toBeVisible();
  await page.waitForTimeout(450);
  const c = (await page.getByTestId('btn-save-time').boundingBox())!;
  for (const x of [b, c]) { expect(Math.abs(x.y - a.y)).toBeLessThan(2); expect(Math.abs(x.height - a.height)).toBeLessThan(2); }
});

test('the status reads Laukiama, then Nepatvirtinta, then Įvyko once the amount is in', async ({ page }) => {
  await openApp(page, '2026-10-14T10:40:00');
  const [future, past] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T15:00' }, { name: 'Rasa', start: '2026-10-14T09:00' }]);
  await page.getByTestId(`entry-${future}`).click();
  await expect(page.getByTestId('appt-status')).toHaveText('Laukiama');
  await page.getByTestId('btn-close').click();
  await expect(page.getByTestId('sheet')).toHaveCount(0);
  await page.getByTestId(`entry-${past}`).click(); // due: opens Suma
  await page.getByTestId('amount-open-appt').click();
  await expect(page.getByTestId('appt-status')).toHaveText('Nepatvirtinta');
  await page.evaluate(async (x) => (window as any).__vizitai.repo.setAmount(x, 3000), past);
  await expect(page.getByTestId('appt-status')).toHaveText('Įvyko');
  expect((await apptState(page, past)).amountCents).toBe(3000);
});
