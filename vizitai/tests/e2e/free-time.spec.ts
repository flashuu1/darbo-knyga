import { test, expect, type Page } from '@playwright/test';
import { openApp, openSettings } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */
const NOW = '2026-10-14T12:00:00'; // Wednesday; the week is 12–18 October
const MON = '2026-10-12', TUE = '2026-10-13', WED = '2026-10-14', THU = '2026-10-15', FRI = '2026-10-16', SAT = '2026-10-17';

/**
 * A week the way a hairdresser's looks: Monday to Wednesday full from 11 to 18, Thursday with one free hour (15:00),
 * Friday with two (14:00–16:00), Saturday with an afternoon (14:00–18:00). Every service is an hour long.
 */
async function week(page: Page, opts: { workDays?: number[] } = {}) {
  await page.evaluate(async (o) => {
    const { repo } = (window as any).__vizitai;
    for (const s of await repo.listServices()) await repo.updateService(s.id, { minutes: 60 });
    await repo.updateSettings({ workDays: o.workDays ?? [0, 1, 2, 3, 4, 5] });
    const svc = (await repo.listServices(true))[0];
    let n = 0;
    const visit = (d: string, h: number) => repo.createAppointment({ kind: 'client', name: `Klientas ${++n}`, serviceId: svc.id, start: `${d}T${String(h).padStart(2, '0')}:00` });
    for (const d of ['2026-10-12', '2026-10-13']) for (let h = 11; h < 18; h++) await visit(d, h);
    for (let h = 12; h < 18; h++) await visit('2026-10-14', h); // today, from now on
    for (const h of [11, 12, 13, 14, 16, 17]) await visit('2026-10-15', h);
    for (const h of [11, 12, 13, 16, 17]) await visit('2026-10-16', h);
    for (const h of [11, 12, 13]) await visit('2026-10-17', h);
  }, opts);
}
const goWeek = async (page: Page) => { await page.getByTestId('seg-week').click(); await expect(page.getByTestId('free-rec')).toBeVisible(); await page.waitForTimeout(500); };
const title = (page: Page) => page.getByTestId('free-rec-title');
const setSettings = (page: Page, s: Record<string, unknown>) => page.evaluate((x) => (window as any).__vizitai.repo.updateSettings(x), s);
const ghosts = (page: Page) => page.locator('[data-testid^="free-20"]');

