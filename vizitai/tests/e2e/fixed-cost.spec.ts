import { test, expect, type Page } from '@playwright/test';
import { openApp, openRow, openSettings, seedOptions } from './helpers';

const optionOf = (page: Page, name: string) => page.evaluate(async (n) => ((await (window as any).__vizitai.repo.listOptions('expense')) as { name: string; costCents?: number }[]).find((o) => o.name === n), name); // eslint-disable-line @typescript-eslint/no-explicit-any

test.describe('Išlaidų rūšys: a fixed amount that is only assumed when she asks for it', () => {
  test('a kind starts without one; turning it on opens the amount field, raises the number pad and saves what she types', async ({ page }) => {
    await openApp(page);
    await seedOptions(page);
    await openSettings(page, 'expenses');
    await expect(page.getByTestId('opt-expense-open-1')).toContainText('Be sumos');
    await openRow(page, 'opt-expense', 1); // Nuoma
    const folded = (id: string) => page.getByTestId(id).evaluate((el) => el.closest('.cost-in')!.getBoundingClientRect().height);
    await expect.poll(() => folded('opt-expense-cost-1')).toBe(0); // the field is folded away until she asks for it
    await page.getByTestId('opt-expense-cost-toggle-1').click();
    const field = page.getByTestId('opt-expense-cost-1');
    await expect.poll(() => folded('opt-expense-cost-1')).toBeGreaterThan(40); // it slides open
    await expect(field).toBeFocused(); // the cursor is in it, so the keyboard is up
    await expect(field).toHaveAttribute('inputmode', 'decimal'); // and it is the number pad
    await field.fill('450');
    await expect.poll(async () => (await optionOf(page, 'Nuoma'))?.costCents).toBe(45000);
    await field.fill('38,5');
    await expect.poll(async () => (await optionOf(page, 'Nuoma'))?.costCents).toBe(3850);
    await expect(page.getByTestId('opt-expense-open-1')).toContainText('38,50');
    // the other kinds are untouched
    expect((await optionOf(page, 'Medžiagos'))?.costCents).toBeUndefined();
  });

  test('emptying the field is one move: the switch goes off, the keyboard goes away and the row folds', async ({ page }) => {
    await openApp(page);
    await seedOptions(page);
    await page.evaluate(async () => { const { repo } = (window as any).__vizitai; const o = (await repo.listOptions('expense'))[1]; await repo.updateOption(o.id, { costCents: 45000 }); }); // eslint-disable-line @typescript-eslint/no-explicit-any
    await openSettings(page, 'expenses');
    await openRow(page, 'opt-expense', 1);
    const field = page.getByTestId('opt-expense-cost-1');
    await expect(field).toHaveValue('450');
    await field.fill('');
    await expect(page.getByTestId('opt-expense-open-1')).toHaveAttribute('aria-expanded', 'false', { timeout: 3000 }); // closed on its own
    await expect.poll(async () => (await optionOf(page, 'Nuoma'))?.costCents).toBeUndefined();
    await expect(page.getByTestId('opt-expense-open-1')).toContainText('Be sumos');
    expect(await page.evaluate(() => document.activeElement instanceof HTMLInputElement)).toBe(false);
    await openRow(page, 'opt-expense', 1);
    await expect(page.getByTestId('opt-expense-cost-toggle-1')).toHaveAttribute('aria-checked', 'false'); // and it is off when opened again
  });

  test('turning the switch off by hand removes the amount and leaves the row open; leaving it on and empty means off', async ({ page }) => {
    await openApp(page);
    await seedOptions(page);
    await page.evaluate(async () => { const { repo } = (window as any).__vizitai; const o = (await repo.listOptions('expense'))[2]; await repo.updateOption(o.id, { costCents: 3850 }); }); // eslint-disable-line @typescript-eslint/no-explicit-any
    await openSettings(page, 'expenses');
    await openRow(page, 'opt-expense', 2);
    await page.getByTestId('opt-expense-cost-toggle-2').click();
    await expect.poll(async () => (await optionOf(page, 'Mokesčiai'))?.costCents).toBeUndefined();
    await expect(page.getByTestId('opt-expense-open-2')).toHaveAttribute('aria-expanded', 'true');
    await page.getByTestId('opt-expense-cost-toggle-2').click(); // on again, nothing typed
    await expect(page.getByTestId('opt-expense-cost-2')).toBeFocused();
    await page.getByTestId('opt-expense-name-2').focus(); // she leaves without an amount
    await expect(page.getByTestId('opt-expense-cost-toggle-2')).toHaveAttribute('aria-checked', 'false');
  });

  test('registering an expense: a kind with a fixed amount starts with it and says so; a kind without one starts empty', async ({ page }) => {
    await openApp(page);
    await seedOptions(page);
    await page.evaluate(async () => { const { repo } = (window as any).__vizitai; const o = (await repo.listOptions('expense'))[1]; await repo.updateOption(o.id, { costCents: 45000 }); }); // eslint-disable-line @typescript-eslint/no-explicit-any
    await page.getByTestId('slot-2026-10-14T12:00').click();
    await page.getByTestId('type-expense').click();
    await page.getByTestId('option-0').click(); // Medžiagos: no fixed amount
    await expect(page.getByTestId('expense-amount')).toHaveValue('');
    await expect(page.getByTestId('amount-hint')).toHaveCount(0);
    await expect(page.getByTestId('btn-next')).toBeDisabled();
    await page.getByTestId('option-1').click(); // Nuoma: 450 €
    await expect(page.getByTestId('expense-amount')).toHaveValue('450');
    await expect(page.getByTestId('amount-hint')).toContainText('Įprasta suma');
    await expect(page.getByTestId('btn-next')).toContainText('Patvirtinti');
    await expect(page.getByTestId('btn-next')).toContainText('450');
    await page.getByTestId('expense-amount').fill('400');
    await expect(page.getByTestId('amount-hint')).toContainText('Pakeista');
    await expect(page.getByTestId('btn-next')).toHaveText('Toliau');
    await page.getByTestId('expense-amount').fill('450');
    await page.getByTestId('btn-next').click(); // the confirmation, then the time, then it is saved
    await page.getByTestId('btn-save-time').click();
    await expect.poll(() => page.evaluate(async () => ((await (window as any).__vizitai.db.appointments.toArray()) as { kind: string; amountCents?: number }[]).find((a) => a.kind === 'expense')?.amountCents)).toBe(45000); // eslint-disable-line @typescript-eslint/no-explicit-any
    // the next one: picking another kind and coming back starts from the fixed amount again
    await page.getByTestId('slot-2026-10-14T14:00').click();
    await page.getByTestId('type-expense').click();
    await page.getByTestId('option-1').click();
    await expect(page.getByTestId('expense-amount')).toHaveValue('450');
  });
});

