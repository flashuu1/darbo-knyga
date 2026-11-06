import { test, expect, type Page } from '@playwright/test';
import { dragRow, openApp, openRow, openSettings, seedAppts, seedOptions } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */
const NOW = '2026-10-14T12:00:00';

/** Makes one write of the books fail (the way a full or broken phone storage would), until `heal`. */
const breakWrite = (page: Page, method: string, quota = false) => page.evaluate(([m, q]) => {
  const w = window as any, { repo } = w.__vizitai;
  w.__orig = w.__orig ?? {};
  w.__orig[m] = w.__orig[m] ?? repo[m];
  repo[m as string] = async () => { throw q ? new DOMException('the storage is full', 'QuotaExceededError') : new Error('boom'); };
}, [method, quota] as const);
const heal = (page: Page, method: string) => page.evaluate((m) => { const w = window as any; w.__vizitai.repo[m] = w.__orig[m]; }, method);
const rows = (page: Page, table: string) => page.evaluate((t) => (window as any).__vizitai.db[t].toArray(), table);

test.describe('a write that fails is never silent: a red toast, the work stays, and "Bandyti dar kartą" does it again', () => {
  test('a new booking that cannot be saved: the sheet stays with everything entered, the toast says so, the retry saves it', async ({ page }) => {
    await openApp(page, NOW);
    await page.getByTestId('btn-add').click();
    await page.getByTestId('field-name').fill('Ona');
    await page.getByTestId('field-name').press('Enter');
    await expect(page.getByTestId('btn-save')).toBeVisible();
    await breakWrite(page, 'createAppointment');
    await page.getByTestId('btn-save').click();
    const toast = page.getByTestId('toast');
    await expect(toast).toContainText('Nepavyko išsaugoti');
    await expect(toast).toHaveClass(/error/);
    await expect(toast).toHaveAttribute('role', 'alert');
    await expect(page.getByTestId('toast-retry')).toHaveText('Bandyti dar kartą');
    await expect(page.getByTestId('btn-save')).toBeVisible(); // the sheet is still open
    await expect(page.getByTestId('flow-who')).toHaveText('Ona'); // with what she entered
    expect((await rows(page, 'appointments')).length).toBe(0);
    await heal(page, 'createAppointment');
    await page.getByTestId('toast-retry').click();
    await expect(page.getByTestId('btn-save')).toHaveCount(0); // saved: the sheet closes
    await expect.poll(async () => (await rows(page, 'appointments')).length).toBe(1);
  });

  test('a full phone says so', async ({ page }) => {
    await openApp(page, NOW);
    await page.getByTestId('btn-add').click();
    await page.getByTestId('field-name').fill('Ona');
    await page.getByTestId('field-name').press('Enter');
    await breakWrite(page, 'createAppointment', true);
    await page.getByTestId('btn-save').click();
    await expect(page.getByTestId('toast')).toContainText('Telefone nepakanka vietos');
  });

  test('an amount that cannot be saved: the toast and the retry; a retry that fails again says so again', async ({ page }) => {
    await openApp(page, NOW);
    const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T08:00' }]);
    await page.getByTestId(`entry-${id}`).click();
    await page.getByTestId('amount-input').fill('45');
    await breakWrite(page, 'setAmount');
    await page.getByTestId('amount-confirm').click();
    await expect(page.getByTestId('toast')).toContainText('Nepavyko išsaugoti');
    await page.getByTestId('toast-retry').click(); // still broken
    await expect(page.getByTestId('toast')).toContainText('Nepavyko išsaugoti');
    await expect(page.getByTestId('toast-retry')).toBeVisible();
    expect(((await rows(page, 'appointments'))[0] as any).amountCents ?? null).toBeNull();
    await heal(page, 'setAmount');
    await page.getByTestId('toast-retry').click();
    await expect.poll(async () => ((await rows(page, 'appointments'))[0] as any).amountCents).toBe(4500);
  });

  test('in Nustatymai: a rename, a length and an order that cannot be saved all say so', async ({ page }) => {
    await openApp(page, NOW);
    await openSettings(page, 'services');
    await openRow(page, 'svc', 0);
    await breakWrite(page, 'updateService');
    await page.getByTestId('svc-name-0').fill('Naujas pavadinimas');
    await page.getByTestId('svc-name-0').blur();
    await expect(page.getByTestId('toast')).toContainText('Nepavyko išsaugoti');
    await page.getByTestId('svc-plus-0').click(); // another write while it is broken
    await expect(page.getByTestId('toast')).toContainText('Nepavyko išsaugoti');
    await heal(page, 'updateService');
    await page.getByTestId('toast-retry').click();
    await expect.poll(async () => ((await rows(page, 'services')) as any[]).some((s) => s.minutes === 30)).toBe(true); // the last attempt (the length) went through
    // the order
    await breakWrite(page, 'reorderServices');
    const names = async () => ((await rows(page, 'services')) as any[]).sort((a, b) => a.order - b.order).map((s) => s.name);
    const before = await names();
    await dragRow(page, 'svc', 1, 0);
    await expect(page.getByTestId('toast')).toContainText('Nepavyko išsaugoti');
    expect(await names()).toEqual(before); // nothing changed, and the list shows it
    await expect(page.getByTestId('svc-open-0')).toContainText(before[0]!);
  });

  test('the fixed amount of an expense kind that cannot be saved says so', async ({ page }) => {
    await openApp(page, NOW);
    await seedOptions(page);
    await openSettings(page, 'expenses');
    await openRow(page, 'opt-expense', 1);
    await breakWrite(page, 'updateOption');
    await page.getByTestId('opt-expense-cost-toggle-1').click();
    await page.getByTestId('opt-expense-cost-1').fill('450');
    await expect(page.getByTestId('toast')).toContainText('Nepavyko išsaugoti');
  });

  test('the working hours that cannot be saved say so', async ({ page }) => {
    await openApp(page, NOW);
    await openSettings(page, 'hours');
    await breakWrite(page, 'updateSettings');
    await page.getByTestId('hours-end').fill('21:00');
    await page.getByTestId('hours-end').blur();
    await expect(page.getByTestId('toast')).toContainText('Nepavyko išsaugoti');
  });

  test('an undo that fails says so, with a retry', async ({ page }) => {
    await openApp(page, NOW);
    await seedOptions(page);
    await openSettings(page, 'expenses');
    await dragRow(page, 'opt-expense', 0, 'trash');
    await expect(page.getByTestId('toast')).toContainText('Ištrinta');
    await breakWrite(page, 'restoreOption');
    await page.getByTestId('toast-undo').click();
    await expect(page.getByTestId('toast')).toContainText('Nepavyko išsaugoti');
    await heal(page, 'restoreOption');
    await page.getByTestId('toast-retry').click();
    await expect.poll(async () => (await rows(page, 'options')).filter((o: any) => o.group === 'expense').length).toBe(4);
  });

  test('a service that cannot be hidden because of the storage is not reported as "the last one"', async ({ page }) => {
    await openApp(page, NOW);
    await openSettings(page, 'services');
    await openRow(page, 'svc', 1);
    await breakWrite(page, 'setServiceActive');
    await page.getByTestId('svc-toggle-1').click();
    await expect(page.getByTestId('toast')).toContainText('Nepavyko išsaugoti');
    await expect(page.getByTestId('toast')).not.toContainText('bent viena');
  });

  test('the safety net: a database error that nobody wrapped still shows up (without a retry, it does not know what to repeat)', async ({ page }) => {
    await openApp(page, NOW);
    await page.evaluate(() => { void Promise.reject(new DOMException('the storage is full', 'QuotaExceededError')); });
    await expect(page.getByTestId('toast')).toContainText('Telefone nepakanka vietos');
    await expect(page.getByTestId('toast-retry')).toHaveCount(0);
  });
});