test.describe('the week view shows where a new visit fits', () => {
  test('dashed free slots only where a visit fits, in the window, and the pill names the best', async ({ page }) => {
    await openApp(page, NOW);
    await week(page);
    await goWeek(page);
    await expect(ghosts(page)).toHaveCount(3); // Thursday 15–16, Friday 14–16, Saturday 14–18
    for (const id of [`free-${THU}T15:00`, `free-${FRI}T14:00`, `free-${SAT}T14:00`]) await expect(page.getByTestId(id)).toBeVisible();
    await expect(title(page)).toHaveText('Geriausias: šeštadienis 14:00'); // the most room
    await expect(page.getByTestId('free-rec-sub')).toContainText('laisva 4 val');
    await expect(page.getByTestId(`free-${SAT}T14:00`)).toHaveClass(/best/);
    await expect(page.getByTestId(`free-${THU}T15:00`)).not.toHaveClass(/best/);
    // nothing shows in the day view or the month
    await page.getByTestId('seg-day').click();
    await expect(page.getByTestId('free-rec')).toHaveCount(0);
    await expect(ghosts(page)).toHaveCount(0);
  });

  test('the slot is inside the window and in the grid at the right time', async ({ page }) => {
    await openApp(page, NOW);
    await week(page);
    await goWeek(page);
    const g = (await page.getByTestId(`free-${THU}T15:00`).boundingBox())!;
    const col = (await page.locator(`[data-col-date="${THU}"]`).boundingBox())!;
    const slot = (await page.getByTestId(`slot-${THU}T15:00`).boundingBox())!, slot16 = (await page.getByTestId(`slot-${THU}T16:00`).boundingBox())!;
    expect(Math.abs(g.y - slot.y)).toBeLessThan(3); // it starts at 15:00 ...
    expect(Math.abs(g.y + g.height - slot16.y)).toBeLessThan(3); // ... and ends at 16:00
    expect(g.x).toBeGreaterThanOrEqual(col.x); expect(g.x + g.width).toBeLessThanOrEqual(col.x + col.width + 1);
  });

  test('"Tiksliausią" suggests the gap that fits (Thursday 15:00); a tap on the pill shows the next ones', async ({ page }) => {
    await openApp(page, NOW);
    await week(page);
    await setSettings(page, { recMode: 'fit' });
    await goWeek(page);
    await expect(title(page)).toHaveText('Geriausias: ketvirtadienis 15:00');
    await expect(page.getByTestId('free-rec-sub')).toContainText('laisva 1 val');
    await page.getByTestId('free-rec').click();
    await expect(title(page)).toHaveText(/^2-as variantas: /);
    await expect(page.locator('.ghost.best')).toHaveCount(1);
    await page.getByTestId('free-rec').click();
    await expect(title(page)).toHaveText(/^3-as variantas: /);
    await page.getByTestId('free-rec').click();
    await expect(title(page)).toHaveText('Geriausias: ketvirtadienis 15:00'); // round again
  });

  test('another week shows its own best time, and back again shows this week\'s', async ({ page }) => {
    await openApp(page, NOW);
    await week(page);
    await goWeek(page);
    await expect(title(page)).toHaveText('Geriausias: šeštadienis 14:00');
    await page.evaluate(() => (window as any).__vizitai.ui.set({ date: '2026-10-21' })); // the week after: empty
    await page.waitForTimeout(600);
    await expect(title(page)).not.toHaveText('Geriausias: šeštadienis 14:00');
    await expect(title(page)).toContainText('Geriausias: ');
    await expect(page.getByTestId('free-2026-10-19T11:00')).toBeVisible(); // Monday of that week is free from 11
    await expect(page.getByTestId(`free-${SAT}T14:00`)).toHaveCount(0);
    await page.evaluate(() => (window as any).__vizitai.ui.set({ date: '2026-10-14' }));
    await page.waitForTimeout(600);
    await expect(title(page)).toHaveText('Geriausias: šeštadienis 14:00');
    await expect(page.getByTestId(`free-${SAT}T14:00`)).toBeVisible();
  });

  test('a full week says so, and the pill takes her to the next week', async ({ page }) => {
    await openApp(page, NOW);
    await week(page);
    await setSettings(page, { workDays: [0, 1, 2] }); // only the full days work
    await goWeek(page);
    await expect(ghosts(page)).toHaveCount(0);
    await expect(title(page)).toHaveText('Šią savaitę laisvo laiko nėra');
    await page.getByTestId('free-rec').click();
    await page.waitForTimeout(600);
    await expect(title(page)).toContainText('Geriausias: '); // next week: nothing booked
    await expect(page.getByTestId('title')).toContainText('spalio 19');
  });
});

