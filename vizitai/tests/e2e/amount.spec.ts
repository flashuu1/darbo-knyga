import { test, expect, type Page } from '@playwright/test';
import { apptState, expectPickedTime, openApp, seedAppts, openSettings } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */
const amountOf = async (page: Page, id: string) => (await apptState(page, id)).amountCents;

test('a visit turns orange the moment its time passes, and not before', async ({ page }) => {
  await openApp(page, '2026-10-14T09:50:00');
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await expect(page.getByTestId(`entry-${id}`)).toBeVisible();
  await expect(page.getByTestId(`due-${id}`)).toHaveCount(0);
  await expect(page.getByTestId(`entry-${id}`)).not.toHaveClass(/entry--due/);
  await page.clock.fastForward(11 * 60 * 1000); // 10:01
  await expect(page.getByTestId(`entry-${id}`)).toHaveClass(/entry--due/);
  await expect(page.getByTestId(`due-${id}`)).toHaveText('Pridėti sumą');
});

test('tapping an orange visit adds the amount, which then shows on the entry; Anuliuoti undoes it', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T08:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await expect(page.getByTestId('amount-sheet')).toBeVisible();
  await expect(page.getByTestId('amount-input')).toBeFocused();
  await expect(page.getByTestId('amount-confirm')).toBeDisabled();
  await page.getByTestId('amount-input').fill('45,5');
  await expect(page.getByTestId('amount-confirm')).toBeEnabled();
  await page.getByTestId('amount-confirm').click();
  await expect(page.getByTestId('again-question')).toHaveText('Užregistruoti dar kartą?'); // the first amount of a visit asks this
  await page.getByTestId('again-no').click();
  await expect(page.getByTestId('amount-sheet')).toHaveCount(0);
  await expect.poll(() => amountOf(page, id)).toBe(4550);
  await expect(page.getByTestId(`amount-${id}`)).toContainText('45,50');
  await expect(page.getByTestId(`entry-${id}`)).not.toHaveClass(/entry--due/);
  await expect(page.getByTestId('toast')).toContainText('Suma išsaugota');
  await page.getByTestId('toast-undo').click();
  await expect.poll(() => amountOf(page, id)).toBeFalsy();
  await expect(page.getByTestId(`entry-${id}`)).toHaveClass(/entry--due/);
});

test('invalid amounts are refused, a dot works too', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T08:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await page.getByTestId('amount-input').fill('1,005');
  await expect(page.getByTestId('amount-invalid')).toBeVisible();
  await expect(page.getByTestId('amount-confirm')).toBeDisabled();
  await page.getByTestId('amount-input').fill('abc');
  await expect(page.getByTestId('amount-confirm')).toBeDisabled();
  await page.getByTestId('amount-input').fill('30.25');
  await page.getByTestId('amount-input').press('Enter');
  await expect.poll(() => amountOf(page, id)).toBe(3025);
});

test('the amount can be edited and cleared from the appointment sheet; clearing makes it orange again', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T08:00' }]);
  await page.evaluate(async (x) => (window as any).__vizitai.repo.setAmount(x, 2000), id);
  await page.getByTestId(`entry-${id}`).click(); // has an amount: opens the appointment sheet
  await expect(page.getByTestId('appt-amount')).toContainText('20,00');
  await page.getByTestId('appt-amount').click();
  await expect(page.getByTestId('amount-input')).toHaveValue('20');
  await page.getByTestId('amount-input').fill('25');
  await page.getByTestId('amount-confirm').click();
  await expect.poll(() => amountOf(page, id)).toBe(2500);
  await expect(page.getByTestId('toast')).toBeVisible();
  await expect(page.getByTestId('sheet')).toHaveCount(0);
  await page.getByTestId(`entry-${id}`).click();
  await page.getByTestId('appt-amount').click();
  await page.getByTestId('amount-input').fill('');
  await expect(page.getByTestId('amount-confirm')).toBeEnabled(); // empty + confirm asks, then clears
  await page.getByTestId('amount-confirm').click();
  await page.getByTestId('action-item-0').click(); // Nunulinti
  await expect.poll(() => amountOf(page, id)).toBeFalsy();
  await expect(page.getByTestId(`entry-${id}`)).toHaveClass(/entry--due/);
});

