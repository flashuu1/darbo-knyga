import { test, expect, type Page } from '@playwright/test';
import { openApp, seedAppts, pickTime } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Types the name on the first screen and presses return (keyboard "Toliau") to reach Paslauga. */
async function nameThenEnter(page: Page, name: string) {
  await page.getByTestId('field-name').fill(name);
  await page.getByTestId('field-name').press('Enter');
}
const apptCount = (page: Page) => page.evaluate(() => (window as any).__vizitai.db.appointments.count());  

async function expectLinkedToSeeded(page: Page) {
  await expect.poll(() => apptCount(page)).toBe(2);
  const r = await page.evaluate(async () => {
    const { db } = (window as any).__vizitai;  
    const clients = await db.clients.toArray();
    const appts = await db.appointments.toArray();
    return { clients: clients.length, ids: appts.map((a: { clientId: string }) => a.clientId), id: clients[0]?.id };
  });
  expect(r.clients).toBe(1);
  expect(r.ids).toEqual([r.id, r.id]);
}

test('booking from an empty slot takes 3 taps plus typing the name', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    (window as any).__taps = 0;  
    document.addEventListener('click', (e) => { if (e.isTrusted) (window as any).__taps++; }, true);  
  });
  await page.getByTestId('slot-2026-10-14T10:30').click();               // tap 1
  await expect(page.getByTestId('field-name')).toBeFocused();             // keyboard up without a tap
  await nameThenEnter(page, 'Žydrūnė');                                  // typing + return, no tap
  await expect(page.getByTestId('flow-who')).toHaveText('Žydrūnė');
  await page.getByTestId('svc-1').click();                               // tap 2 (Dažymas card)
  await page.getByTestId('btn-save').click();                            // tap 3
  expect(await page.evaluate(() => (window as any).__taps)).toBe(3);      
  await expect(page.getByTestId('sheet')).toHaveCount(0);
  await expect(page.getByTestId('col-2026-10-14')).toContainText('Žydrūnė');
  await expect(page.getByTestId('col-2026-10-14')).toContainText('Dažymas');
});

test('Toliau is disabled until a name is typed, and return does nothing on an empty name', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('slot-2026-10-14T10:30').click();
  await expect(page.getByTestId('btn-next')).toBeDisabled();
  await page.getByTestId('field-name').fill('  ');
  await expect(page.getByTestId('btn-next')).toBeDisabled();
  await page.getByTestId('field-name').press('Enter');
  await expect(page.getByTestId('svc-0')).toBeHidden(); // still on the first screen
  await page.getByTestId('field-name').fill('Ona');
  await expect(page.getByTestId('btn-next')).toBeEnabled();
  await page.getByTestId('btn-next').click();
  await expect(page.getByTestId('svc-0')).toBeVisible();
});

test('Atgal returns to the client screen and keeps the name', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('slot-2026-10-14T10:30').click();
  await nameThenEnter(page, 'Ona');
  await expect(page.getByTestId('svc-0')).toBeVisible();
  await page.getByTestId('btn-back').click();
  await expect(page.getByTestId('field-name')).toBeVisible();
  await expect(page.getByTestId('field-name')).toHaveValue('Ona');
});

test('searching "zydrune" finds Žydrūnė; tapping it links that client and goes straight to the services', async ({ page }) => {
  await openApp(page);
  await seedAppts(page, [{ name: 'Žydrūnė', start: '2026-10-13T10:00', service: 2 }]);
  await page.getByTestId('slot-2026-10-14T11:00').click();
  await page.getByTestId('field-name').fill('zydrune');
  await expect(page.getByTestId('suggest-0')).toContainText('Žydrūnė');
  await page.getByTestId('suggest-0').click();
  await expect(page.getByTestId('svc-2')).toHaveClass(/on/); // last service preselected
  await page.getByTestId('btn-save').click();
  await expect(page.getByTestId('sheet')).toHaveCount(0);
  await expectLinkedToSeeded(page);
});

test('typing an existing name exactly, without tapping a suggestion, links that client', async ({ page }) => {
  await openApp(page);
  await seedAppts(page, [{ name: 'Žydrūnė', start: '2026-10-13T10:00', service: 2 }]);
  await page.getByTestId('slot-2026-10-14T11:00').click();
  await nameThenEnter(page, 'Žydrūnė');
  await page.getByTestId('btn-save').click();
  await expect(page.getByTestId('sheet')).toHaveCount(0);
  await expectLinkedToSeeded(page);
});

test('a double tap on Išsaugoti creates exactly one appointment', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('slot-2026-10-14T10:30').click();
  await nameThenEnter(page, 'Ona');
  await page.getByTestId('btn-save').dblclick();
  await expect(page.getByTestId('sheet')).toHaveCount(0);
  await expect.poll(() => apptCount(page)).toBe(1);
});

test('empty name field lists the recent clients', async ({ page }) => {
  await openApp(page);
  await seedAppts(page, [{ name: 'Ona', start: '2026-10-13T10:00' }, { name: 'Jonas', start: '2026-10-13T11:00' }]);
  await page.getByTestId('slot-2026-10-14T11:00').click();
  await expect(page.getByTestId('suggest-0')).toContainText('Jonas');
  await expect(page.getByTestId('suggest-1')).toContainText('Ona');
});

