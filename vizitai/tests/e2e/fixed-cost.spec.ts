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
    await expect(page.getByTestId('opt-expense-cost-1')).toHaveCount(0); // there is no field until she asks for it
    await page.getByTestId('opt-expense-cost-toggle-1').click();
    const field = page.getByTestId('opt-expense-cost-1');
    await expect(field).toBeVisible(); // it opens
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
    await expect(page.getByTestId('opt-expense-cost-2')).toHaveCount(0);
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
    await expect(page.getByTestId('svc-name-0')).toHaveCount(0); // folded back to one line: its editor is gone
    expect((await page.getByTestId('svc-row-0').boundingBox())!.height).toBeLessThan(70);
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

test.describe('the fixed amount switch and the number pad', () => {
  test('the switch is a pill (51 by 31), not a block', async ({ page }) => {
    await openApp(page);
    await seedOptions(page);
    await openSettings(page, 'expenses');
    await openRow(page, 'opt-expense', 0);
    const b = (await page.getByTestId('opt-expense-cost-toggle-0').boundingBox())!;
    expect(b.width).toBeGreaterThanOrEqual(50); expect(b.width).toBeLessThanOrEqual(52);
    expect(b.height).toBeGreaterThanOrEqual(30); expect(b.height).toBeLessThanOrEqual(32);
  });

  test('the switch can be pressed with the number pad up: one press turns it off, the field goes and the pad is lowered (also with nothing typed yet)', async ({ page }) => {
    await openApp(page);
    await seedOptions(page);
    await openSettings(page, 'expenses');
    await openRow(page, 'opt-expense', 0);
    const toggle = page.getByTestId('opt-expense-cost-toggle-0');
    await toggle.click();
    await expect(page.getByTestId('opt-expense-cost-0')).toBeFocused();
    await toggle.click(); // pad up, field empty: the press on the switch must not be undone by the field losing focus
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await page.waitForTimeout(900);
    await expect(toggle).toHaveAttribute('aria-checked', 'false'); // and it stays off
    await expect(page.getByTestId('opt-expense-cost-0')).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement instanceof HTMLInputElement)).toBe(false);
    await toggle.click(); // on, with an amount
    await page.getByTestId('opt-expense-cost-0').fill('120');
    await toggle.click(); // pad up, amount typed: one press off
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect.poll(async () => (await optionOf(page, 'Medžiagos'))?.costCents).toBeUndefined();
  });

  test('"Gerai" lowers the number pad and keeps the amount', async ({ page }) => {
    await openApp(page);
    await seedOptions(page);
    await openSettings(page, 'expenses');
    await openRow(page, 'opt-expense', 1);
    await page.getByTestId('opt-expense-cost-toggle-1').click();
    const done = page.getByTestId('opt-expense-cost-done-1');
    await expect(done).toBeVisible();
    await page.getByTestId('opt-expense-cost-1').fill('450');
    await done.click();
    expect(await page.evaluate(() => document.activeElement instanceof HTMLInputElement)).toBe(false);
    await expect(page.getByTestId('opt-expense-cost-toggle-1')).toHaveAttribute('aria-checked', 'true');
    await expect.poll(async () => (await optionOf(page, 'Nuoma'))?.costCents).toBe(45000);
  });
});

test.describe('the rows move smoothly: transforms and opacity only, no frame stalls', () => {
  test('opening, switching, folding and turning the amount field on and off animate no layout property', async ({ page }) => {
    await openApp(page);
    await seedOptions(page);
    await openSettings(page, 'expenses');
    await page.evaluate(() => {
      const w = window as unknown as { __props: Set<string>; __gaps: number[] };
      w.__props = new Set(); w.__gaps = [];
      let last = performance.now();
      const tick = (n: number) => {
        w.__gaps.push(n - last); last = n;
        for (const a of document.getAnimations()) {
          if (a instanceof CSSTransition) w.__props.add(a.transitionProperty);
          else for (const k of (a.effect as KeyframeEffect).getKeyframes()) for (const p of Object.keys(k)) w.__props.add(p);
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.getByTestId('opt-expense-open-0').click(); await page.waitForTimeout(500);
    await page.getByTestId('opt-expense-open-1').click(); await page.waitForTimeout(600);
    await page.getByTestId('opt-expense-cost-toggle-1').click(); await page.waitForTimeout(500);
    await page.getByTestId('opt-expense-cost-toggle-1').click(); await page.waitForTimeout(500);
    await page.getByTestId('opt-expense-open-1').click(); await page.waitForTimeout(700);
    const r = await page.evaluate(() => { const w = window as unknown as { __props: Set<string>; __gaps: number[] }; return { props: [...w.__props], worst: Math.max(...w.__gaps.slice(2)) }; });
    const layout = r.props.filter((p) => /^(width|height|top|left|right|bottom|margin.*|padding.*|max.*|min.*|inset.*|font.*|line.*)$/i.test(p) || /grid/i.test(p));
    expect(layout, `animated layout properties: ${layout.join(', ')}`).toEqual([]);
    expect(r.worst, 'the longest gap between two frames while the rows moved (ms)').toBeLessThan(120);
  });
});