test('no-shows, cancelled, personal and future visits never ask for an amount', async ({ page }) => {
  await openApp(page);
  const [noshow, cancelled, future] = await seedAppts(page, [
    { name: 'A', start: '2026-10-14T08:00' }, { name: 'B', start: '2026-10-14T08:30' }, { name: 'C', start: '2026-10-14T15:00' },
  ]);
  await page.evaluate(async ([a, b]) => {
    const { repo } = (window as any).__vizitai;
    await repo.markNoShow(a);
    await repo.cancelAppointment(b, null);
    await repo.createAppointment({ kind: 'personal', title: 'Pietūs', start: '2026-10-14T08:45' });
  }, [noshow, cancelled]);
  await expect(page.getByTestId(`entry-${future}`)).toBeVisible();
  await expect(page.getByTestId(`entry-${noshow}`)).not.toHaveClass(/entry--due/);
  await expect(page.getByTestId(`entry-${future}`)).not.toHaveClass(/entry--due/);
  await expect(page.locator('.entry--due')).toHaveCount(0);
});

test('the amount survives export, clear and import', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T08:00' }]);
  await page.evaluate(async (x) => (window as any).__vizitai.repo.setAmount(x, 4550), id);
  const json = await page.evaluate(async () => {
    const { db } = (window as any).__vizitai;
    return JSON.stringify({ app: 'vizitai', schemaVersion: 1, exportedAt: '', clients: await db.clients.toArray(), appointments: await db.appointments.toArray(), services: await db.services.toArray(), settings: await db.settings.toArray() });
  });
  await page.evaluate(async () => {
    const { db } = (window as any).__vizitai;
    await Promise.all([db.clients.clear(), db.appointments.clear(), db.services.clear(), db.settings.clear()]);
  });
  await openSettings(page, 'backup');
  await page.getByTestId('import-input').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(json) });
  await page.getByTestId('action-item-0').click();
  await expect.poll(() => amountOf(page, id)).toBe(4550);
});

test('the amount sheet and its buttons are comfortable touch targets and dismiss cleanly', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T08:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await page.waitForTimeout(450); // the dialog scales in; measure at rest
  for (const tid of ['amount-confirm', 'btn-dismiss', 'amount-open-appt']) {
    const b = (await page.getByTestId(tid).boundingBox())!;
    expect(b.height).toBeGreaterThanOrEqual(44);
  }
  await page.getByTestId('btn-dismiss').click();
  await expect(page.getByTestId('amount-sheet')).toHaveCount(0);
  expect(await amountOf(page, id)).toBeFalsy();
});

test('the Suma sheet opens the number pad and its confirm button sits at the bottom, riding above the keyboard', async ({ page }) => {
  await openApp(page, '2026-10-14T10:40:00');
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T09:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await expect(page.getByTestId('amount-sheet')).toBeVisible();
  // the keyboard is raised inside the tap by the hidden field: it must already ask for the number pad
  expect(await page.getByTestId('kb-primer').getAttribute('inputmode')).toBe('decimal');
  expect(await page.getByTestId('amount-input').getAttribute('inputmode')).toBe('decimal');
  const vh = page.viewportSize()!.height;
  await page.waitForTimeout(450);
  const closed = (await page.getByTestId('amount-confirm').boundingBox())!;
  expect(closed.y + closed.height).toBeGreaterThan(vh - 60);
  expect(closed.height).toBeGreaterThanOrEqual(44);
  await page.evaluate(() => {
    const vv = window.visualViewport!;
    Object.defineProperty(vv, 'height', { configurable: true, get: () => window.innerHeight - 300 });
    vv.dispatchEvent(new Event('resize'));
  });
  await expect.poll(async () => { const b = (await page.getByTestId('amount-confirm').boundingBox())!; return b.y + b.height; }).toBeLessThan(vh - 250);
  // the options above stay: open the visit
  await expect(page.getByTestId('amount-open-appt')).toBeVisible();
  await page.getByTestId('amount-input').fill('30');
  await page.getByTestId('amount-confirm').click();
  await expect.poll(async () => (await apptState(page, id)).amountCents).toBe(3000);
});