test('an overlap warns on the first Išsaugoti and saves on the second', async ({ page }) => {
  await openApp(page);
  await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await page.getByTestId('slot-2026-10-14T10:15').click();
  await nameThenEnter(page, 'Jonas');
  await page.getByTestId('time-row').click();
  await pickTime(page, '10:00'); // 15-minute defaults: the same start clashes
  await page.getByTestId('btn-save-time').click();
  await expect(page.getByTestId('overlap-warning')).toHaveText('Šiuo laiku jau užregistruota: Ona – Kirpimas');
  await expect(page.getByTestId('sheet')).toBeVisible();
  await page.getByTestId('btn-save-time').click();
  await expect(page.getByTestId('sheet')).toHaveCount(0);
  await expect.poll(() => apptCount(page)).toBe(2);
});

test('Asmeninis is picked from her own choices (no typing) and skips the services', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('slot-2026-10-14T12:00').click();
  await page.getByTestId('type-personal').click();
  for (const word of ['Psichologas', 'Psichiatras / psichiatrė', 'Neurologas / neurologė', 'Daktaras']) await expect(page.getByTestId('option-list')).toContainText(word); // common words, ready to pick
  await expect(page.getByTestId('field-name')).toHaveCount(0);
  await expect(page.getByTestId('btn-next')).toBeDisabled();
  await page.getByTestId('option-0').click(); // Psichologas
  await page.getByTestId('btn-next').click();
  await expect(page.getByTestId('svc-0')).toBeHidden();
  await expect(page.getByTestId('timewheel')).toBeVisible(); // straight to Laikas
  await page.getByTestId('btn-save-time').click();
  await expect(page.getByTestId('col-2026-10-14')).toContainText('Psichologas');
  // half an hour by default, and not the grey of "no colour"
  const [a] = await page.evaluate(async () => (window as any).__vizitai.db.appointments.toArray());
  const slot = (await page.getByTestId('slot-2026-10-14T12:00').boundingBox())!, box = (await page.getByTestId(`entry-${a.id}`).boundingBox())!;
  expect(Math.round(box.height / slot.height)).toBe(2);
  expect(await page.getByTestId(`entry-${a.id}`).evaluate((el) => (el as HTMLElement).style.getPropertyValue('--svc'))).toBe('var(--c-teal)');
});

test('the calendar picker books another day and time', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('slot-2026-10-14T10:30').click();
  await nameThenEnter(page, 'Ona');
  await page.getByTestId('time-row').click();
  await expect(page.getByTestId('pick-month')).toHaveText('spalis 2026');
  await page.getByTestId('pick-next').click();
  await expect(page.getByTestId('pick-month')).toHaveText('lapkritis 2026');
  await page.getByTestId('pick-day-2026-11-03').click();
  await pickTime(page, '14:30');
  await page.getByTestId('btn-back').click();
  await expect(page.getByTestId('time-value')).toHaveText('lapkričio 3 d., an · 14:30');
  await page.getByTestId('btn-save').click();
  await expect(page.getByTestId('sheet')).toHaveCount(0);
  await expect.poll(() => page.evaluate(async () => (await (window as any).__vizitai.db.appointments.toArray()).map((a: { start: string }) => a.start))).toEqual(['2026-11-03T14:30']);  
});

test('Atšaukti closes the booking without saving', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('slot-2026-10-14T10:30').click();
  await page.getByTestId('field-name').fill('Ona');
  await page.getByTestId('btn-dismiss').click();
  await expect(page.getByTestId('sheet')).toHaveCount(0);
  expect(await apptCount(page)).toBe(0);
});

test('"+" proposes the next free slot today and dayStart on other days', async ({ page }) => {
  await openApp(page, '2026-10-14T09:05:00');
  await page.getByTestId('btn-add').click();
  await expect.poll(() => page.evaluate(() => (window as any).__vizitai.ui.get().sheet?.start)).toBe('2026-10-14T09:15');  
  await expect(page.getByTestId('field-name')).toBeFocused();
  await page.getByTestId('btn-dismiss').click();
  await expect(page.getByTestId('sheet')).toHaveCount(0);
  await page.getByTestId('chip-2026-10-15').click();
  await page.getByTestId('btn-add').click();
  await expect.poll(() => page.evaluate(() => (window as any).__vizitai.ui.get().sheet?.start)).toBe('2026-10-15T08:00');  
});

test('the time wheels book any minute, not just quarter hours', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('slot-2026-10-14T10:30').click();
  await nameThenEnter(page, 'Ona');
  await page.getByTestId('time-row').click();
  await pickTime(page, '14:37');
  await expect(page.getByTestId('wheel-h-14')).toHaveClass(/on/);
  await expect(page.getByTestId('wheel-m-37')).toHaveClass(/on/);
  await page.getByTestId('btn-back').click();
  await expect(page.getByTestId('time-value')).toHaveText('spalio 14 d., tr · 14:37');
  await page.getByTestId('btn-save').click();
  await expect(page.getByTestId('sheet')).toHaveCount(0);
  await expect.poll(() => page.evaluate(async () => (await (window as any).__vizitai.db.appointments.toArray()).map((a: { start: string }) => a.start))).toEqual(['2026-10-14T14:37']);  
});

