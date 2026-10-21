import { test, expect, type Page } from '@playwright/test';
import { apptState, openApp, seedAppts, pickTime } from './helpers';

// Perkelti: the in-app calendar. Nothing moves until she confirms with "Perkelti".
async function pickMove(page: Page, id: string, date: string, time: string) {
  const before = (await apptState(page, id)).start;
  await page.getByTestId('act-move').click();
  await expect(page.getByTestId('move-sheet')).toBeVisible();
  const month = date.slice(0, 7);
  if (month !== before.slice(0, 7)) await page.getByTestId(month > before.slice(0, 7) ? 'pick-next' : 'pick-prev').click();
  await page.getByTestId(`pick-day-${date}`).click();
  await pickTime(page, time);
  await page.waitForTimeout(150);
  expect((await apptState(page, id)).start).toBe(before); // picking alone moves nothing
  await page.getByTestId('btn-move-confirm').click();
}

test('tapping an entry opens the sheet with name, service, time and status', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await expect(page.getByTestId('appt-name')).toHaveText('Ona');
  await expect(page.getByTestId('appt-status')).toHaveText('Laukiama');
  await expect(page.getByTestId('sheet')).toContainText('spalio 14 d., tr · 10:00');
  await expect(page.getByTestId('act-noshow')).toHaveCount(0); // start time has not passed
});

test('tapping a service chip changes the service immediately', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  const before = (await apptState(page, id)).serviceId;
  await page.getByTestId('appt-svc-1').click();
  await expect.poll(async () => (await apptState(page, id)).serviceId).not.toBe(before);
});

test('cancelling takes two taps and one confirmation; the slot frees up; Anuliuoti restores it', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await page.getByTestId('act-cancel').click();
  await expect(page.getByTestId('action-title')).toHaveText('Atšaukti vizitą?');
  await expect(page.getByTestId('action-item-0')).toHaveText('Atšaukti vizitą'); // a plain confirmation: no reasons to pick
  await expect(page.getByTestId('action-item-1')).toHaveText('Palikti');
  await page.getByTestId('action-item-0').click();
  await expect(page.getByTestId('toast')).toContainText('Vizitas atšauktas');
  await expect.poll(() => apptState(page, id)).toMatchObject({ status: 'cancelled', cancelReason: null });
  await page.getByTestId('toast-undo').click();
  await expect.poll(() => apptState(page, id)).toMatchObject({ status: 'booked', cancelReason: null });
  // cancelled again: the slot is free, the thin line does not block the tap
  await page.getByTestId(`entry-${id}`).click();
  await page.getByTestId('act-cancel').click();
  await page.getByTestId('action-item-0').click();
  await expect.poll(async () => (await apptState(page, id)).status).toBe('cancelled');
  await page.getByTestId('slot-2026-10-14T10:00').click();
  await expect(page.getByTestId('sheet')).toBeVisible();
});

test('opening another sheet hides the undo toast, so a tap there cannot undo the last action', async ({ page }) => {
  await openApp(page);
  const [a, b] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }, { name: 'Jonas', start: '2026-10-14T11:00' }]);
  await page.getByTestId(`entry-${a}`).click();
  await page.getByTestId('act-cancel').click();
  await page.getByTestId('action-item-0').click();
  await expect(page.getByTestId('toast-undo')).toBeVisible();
  await expect.poll(async () => (await apptState(page, a)).status).toBe('cancelled');
  await page.waitForTimeout(350); // the toast has finished rising into place
  const undo = (await page.getByTestId('toast-undo').boundingBox())!;
  await page.getByTestId(`entry-${b}`).click({ timeout: 2000 }); // well above the toast
  await expect(page.getByTestId('sheet')).toBeVisible();
  // short timeouts: the toast's own 5 s timer must not be what makes these pass
  await expect(page.getByTestId('toast')).toHaveCount(0, { timeout: 1000 });
  await page.mouse.click(undo.x + undo.width / 2, undo.y + undo.height / 2); // where Anuliuoti was
  await page.waitForTimeout(300);
  expect((await apptState(page, a)).status).toBe('cancelled');
});

test('cancelling never asks for a reason', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await page.getByTestId('act-cancel').click();
  await page.getByTestId('action-item-0').click();
  await expect.poll(() => apptState(page, id)).toMatchObject({ status: 'cancelled', cancelReason: null });
});

test('"Palikti" keeps the appointment', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await page.getByTestId('act-cancel').click();
  await page.getByTestId('action-item-1').click();
  await expect(page.getByTestId('action-title')).toHaveCount(0);
  expect((await apptState(page, id)).status).toBe('booked');
});