test('a new booking raises the normal keyboard again after the number pad was used', async ({ page }) => {
  await openApp(page, '2026-10-14T10:40:00');
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T09:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await page.getByTestId('btn-dismiss').click();
  await expect(page.getByTestId('amount-sheet')).toHaveCount(0);
  await page.getByTestId('slot-2026-10-14T12:00').click();
  expect(await page.getByTestId('kb-primer').getAttribute('inputmode')).toBe('text');
});

test('the Suma confirm button floats on its own: no grey box or line around it', async ({ page }) => {
  await openApp(page, '2026-10-14T10:40:00');
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T09:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await expect(page.getByTestId('amount-sheet')).toBeVisible();
  const bar = await page.locator('.sheet-bar').evaluate((el) => { const s = getComputedStyle(el); return { bg: s.backgroundColor, border: s.borderTopWidth }; });
  expect(bar.bg).toBe('rgba(0, 0, 0, 0)');
  expect(bar.border).toBe('0px');
});

test('after the first amount: Taip opens the date and time for the same client and service, in the same button place', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T08:00', service: 2 }]);
  await page.getByTestId(`entry-${id}`).click();
  await page.getByTestId('amount-input').fill('40');
  const before = (await page.getByTestId('amount-confirm').boundingBox())!;
  await page.getByTestId('amount-confirm').click();
  await expect(page.getByTestId('again-yes')).toBeVisible();
  await page.waitForTimeout(450);
  const yes = (await page.getByTestId('again-yes').boundingBox())!;
  expect(Math.abs(yes.y - before.y)).toBeLessThan(2); // the blue button stays at the height of the confirm button
  expect(yes.height).toBeGreaterThanOrEqual(44);
  await expect(page.getByTestId('again-saved')).toContainText('40,00');
  await page.getByTestId('again-yes').click();
  await expect(page.getByTestId('timewheel')).toBeVisible(); // straight to Laikas
  await expectPickedTime(page, '08:00');
  await page.getByTestId('btn-save-time').click();
  await expect(page.getByTestId('sheet')).toHaveCount(0);
  await expect.poll(() => page.evaluate(async () => (await (window as any).__vizitai.db.appointments.toArray()).length)).toBe(2);
  const all = await page.evaluate(async () => (window as any).__vizitai.db.appointments.toArray());
  const next = all.find((x: any) => x.id !== id);
  expect(next.start).toBe('2026-10-15T08:00');
  expect(next.serviceId).toBe(all.find((x: any) => x.id === id).serviceId);
  expect(next.clientId).toBe(all.find((x: any) => x.id === id).clientId);
  expect(await amountOf(page, id)).toBe(4000);
});

test('changing an amount that is already there asks nothing', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T08:00' }]);
  await page.evaluate(async (x) => (window as any).__vizitai.repo.setAmount(x, 1000), id);
  await page.getByTestId(`entry-${id}`).click();
  await page.getByTestId('appt-amount').click();
  await page.getByTestId('amount-input').fill('20');
  await page.getByTestId('amount-confirm').click();
  await expect(page.getByTestId('amount-sheet')).toHaveCount(0);
  await expect(page.getByTestId('again-question')).toHaveCount(0);
  await expect.poll(() => amountOf(page, id)).toBe(2000);
});