test.describe('what counts as free', () => {
  test('past time today, a cancelled visit, Nedirbu and the days she does not work', async ({ page }) => {
    await openApp(page, NOW);
    await week(page, { workDays: [0, 1, 2, 3, 4, 5, 6] }); // Sunday works too: it is empty
    await goWeek(page);
    await expect(page.getByTestId('free-2026-10-18T11:00')).toBeVisible(); // Sunday, an empty day
    await setSettings(page, { workDays: [0, 1, 2, 3, 4, 5] });
    await expect(page.getByTestId('free-2026-10-18T11:00')).toHaveCount(0); // not a working day any more
    // a cancelled visit frees its hour on Thursday: 14:00–16:00
    await page.evaluate(async () => {
      const { db } = (window as any).__vizitai;
      const a = (await db.appointments.toArray()).find((x: any) => x.start === '2026-10-15T14:00');
      await db.appointments.update(a.id, { status: 'cancelled', cancelReason: 'client' });
    });
    await expect(page.getByTestId(`free-${THU}T14:00`)).toBeVisible();
    await expect(page.getByTestId(`free-${THU}T15:00`)).toHaveCount(0);
    // Nedirbu from 14:00 to 15:00 takes it away again
    await page.evaluate(async () => { const { repo } = (window as any).__vizitai; await repo.createAppointment({ kind: 'personal', title: 'Nedirbu', minutes: 120, start: '2026-10-15T14:00' }); });
    await expect(page.getByTestId(`free-${THU}T14:00`)).toHaveCount(0);
    await expect(page.getByTestId(`free-${THU}T15:00`)).toHaveCount(0);
    // days that are over never show anything
    await expect(page.locator(`[data-testid^="free-${MON}"], [data-testid^="free-${TUE}"]`)).toHaveCount(0);
  });

  test('today: only from the next quarter after now', async ({ page }) => {
    await openApp(page, '2026-10-14T13:07:00');
    await page.evaluate(async () => { for (const s of await (window as any).__vizitai.repo.listServices()) await (window as any).__vizitai.repo.updateService(s.id, { minutes: 60 }); });
    await goWeek(page);
    await expect(page.getByTestId(`free-${WED}T13:15`)).toBeVisible();
    await expect(page.getByTestId(`free-${WED}T11:00`)).toHaveCount(0);
  });
});

test.describe('a tap on a free slot opens Nauja > Klientas with the time filled in', () => {
  const startOf = async (page: Page) => { // type a name, go on: the time row shows where the visit starts
    await expect(page.getByTestId('field-name')).toBeVisible();
    await page.getByTestId('field-name').fill('Ona');
    await page.getByTestId('field-name').press('Enter');
    await expect(page.getByTestId('time-value')).toBeVisible();
    return page.getByTestId('time-value').textContent();
  };
  test('Thursday 15:00: the Klientas screen opens with the name field, and the visit is booked at 15:00', async ({ page }) => {
    await openApp(page, NOW);
    await week(page);
    await goWeek(page);
    await page.getByTestId(`free-${THU}T15:00`).click();
    await expect(page.getByTestId('type-client')).toHaveAttribute('aria-pressed', 'true');
    expect(await startOf(page)).toContain('15:00');
    await page.getByTestId('btn-save').click();
    await expect.poll(() => page.evaluate(async () => ((await (window as any).__vizitai.db.appointments.toArray()) as any[]).filter((a) => a.start === '2026-10-15T15:00').length)).toBe(1);
    await expect(page.getByTestId(`free-${THU}T15:00`)).toHaveCount(0); // it is not free any more
    await expect(ghosts(page)).toHaveCount(2);
  });

  /** Taps the Saturday gap (14:00–18:00, 16 rows) at a visible height `at` px below the top of what is visible, and says where the visit should start. */
  async function tapSaturday(page: Page, where: 'middle' | 'bottom') {
    const sc = page.getByTestId('timeline');
    if (where === 'bottom') { const b = await page.getByTestId(`free-${SAT}T14:00`).boundingBox(); await sc.evaluate((el, bottom) => { el.scrollTop += bottom - (el.getBoundingClientRect().bottom - 30); }, b!.y + b!.height); } // the end of the gap just above the bottom of the screen
    else { const top = (await page.getByTestId(`free-${SAT}T14:00`).boundingBox())!.y; await sc.evaluate((el, y) => { el.scrollTop += y - el.getBoundingClientRect().top - 20; }, top); } // scroll down to it, as a finger would
    await page.waitForTimeout(250);
    const g = (await page.getByTestId(`free-${SAT}T14:00`).boundingBox())!, v = (await sc.boundingBox())!;
    const y = where === 'bottom' ? Math.min(g.y + g.height - 4, v.y + v.height - 6) : Math.max(g.y, v.y) + 150;
    const row = g.height / 16;
    await page.mouse.click(g.x + g.width / 2, y);
    return Math.min(14 * 60 + Math.floor((y - g.y) / row) * 15, 17 * 60);
  }
  test('a tap lower in a long gap starts there', async ({ page }) => {
    await openApp(page, NOW);
    await week(page);
    await goWeek(page);
    const expected = await tapSaturday(page, 'middle');
    expect(await startOf(page)).toContain(`${String(Math.floor(expected / 60)).padStart(2, '0')}:${String(expected % 60).padStart(2, '0')}`);
  });
  test('a tap at the very bottom of a long gap starts at 17:00: never so late that the visit would not fit', async ({ page }) => {
    await openApp(page, NOW);
    await week(page);
    await goWeek(page);
    await tapSaturday(page, 'bottom');
    expect(await startOf(page)).toContain('17:00');
  });

  test('the glowing slot is brought into view when the pill is tapped', async ({ page }) => {
    await openApp(page, NOW);
    await week(page);
    await setSettings(page, { recMode: 'fit' });
    await goWeek(page);
    await page.getByTestId('free-rec').click();
    await page.waitForTimeout(900);
    const g = (await page.locator('.ghost.best').boundingBox())!, scroller = (await page.getByTestId('timeline').boundingBox())!;
    expect(g.y).toBeGreaterThanOrEqual(scroller.y - 1); // its top is in view (a long gap may be taller than the screen)
    expect(g.y).toBeLessThan(scroller.y + scroller.height - 40);
  });
});

