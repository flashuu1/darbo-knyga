import { test, expect, type Page } from '@playwright/test';
import { openApp, openSettings, seedAppts } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */
const NOW = '2026-10-14T12:00:00'; // Wednesday; the week is 12–18 October
const count = (page: Page) => page.evaluate(async () => ((await (window as any).__vizitai.db.appointments.toArray()) as any[]).filter((a) => a.kind === 'client').length);

/** Starts a booking for `name` on Friday 16 October 14:00 and presses Išsaugoti. */
async function book(page: Page, name = 'Ona Petraitė', day = '2026-10-16', time = '14:00') {
  await page.evaluate((d) => (window as any).__vizitai.ui.set({ date: d }), day);
  await page.getByTestId(`slot-${day}T${time}`).click();
  await page.getByTestId('field-name').fill(name);
  await page.getByTestId('field-name').press('Enter');
  await expect(page.getByTestId('btn-save')).toBeVisible();
  await page.getByTestId('btn-save').click();
}

test.describe('a person who already has a visit that week', () => {
  test('is warned about, with where it is: the lines, and the week with her visit lit and the new one dashed', async ({ page }) => {
    await openApp(page, NOW);
    const [id] = await seedAppts(page, [{ name: 'Ona Petraitė', start: '2026-10-15T10:00' }]);
    await book(page);
    await expect(page.getByTestId('action-title')).toHaveText('Ona jau turi vizitą šioje savaitėje');
    await expect(page.getByTestId('action-line-0')).toContainText('ketvirtadienis');
    await expect(page.getByTestId('action-line-0')).toContainText('spalio 15');
    await expect(page.getByTestId('action-line-0')).toContainText('10:00');
    await expect(page.getByTestId('same-week-map')).toBeVisible();
    await expect(page.getByTestId(`same-week-mine-${id}`)).toBeVisible();
    await expect(page.getByTestId('same-week-new')).toBeVisible();
    // the lit bar is in the Thursday column, the dashed one in the Friday column
    const cols = await page.locator('.wk-day').evaluateAll((els) => els.map((e) => ({ mine: !!e.querySelector('.mine'), fresh: !!e.querySelector('.fresh') })));
    expect(cols.findIndex((c) => c.mine)).toBe(3);
    expect(cols.findIndex((c) => c.fresh)).toBe(4);
    expect(await count(page)).toBe(1); // nothing saved yet
  });

  test('"Vis tiek registruoti" books it anyway', async ({ page }) => {
    await openApp(page, NOW);
    await seedAppts(page, [{ name: 'Ona Petraitė', start: '2026-10-15T10:00' }]);
    await book(page);
    await page.getByTestId('action-item-0').click();
    await expect.poll(() => count(page)).toBe(2);
    await expect(page.getByTestId('btn-save')).toHaveCount(0); // the sheet is closed
    await expect(page.getByTestId('action-title')).toHaveCount(0); // and it did not ask again
  });

  test('"Atmesti naują įrašą" throws the new one away and closes the sheet', async ({ page }) => {
    await openApp(page, NOW);
    await seedAppts(page, [{ name: 'Ona Petraitė', start: '2026-10-15T10:00' }]);
    await book(page);
    await page.getByTestId('action-item-2').click();
    await expect(page.getByTestId('btn-save')).toHaveCount(0);
    await page.waitForTimeout(400);
    expect(await count(page)).toBe(1);
  });

  test('"Rodyti savaitėje" goes to the week and lights her visit there', async ({ page }) => {
    await openApp(page, NOW);
    const [id] = await seedAppts(page, [{ name: 'Ona Petraitė', start: '2026-10-15T10:00' }]);
    await book(page);
    await page.getByTestId('action-item-1').click();
    await expect(page.getByTestId('seg-week')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId(`entry-${id}`)).toHaveClass(/highlight/);
    expect(await count(page)).toBe(1); // the new one was not made
  });

  test('"Pakeisti" goes back to the booking with everything still in it', async ({ page }) => {
    await openApp(page, NOW);
    await seedAppts(page, [{ name: 'Ona Petraitė', start: '2026-10-15T10:00' }]);
    await book(page);
    await page.getByTestId('action-item-3').click();
    await expect(page.getByTestId('btn-save')).toBeVisible();
    await expect(page.getByTestId('flow-who')).toHaveText('Ona Petraitė');
    expect(await count(page)).toBe(1);
  });

  test('two visits that week: both are listed and counted', async ({ page }) => {
    await openApp(page, NOW);
    await seedAppts(page, [{ name: 'Ona Petraitė', start: '2026-10-13T09:00' }, { name: 'Ona Petraitė', start: '2026-10-15T10:00' }]);
    await book(page);
    await expect(page.getByTestId('action-title')).toHaveText('Ona jau turi vizitų šioje savaitėje: 2');
    await expect(page.getByTestId('action-line-0')).toContainText('antradienis');
    await expect(page.getByTestId('action-line-1')).toContainText('ketvirtadienis');
    await expect(page.locator('.wk-bar.mine')).toHaveCount(2);
  });

  test('also a visit earlier this week that is already over, and a name typed in other letters', async ({ page }) => {
    await openApp(page, NOW);
    await seedAppts(page, [{ name: 'Ona Petraitė', start: '2026-10-12T09:00' }]); // Monday: over
    await book(page, 'ona petraite');
    await expect(page.getByTestId('action-title')).toHaveText('ona jau turi vizitą šioje savaitėje');
    await expect(page.getByTestId('action-line-0')).toContainText('pirmadienis');
  });

  test('not warned: another week, another person, a cancelled visit', async ({ page }) => {
    await openApp(page, NOW);
    await seedAppts(page, [{ name: 'Ona Petraitė', start: '2026-10-22T10:00' }, { name: 'Rasa Kazlauskienė', start: '2026-10-15T10:00' }, { name: 'Gintarė Stankutė', start: '2026-10-15T11:00' }]);
    await page.evaluate(async () => { const { db } = (window as any).__vizitai; const a = (await db.appointments.toArray()).find((x: any) => x.start === '2026-10-15T11:00'); await db.appointments.update(a.id, { status: 'cancelled', cancelReason: 'client' }); });
    await book(page); // Ona: her only visit is next week
    await expect(page.getByTestId('action-title')).toHaveCount(0);
    await expect.poll(() => count(page)).toBe(4);
    await book(page, 'Gintarė Stankutė', '2026-10-16', '16:00'); // hers is cancelled
    await expect(page.getByTestId('action-title')).toHaveCount(0);
    await expect.poll(() => count(page)).toBe(5);
  });

  test('a time that is also taken is asked about first, then the week', async ({ page }) => {
    await openApp(page, NOW);
    await seedAppts(page, [{ name: 'Ona Petraitė', start: '2026-10-15T10:00' }, { name: 'Rasa Kazlauskienė', start: '2026-10-16T14:00' }]);
    await page.evaluate(() => (window as any).__vizitai.ui.set({ sheet: { type: 'new', start: '2026-10-16T14:00' } })); // the slot itself is covered by Rasa's visit
    await page.getByTestId('field-name').fill('Ona Petraitė');
    await page.getByTestId('field-name').press('Enter');
    await page.getByTestId('btn-save').click();
    await expect(page.getByTestId('action-title')).toContainText('Šiuo laiku jau yra įrašas');
    await page.getByTestId('action-item-0').click(); // vis tiek išsaugoti
    await expect(page.getByTestId('action-title')).toContainText('Ona jau turi vizitą šioje savaitėje');
    await page.getByTestId('action-item-0').click();
    await expect.poll(() => count(page)).toBe(3);
  });

  test('a visit of her own (Asmeninis) or an expense is never asked about', async ({ page }) => {
    await openApp(page, NOW);
    await seedAppts(page, [{ name: 'Ona Petraitė', start: '2026-10-15T10:00' }]);
    await page.evaluate(() => (window as any).__vizitai.ui.set({ date: '2026-10-16' }));
    await page.getByTestId('slot-2026-10-16T14:00').click();
    await page.getByTestId('type-personal').click();
    await page.getByTestId('option-off').click();
    await expect(page.getByTestId('action-title')).toHaveCount(0);
  });
});