test('in Klientai the orange pill adds the amount of the past visit right there', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T08:00' }]);
  await page.getByTestId('tab-clients').click();
  await page.getByTestId('client-pending-0').click();
  await expect(page.getByTestId('amount-sheet')).toBeVisible();
  await expect(page.getByTestId('client-card')).toHaveCount(0); // not the card: straight to Suma
  await expect(page.getByTestId('amount-input')).toBeFocused();
  await page.getByTestId('amount-input').fill('35');
  await page.getByTestId('amount-confirm').click();
  await page.getByTestId('again-no').click();
  await expect.poll(() => amountOf(page, id)).toBe(3500);
  await expect(page.getByTestId('client-pending-0')).toHaveCount(0); // no longer waiting
  await expect(page.getByTestId('client-paid-0')).toBeVisible();
});

test('from Klientai, Taip books the next visit and shows it in the calendar', async ({ page }) => {
  await openApp(page);
  await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T08:00' }]);
  await page.getByTestId('tab-clients').click();
  await page.getByTestId('client-pending-0').click();
  await page.getByTestId('amount-input').fill('35');
  await page.getByTestId('amount-confirm').click();
  await page.getByTestId('again-yes').click();
  await page.getByTestId('btn-save-time').click();
  await expect(page.getByTestId('calendar')).toBeVisible();
  await expect(page.getByTestId('title')).toContainText('15 d.');
});

test('every visit waiting for its amount glows, in Diena and in Savaitė, and stops when the amount is in', async ({ page }) => {
  await openApp(page, '2026-10-14T12:00:00');
  const [past, future] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T08:00' }, { name: 'Rasa', start: '2026-10-14T15:00' }]);
  const glows = () => page.locator('.entry-glow').count();
  await expect.poll(glows).toBe(1); // only the past one
  const g = await page.locator('.entry-glow').evaluate((el) => getComputedStyle(el).animationName);
  expect(g).toBe('due-glow');
  await page.waitForTimeout(800); // the first scroll to "now" has finished
  const eb = (await page.getByTestId(`entry-${past}`).boundingBox())!, gb = (await page.locator('.entry-glow').boundingBox())!;
  expect(Math.abs(eb.x - gb.x)).toBeLessThan(2); expect(Math.abs(eb.y - gb.y)).toBeLessThan(2); // sits right behind the entry
  await page.getByTestId('seg-week').click();
  await expect.poll(glows).toBe(1);
  await page.evaluate(async (x) => (window as any).__vizitai.repo.setAmount(x, 3000), past);
  await expect.poll(glows).toBe(0);
  void future;
});

test('after an amount: a small burst of confetti and a tick, and the Ne button is clearly visible', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T08:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await page.getByTestId('amount-input').fill('30');
  await page.getByTestId('amount-confirm').click();
  await expect(page.getByTestId('burst')).toBeAttached();
  expect(await page.getByTestId('burst').locator('i').count()).toBeGreaterThan(15);
  const anim = await page.getByTestId('burst').locator('i').first().evaluate((el) => getComputedStyle(el).animationName);
  expect(anim).toBe('burst');
  // "Ne" has a solid outline and bold accent text, not a faint grey button
  const no = await page.getByTestId('again-no').evaluate((el) => { const s = getComputedStyle(el); return { shadow: s.boxShadow, weight: s.fontWeight }; });
  expect(no.shadow).not.toBe('none');
  expect(Number(no.weight)).toBeGreaterThanOrEqual(600);
  expect((await page.getByTestId('again-no').boundingBox())!.height).toBeGreaterThanOrEqual(48);
});

