import { test, expect } from '@playwright/test';
import { openApp, seedAppts } from './helpers';

test('opens on today with a Lithuanian title and week strip', async ({ page }) => {
  await openApp(page);
  await expect(page.getByTestId('title')).toHaveText('spalio 14 d., trečiadienis');
  await expect(page.getByTestId('chip-2026-10-14')).toHaveClass(/sel/);
  await expect(page.getByTestId('empty-day')).toHaveText('Šią dieną vizitų nėra');
});

test('entries render at their times and a bookings dot appears', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Žydrūnė', start: '2026-10-14T10:00' }]);
  const entry = page.getByTestId(`entry-${id}`);
  await expect(page.getByTestId('backup-banner')).toBeVisible(); // it shifts the grid; measure after it appears
  await expect(entry).toContainText('10:00');
  await expect(entry).toContainText('Žydrūnė');
  const slot = await page.getByTestId('slot-2026-10-14T10:00').boundingBox();
  const box = await entry.boundingBox();
  expect(Math.abs(box!.y - slot!.y)).toBeLessThan(2);
  await expect(page.getByTestId('chip-2026-10-14').locator('.dot.on')).toHaveCount(1);
});

test('tapping an empty row opens the new sheet for that slot', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('slot-2026-10-14T10:30').click();
  const sheet = await page.evaluate(() => (window as any).__vizitai.ui.get().sheet); // eslint-disable-line @typescript-eslint/no-explicit-any
  expect(sheet).toMatchObject({ type: 'new', start: '2026-10-14T10:30' });
});

test('the week strip and Šiandien change the day', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('chip-2026-10-16').click();
  await expect(page.getByTestId('title')).toHaveText('spalio 16 d., penktadienis');
  await page.getByTestId('btn-today').click();
  await expect(page.getByTestId('title')).toHaveText('spalio 14 d., trečiadienis');
});

test('a booking at 10:00 on the DST change day still shows 10:00', async ({ page }) => {
  await openApp(page, '2026-10-25T09:00:00');
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-25T10:00' }]);
  await expect(page.getByTestId(`entry-${id}`)).toContainText('10:00');
});

test('a booking outside working hours stays visible', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T06:30' }]);
  await expect(page.getByTestId(`entry-${id}`)).toBeVisible();
  await expect(page.getByTestId('slot-2026-10-14T06:30')).toBeVisible();
});

test('switching days scrolls to the new day\'s first booking and keeps the empty message accurate', async ({ page }) => {
  await openApp(page);
  const [, late] = await seedAppts(page, [
    { name: 'Ona', start: '2026-10-14T09:00' },
    { name: 'Jonas', start: '2026-10-15T16:00' },
  ]);
  await expect(page.getByTestId('empty-day')).toHaveCount(0);
  await page.getByTestId('chip-2026-10-15').click();
  const entry = page.getByTestId(`entry-${late}`);
  await expect(entry).toBeVisible();
  await expect(page.getByTestId('empty-day')).toHaveCount(0);
  await expect.poll(async () => {
    const e = await entry.boundingBox();
    const s = await page.getByTestId('timeline').boundingBox();
    return !!e && !!s && e.y >= s.y && e.y + e.height <= s.y + s.height;
  }).toBe(true);
  await page.getByTestId('chip-2026-10-16').click();
  await expect(page.getByTestId('empty-day')).toHaveText('Šią dieną vizitų nėra');
});

test('today shows a red now line at the current time, scrolled into view, and it moves with the clock', async ({ page }) => {
  await openApp(page, '2026-10-14T13:05:00');
  const line = page.getByTestId('now-line');
  await expect(line).toBeVisible();
  const at = async (slot: string) => {
    const l = (await line.boundingBox())!, s = (await page.getByTestId(`slot-2026-10-14T${slot}`).boundingBox())!;
    return l.y + l.height / 2 - (s.y + (5 / 15) * s.height);
  };
  await expect.poll(async () => Math.abs(await at('13:00'))).toBeLessThan(2.5); // 13:05 is a third of the 13:00 row (once the first scroll to now has finished)
  const tl = (await page.getByTestId('timeline').boundingBox())!;
  const l = (await line.boundingBox())!;
  expect(l.y).toBeGreaterThan(tl.y);
  expect(l.y).toBeLessThan(tl.y + tl.height); // auto-scrolled to now
  await expect(page.getByTestId('now-label')).toHaveText('13:05');
  await page.clock.fastForward('30:00');
  await expect(page.getByTestId('now-label')).toHaveText('13:35');
  await page.getByTestId('chip-2026-10-15').click();
  await expect(page.getByTestId('now-line')).toHaveCount(0); // only on today
});

test('hour labels sit on their hour line', async ({ page }) => {
  await openApp(page);
  await expect(page.getByTestId('slot-2026-10-14T10:00')).toBeVisible();
  // measured in one frame: the timeline scrolls itself to "now" right after it opens
  await expect.poll(() => page.evaluate(() => {
    const l = [...document.querySelectorAll('.hour-label')].find((e) => e.textContent === '10:00')!.getBoundingClientRect();
    const s = document.querySelector('[data-testid="slot-2026-10-14T10:00"]')!.getBoundingClientRect();
    return Math.abs(l.top + l.height / 2 - s.top) < 1.5;
  })).toBe(true);
});

test('the empty-day message is centred in the visible timeline, stays put while scrolling and lets taps through', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('chip-2026-10-16').click();
  const msg = page.getByTestId('empty-day');
  await expect(msg).toHaveText('Šią dieną vizitų nėra');
  const centre = async () => { const b = (await page.getByTestId('empty-day-wrap').locator('.empty-card').boundingBox())!; return b.y + b.height / 2; };
  const tl = (await page.getByTestId('timeline').boundingBox())!;
  const c1 = await centre();
  expect(Math.abs(c1 - (tl.y + tl.height / 2))).toBeLessThan(3);
  await page.getByTestId('timeline').evaluate((el) => { el.scrollTop += 300; });
  expect(Math.abs((await centre()) - c1)).toBeLessThan(1);
  const box = (await msg.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2); // the slot underneath gets the tap
  await expect.poll(() => page.evaluate(() => (window as any).__vizitai.ui.get().sheet?.type)).toBe('new'); // eslint-disable-line @typescript-eslint/no-explicit-any
});