test('Neatvyko appears only after the start time, and Atkurti vizitą brings it back', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T08:00' }]);
  await page.getByTestId(`entry-${id}`).click(); // a visit that waits for its amount opens Suma first
  await page.getByTestId('amount-open-appt').click();
  await page.getByTestId('act-noshow').click();
  await expect.poll(async () => (await apptState(page, id)).status).toBe('noshow');
  await expect(page.getByTestId('sheet')).toHaveCount(0);
  await page.getByTestId(`entry-${id}`).click();
  await expect(page.getByTestId('act-noshow')).toHaveCount(0);
  await page.getByTestId('act-restore').click();
  await expect.poll(async () => (await apptState(page, id)).status).toBe('booked');
});

test('Perkelti moves the appointment, shows the toast and Anuliuoti undoes it', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await pickMove(page, id, '2026-10-15', '14:00');
  await expect(page.getByTestId('move-sheet')).toHaveCount(0);
  await expect(page.getByTestId('toast')).toContainText('Perkelta: spalio 15 d., kt · 14:00');
  expect((await apptState(page, id)).start).toBe('2026-10-15T14:00');
  await page.getByTestId('toast-undo').click();
  await expect.poll(async () => (await apptState(page, id)).start).toBe('2026-10-14T10:00');
});

test('moving onto another booking adds the overlap warning to the toast', async ({ page }) => {
  await openApp(page);
  const [a] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }, { name: 'Jonas', start: '2026-10-14T14:00' }]);
  await page.getByTestId(`entry-${a}`).click();
  await pickMove(page, a, '2026-10-14', '14:00');
  await expect(page.getByTestId('toast')).toContainText('Šiuo laiku jau užregistruota: Jonas – Kirpimas');
});

test('the toast disappears after 5 seconds', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await page.getByTestId('act-cancel').click();
  await page.getByTestId('action-item-0').click();
  await expect(page.getByTestId('toast')).toBeVisible();
  await page.clock.fastForward(5200);
  await expect(page.getByTestId('toast')).toHaveCount(0);
});

test('Perkelti: closing the picker without confirming moves nothing', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T10:00' }]);
  await page.getByTestId(`entry-${id}`).click();
  await page.getByTestId('act-move').click();
  await expect(page.getByTestId('btn-move-confirm')).toBeDisabled(); // nothing picked yet
  await page.getByTestId('pick-day-2026-10-16').click();
  await pickTime(page, '12:00');
  await expect(page.getByTestId('btn-move-confirm')).toBeEnabled();
  await page.getByTestId('btn-dismiss').click();
  await expect(page.getByTestId('move-sheet')).toHaveCount(0);
  await page.waitForTimeout(200);
  expect((await apptState(page, id)).start).toBe('2026-10-14T10:00');
  await expect(page.getByTestId('toast')).toHaveCount(0);
});

test('a cancelled entry can be renewed with one tap on its line', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T15:00' }]);
  await page.evaluate(async (x) => (window as any).__vizitai.repo.cancelAppointment(x, null), id); // eslint-disable-line @typescript-eslint/no-explicit-any
  await expect(page.getByTestId(`entry-${id}`)).toHaveClass(/thin/);
  await page.getByTestId(`entry-${id}`).click();
  await expect(page.getByTestId('action-title')).toContainText('Atšauktas vizitas: Ona');
  await expect(page.getByTestId('action-item-0')).toHaveText('Atnaujinti vizitą');
  await expect(page.getByTestId('action-item-1')).toHaveText('Pakeisti nauju vizitu');
  await page.getByTestId('action-item-0').click();
  await expect.poll(async () => (await apptState(page, id)).status).toBe('booked');
  await expect(page.getByTestId(`entry-${id}`)).not.toHaveClass(/thin/);
});

test('a cancelled entry can be replaced by a new booking, which removes the cancelled one', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T15:00' }]);
  await page.evaluate(async (x) => (window as any).__vizitai.repo.cancelAppointment(x, null), id); // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.getByTestId(`entry-${id}`).click();
  await page.getByTestId('action-item-1').click(); // Pakeisti nauju vizitu
  await expect(page.getByTestId('field-name')).toBeFocused();
  await page.getByTestId('field-name').fill('Rasa');
  await page.getByTestId('field-name').press('Enter');
  await page.getByTestId('btn-save').click();
  await expect(page.getByTestId('sheet')).toHaveCount(0);
  await expect.poll(() => page.evaluate(async () => (await (window as any).__vizitai.db.appointments.toArray()).map((a: { start: string; status: string }) => `${a.start} ${a.status}`))).toEqual(['2026-10-14T15:00 booked']); // eslint-disable-line @typescript-eslint/no-explicit-any
  await expect(page.getByTestId(`entry-${id}`)).toHaveCount(0);
});

test('the rest of the row under a cancelled line still books a new visit and keeps the cancelled one', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T15:00' }]);
  await page.evaluate(async (x) => (window as any).__vizitai.repo.cancelAppointment(x, null), id); // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.getByTestId('slot-2026-10-14T15:00').click();
  await expect(page.getByTestId('field-name')).toBeVisible();
  await page.getByTestId('btn-dismiss').click();
  await expect.poll(async () => (await apptState(page, id)).status).toBe('cancelled');
});