test.describe('Nustatymai > Darbo laikas: the recommended time', () => {
  test('the window, the length and the order are values, 11–18 and one hour to start with, and they change what is shown', async ({ page }) => {
    await openApp(page, NOW);
    await week(page);
    await openSettings(page, 'hours');
    await expect(page.getByTestId('rec-from')).toHaveValue('11:00');
    await expect(page.getByTestId('rec-to')).toHaveValue('18:00');
    await expect(page.getByTestId('rec-minutes')).toHaveText('1 val');
    await expect(page.getByTestId('rec-mode-free')).toHaveAttribute('aria-pressed', 'true');
    // two hours: Thursday's single hour no longer fits
    await page.getByTestId('rec-plus').click(); await page.getByTestId('rec-plus').click(); await page.getByTestId('rec-plus').click(); await page.getByTestId('rec-plus').click();
    await expect(page.getByTestId('rec-minutes')).toHaveText('2 val');
    await page.getByTestId('rec-mode-fit').click();
    await expect.poll(() => page.evaluate(async () => { const s = await (window as any).__vizitai.repo.getSettings(); return [s.recMinutes, s.recMode]; })).toEqual([120, 'fit']);
    await page.getByTestId('settings-back').click(); await page.waitForTimeout(450);
    await page.getByTestId('tab-calendar').click();
    await goWeek(page);
    await expect(page.getByTestId(`free-${THU}T15:00`)).toHaveCount(0);
    await expect(page.getByTestId(`free-${FRI}T14:00`)).toBeVisible();
    await expect(title(page)).toHaveText('Geriausias: penktadienis 14:00'); // the gap that fits two hours exactly
    // a window that starts at 14:00 leaves the afternoon only
    await setSettings(page, { recFrom: '14:00', recMinutes: 60, recMode: 'free' });
    await page.waitForTimeout(400);
    await expect(ghosts(page)).toHaveCount(3);
    await expect(page.getByTestId(`free-${SAT}T14:00`)).toBeVisible();
    await setSettings(page, { recFrom: '16:00' });
    await expect(page.getByTestId(`free-${THU}T15:00`)).toHaveCount(0); // before the window
    await expect(page.getByTestId(`free-${SAT}T16:00`)).toBeVisible(); // Saturday from 16:00
  });

  test('a window that ends before it starts is refused', async ({ page }) => {
    await openApp(page, NOW);
    await openSettings(page, 'hours');
    await page.getByTestId('rec-to').fill('10:00');
    await page.getByTestId('rec-to').blur();
    await expect(page.getByTestId('toast')).toContainText('Pabaiga');
    await expect(page.getByTestId('rec-to')).toHaveValue('18:00');
  });
});