test('the amounts she took from this client before are one tap away', async ({ page }) => {
  await openApp(page);
  const [old, id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-07T08:00' }, { name: 'Ona', start: '2026-10-14T08:00' }]);
  await page.evaluate(async (x) => (window as any).__vizitai.repo.setAmount(x, 4500), old);
  await page.getByTestId(`entry-${id}`).click();
  await expect(page.getByTestId('amount-suggest-0')).toContainText('45,00');
  await page.getByTestId('amount-suggest-0').click();
  await expect(page.getByTestId('amount-input')).toHaveValue('45');
  await page.getByTestId('amount-confirm').click();
  await page.getByTestId('again-no').click();
  await expect.poll(() => amountOf(page, id)).toBe(4500);
});

test('every change of a confirmed amount leaves a line on the visit: when, from what to what', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T08:00' }]);
  await page.evaluate(async (x) => (window as any).__vizitai.repo.setAmount(x, 4000), id); // the first amount is not a change
  expect((await apptState(page, id)).amountLog ?? []).toHaveLength(0);
  await page.getByTestId(`entry-${id}`).click();
  await expect(page.getByTestId('amount-log')).toHaveCount(0);
  await page.getByTestId('appt-amount').click();
  await page.getByTestId('amount-input').fill('50');
  await page.getByTestId('amount-confirm').click();
  await expect.poll(() => amountOf(page, id)).toBe(5000);
  await page.getByTestId(`entry-${id}`).click();
  await expect(page.getByTestId('amount-log-0')).toContainText('40,00');
  await expect(page.getByTestId('amount-log-0')).toContainText('50,00');
  await expect(page.getByTestId('amount-log-0')).toContainText('→');
  await page.getByTestId('appt-amount').click();
  await page.getByTestId('amount-input').fill('55');
  await page.getByTestId('amount-confirm').click();
  await page.getByTestId(`entry-${id}`).click();
  await expect(page.getByTestId('amount-log-0')).toContainText('55,00'); // newest first
  await expect(page.getByTestId('amount-log-1')).toContainText('50,00');
  const log = (await apptState(page, id)).amountLog;
  expect(log.map((l: any) => [l.from, l.to])).toEqual([[4000, 5000], [5000, 5500]]);
});

test('0 on a confirmed amount asks first, then nulls it: the visit waits for its amount again, and the log says so', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T08:00' }]);
  await page.evaluate(async (x) => (window as any).__vizitai.repo.setAmount(x, 4000), id);
  await page.getByTestId(`entry-${id}`).click();
  await page.getByTestId('appt-amount').click();
  await page.getByTestId('amount-input').fill('0');
  await expect(page.getByTestId('amount-invalid')).toHaveCount(0); // 0 here is a request to reset, not a mistake
  await page.getByTestId('amount-confirm').click();
  await expect(page.getByTestId('action-title')).toContainText('Nunulinti sumą');
  await expect(page.getByTestId('action-title')).toContainText('Nepatvirtinta');
  expect(await amountOf(page, id)).toBe(4000); // nothing changes before she agrees
  await page.getByTestId('action-item-1').click(); // Palikti
  expect(await amountOf(page, id)).toBe(4000);
  await page.getByTestId('amount-confirm').click();
  await page.getByTestId('action-item-0').click(); // Nunulinti
  await expect.poll(() => amountOf(page, id)).toBeFalsy();
  await expect(page.getByTestId(`entry-${id}`)).toHaveClass(/entry--due/); // orange again
  const log = (await apptState(page, id)).amountLog;
  expect(log).toHaveLength(1);
  expect(log[0]).toMatchObject({ from: 4000, to: null });
  await page.getByTestId('toast-undo').click(); // and Anuliuoti brings the amount back, the log line with it
  await expect.poll(() => amountOf(page, id)).toBe(4000);
  expect((await apptState(page, id)).amountLog ?? []).toHaveLength(0);
});

test('0 as a first amount is refused: there is nothing to reset', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T08:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await page.getByTestId('amount-input').fill('0');
  await expect(page.getByTestId('amount-invalid')).toContainText('didesnę už 0');
  await expect(page.getByTestId('amount-confirm')).toBeDisabled();
});