test('cancelled entries older than a week are gone after the app starts', async ({ page }) => {
  await openApp(page);
  const [old, recent] = await seedAppts(page, [{ name: 'Sena', start: '2026-10-01T10:00' }, { name: 'Šviežia', start: '2026-10-02T10:00' }]);
  await page.evaluate(async ([a, b]) => {
    const { repo, db } = (window as any).__vizitai; // eslint-disable-line @typescript-eslint/no-explicit-any
    await repo.cancelAppointment(a, null); await repo.cancelAppointment(b, null);
    await db.appointments.update(a, { cancelledAt: new Date(Date.now() - 8 * 86_400_000).toISOString() });
    await db.appointments.update(b, { cancelledAt: new Date(Date.now() - 2 * 86_400_000).toISOString() });
  }, [old, recent]);
  await page.reload();
  await page.waitForFunction(() => !!(window as any).__vizitai); // eslint-disable-line @typescript-eslint/no-explicit-any
  await expect.poll(() => page.evaluate(async () => (await (window as any).__vizitai.db.appointments.toArray()).map((a: { id: string }) => a.id))).toEqual([recent]); // eslint-disable-line @typescript-eslint/no-explicit-any
});

test('the entry sheet shows who, when and what she can do: money, then grouped actions, with the risky ones apart', async ({ page }) => {
  await openApp(page, '2026-10-14T10:40:00');
  const [done] = await seedAppts(page, [{ name: 'Ona Petraitė', start: '2026-10-14T15:00' }]);
  await page.evaluate(async (x) => { const { repo } = (window as any).__vizitai; const c = (await repo.getAppointment(x)).clientId; await repo.updateClient(c, { phone: '+370 600 12345' }); }, done); // eslint-disable-line @typescript-eslint/no-explicit-any
  await page.getByTestId(`entry-${done}`).click();
  await expect(page.getByTestId('appt-name')).toHaveText('Ona Petraitė');
  await expect(page.getByTestId('appt-when')).toContainText('15:00');
  await expect(page.getByTestId('appt-when')).toContainText('Kirpimas');
  await expect(page.getByTestId('appt-when')).toContainText('15 min.');
  await expect(page.getByTestId('appt-status')).toHaveText('Laukiama');
  for (const id of ['act-move', 'act-repeat', 'act-cancel']) await expect(page.getByTestId(id)).toBeVisible();
  expect(await page.getByTestId('act-call').getAttribute('href')).toBe('tel:+37060012345');
  // every action is a full-width, thumb-sized row
  for (const id of ['act-move', 'act-repeat', 'act-cancel']) expect((await page.getByTestId(id).boundingBox())!.height).toBeGreaterThanOrEqual(48);
  // the risky one sits in its own group, below the others
  const move = (await page.getByTestId('act-move').boundingBox())!, cancel = (await page.getByTestId('act-cancel').boundingBox())!;
  expect(cancel.y).toBeGreaterThan(move.y + move.height);
});

test('a visit still waiting for its amount puts a big orange button in the sheet', async ({ page }) => {
  await openApp(page, '2026-10-14T10:40:00');
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T09:00' }]);
  await page.getByTestId(`entry-${id}`).click(); // due: opens Suma first
  await page.getByTestId('amount-open-appt').click();
  await expect(page.getByTestId('appt-status')).toHaveText('Nepatvirtinta');
  await expect(page.getByTestId('appt-amount')).toHaveClass(/money-cta/);
  await expect(page.getByTestId('appt-amount')).toContainText('Pridėti sumą');
});

test('a tap just beside a thin entry opens it instead of booking next to it; farther away still books', async ({ page }) => {
  await openApp(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T15:00' }]);
  await page.waitForTimeout(700);
  await page.getByTestId(`entry-${id}`).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const b = (await page.getByTestId(`entry-${id}`).boundingBox())!;
  await page.mouse.click(b.x + b.width + 6, b.y + b.height / 2); // 6 px right of the entry (the empty margin of the column)
  await expect(page.getByTestId('appt-name')).toHaveText('Ona');
  await page.getByTestId('btn-close').click();
  await expect(page.getByTestId('sheet')).toHaveCount(0);
  await page.mouse.click(b.x + 40, b.y - 6); // just above it: the row before
  await expect(page.getByTestId('appt-name')).toHaveText('Ona');
  await page.getByTestId('btn-close').click();
  await expect(page.getByTestId('sheet')).toHaveCount(0);
  await page.mouse.click(b.x + 40, b.y - 40); // clearly an empty row: a new booking
  await expect(page.getByTestId('field-name')).toBeVisible();
});