test('a visit from Monday that is still waiting for its amount counts the same: booking her again on Friday warns, and lists it', async ({ page }) => {
  await openApp(page, '2026-10-15T12:00:00'); // Thursday
  const [id] = await seedAppts(page, [{ name: 'Ona Petraitė', start: '2026-10-12T10:00' }]); // Monday, no amount ever entered
  await expect.poll(() => page.evaluate(async (x) => ((await (window as any).__vizitai.repo.getAppointment(x)) as any).amountCents ?? null, id)).toBeNull();
  await book(page, 'Ona Petraitė', '2026-10-16', '14:00');
  await expect(page.getByTestId('action-title')).toHaveText('Ona jau turi vizitą šioje savaitėje');
  await expect(page.getByTestId('action-line-0')).toContainText('pirmadienis');
  await expect(page.getByTestId(`same-week-mine-${id}`)).toBeVisible();
  await page.getByTestId('action-item-0').click(); // vis tiek
  await expect.poll(() => count(page)).toBe(2);
});

test('after "Taip, užregistruoti dar kartą" the visit she has just paid is not news: no warning for it', async ({ page }) => {
  await openApp(page, NOW);
  const [id] = await seedAppts(page, [{ name: 'Ona Petraitė', start: '2026-10-14T08:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await page.getByTestId('amount-input').fill('40');
  await page.getByTestId('amount-confirm').click();
  await page.getByTestId('again-yes').click();
  await page.getByTestId('btn-save-time').click();
  await expect(page.getByTestId('action-title')).toHaveCount(0);
  await expect.poll(() => count(page)).toBe(2);
});

test.describe('Nustatymai > Darbo laikas: the note under the switch', () => {
  test('is short and sits below the switch, not under it', async ({ page }) => {
    await openApp(page, NOW);
    await openSettings(page, 'hours');
    const seg = (await page.locator('.lq-seg.wide').boundingBox())!, foot = page.locator('.lq-seg.wide + .section-foot');
    const f = (await foot.boundingBox())!;
    expect(f.y, 'the note is covered by the switch').toBeGreaterThanOrEqual(seg.y + seg.height + 4);
    expect(((await foot.textContent()) ?? '').length, 'the note is too long').toBeLessThanOrEqual(100);
    await expect(foot).toContainText('Laisviausią');
    await expect(foot).toContainText('Tiksliausią');
  });
});
