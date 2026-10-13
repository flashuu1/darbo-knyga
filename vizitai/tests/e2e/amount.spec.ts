import { test, expect, type Page } from '@playwright/test';
import { apptState, openApp, seedAppts } from './helpers';

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
  await expect(page.getByTestId('amount-confirm')).toBeEnabled(); // empty + confirm clears
  await page.getByTestId('amount-confirm').click();
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
  await page.getByTestId('tab-settings').click();
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