test.describe('Paslaugos, Asmeniniai, Išlaidų rūšys: one row each, opened in place', () => {
  test('a tap opens a row, another tap on a different row folds the first, and nothing she has is replaced', async ({ page }) => {
    await openApp(page);
    await openSettings(page, 'services');
    const names = await page.evaluate(async () => ((await (window as any).__vizitai.repo.listServices()) as { name: string }[]).map((s) => s.name)); // eslint-disable-line @typescript-eslint/no-explicit-any
    await expect(page.getByTestId('svc-open-0')).toHaveAttribute('aria-expanded', 'false');
    await openRow(page, 'svc', 0);
    await expect(page.getByTestId('svc-name-0')).toBeVisible();
    await openRow(page, 'svc', 1);
    await expect(page.getByTestId('svc-open-0')).toHaveAttribute('aria-expanded', 'false');
    await expect.poll(async () => (await page.getByTestId('svc-row-0').boundingBox())!.height).toBeLessThan(70); // folded back to one line
    await page.getByTestId('svc-open-1').click(); // the same row again folds it
    await expect(page.getByTestId('svc-open-1')).toHaveAttribute('aria-expanded', 'false');
    expect(await page.evaluate(async () => ((await (window as any).__vizitai.repo.listServices()) as { name: string }[]).map((s) => s.name))).toEqual(names); // eslint-disable-line @typescript-eslint/no-explicit-any
  });

  test('Asmeniniai: the length is changed in the row with the chips or the stepper', async ({ page }) => {
    await openApp(page);
    await openSettings(page, 'personal');
    await openRow(page, 'opt-personal', 0);
    await page.getByTestId('opt-personal-chip-0-90').click();
    await expect.poll(() => page.evaluate(async () => ((await (window as any).__vizitai.repo.listOptions('personal')) as { minutes?: number }[])[0]?.minutes)).toBe(90); // eslint-disable-line @typescript-eslint/no-explicit-any
    await expect(page.getByTestId('opt-personal-minutes-0')).toHaveText('1 val 30 min');
    await page.getByTestId('opt-personal-plus-0').click();
    await expect(page.getByTestId('opt-personal-minutes-0')).toHaveText('1 val 45 min'); // quarter hours below two hours
  });
});