test('the wheels can be scrolled, and the picked row follows the scroll', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('slot-2026-10-14T10:30').click();
  await nameThenEnter(page, 'Ona');
  await page.getByTestId('time-row').click();
  await expect(page.getByTestId('wheel-h-10')).toHaveClass(/on/);
  await page.getByTestId('wheel-m').evaluate((el) => { el.scrollTop = 17 * 44; });
  await expect(page.getByTestId('wheel-m-17')).toHaveClass(/on/);
  await page.getByTestId('btn-save-time').click();
  await expect.poll(() => page.evaluate(async () => (await (window as any).__vizitai.db.appointments.toArray()).map((a: { start: string }) => a.start))).toEqual(['2026-10-14T10:17']);  
});

test('typing two letters suggests matching clients, best match first, and tapping one fills it in', async ({ page }) => {
  await openApp(page);
  await seedAppts(page, [
    { name: 'Ona Jonaitė', start: '2026-10-01T10:00' }, { name: 'Jonas Petraitis', start: '2026-10-02T10:00' },
    { name: 'Jonė Kazlauskienė', start: '2026-10-03T10:00' }, { name: 'Jonė Kazlauskienė', start: '2026-10-04T10:00' },
    { name: 'Marijona Šimkutė', start: '2026-10-05T10:00' }, { name: 'Rasa', start: '2026-10-06T10:00' },
  ]);
  await page.getByTestId('slot-2026-10-14T13:00').click();
  await page.getByTestId('field-name').fill('jo');
  await expect(page.getByTestId('suggest-0')).toContainText('Jonė Kazlauskienė'); // starts with it, booked most
  await expect(page.getByTestId('suggest-1')).toContainText('Jonas Petraitis');
  await expect(page.getByTestId('suggest-2')).toContainText('Ona Jonaitė'); // a later word starts with it
  await expect(page.getByTestId('suggest-3')).toContainText('Marijona Šimkutė'); // contains it
  await expect(page.getByTestId('suggest-4')).toHaveCount(0);
  await page.getByTestId('suggest-1').click();
  await expect(page.getByTestId('flow-who')).toHaveText('Jonas Petraitis');
});

test('the minute wheel is loose: nothing makes it stop at every number, and the number under the bar lights up while it turns', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('slot-2026-10-14T10:30').click();
  await page.getByTestId('field-name').fill('Ona');
  await page.getByTestId('btn-next').click();
  await page.getByTestId('time-row').click();
  await page.waitForTimeout(450);
  // snapping is on, but it never forces a stop at each number (that is what made a fling die after one or two rows)
  const css = await page.getByTestId('wheel-m-07').evaluate((el) => ({ stop: getComputedStyle(el).scrollSnapStop, type: getComputedStyle(el.parentElement!).scrollSnapType }));
  expect(css.stop).toBe('normal');
  expect(css.type).toContain('mandatory');
  // turning the wheel moves the highlight at once, before the value is settled
  await page.getByTestId('wheel-m').evaluate((el) => { el.scrollTop = 47 * 44; });
  await expect(page.getByTestId('wheel-m-47')).toHaveClass(/on/);
  await expect(page.getByTestId('wheel-m-30')).not.toHaveClass(/on/);
  await page.getByTestId('btn-save-time').click();
  await expect.poll(async () => (await page.evaluate(async () => (window as any).__vizitai.db.appointments.toArray()))[0]?.start).toBe('2026-10-14T10:47');
});

test('a long list of choices in Asmeninis keeps its full height and scrolls, so the last one can be picked', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('slot-2026-10-14T12:00').click();
  await page.getByTestId('type-personal').click();
  await page.waitForTimeout(450);
  const g = await page.evaluate(() => { const p = document.querySelector('.flow-pane') as HTMLElement; const ul = document.querySelector('[data-testid="option-list"]') as HTMLElement; return { scroll: p.scrollHeight, client: p.clientHeight, ul: ul.getBoundingClientRect().height }; });
  expect(g.ul).toBeGreaterThan(12 * 50); // not squeezed: every row has its own height
  expect(g.scroll).toBeGreaterThan(g.client); // so the pane has something to scroll
  await page.evaluate(() => { const p = document.querySelector('.flow-pane') as HTMLElement; p.scrollTop = p.scrollHeight; });
  await page.waitForTimeout(100);
  const pane = (await page.locator('.flow-pane').first().boundingBox())!, last = (await page.getByTestId('option-11').boundingBox())!;
  expect(last.y + last.height).toBeLessThanOrEqual(pane.y + pane.height + 1); // the last one is on screen
  await page.getByTestId('option-11').click();
  await expect(page.getByTestId('option-11')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('btn-next')).toBeEnabled();
});
