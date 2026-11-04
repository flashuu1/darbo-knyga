import { test, expect, type Page } from '@playwright/test';
import { openApp, openRow, openSettings, seedAppts, seedOptions } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */
const NOW = '2026-10-14T12:00:00';

/**
 * Every amount field of the app (all that raise the number pad): a tap at its start or in its middle still leaves the cursor at the
 * END, so Backspace removes the last digit she typed. The test taps the very left of the field.
 */
async function cursorIsAtTheEnd(page: Page, testId: string, value: string) {
  const f = page.getByTestId(testId);
  await f.fill(value);
  const b = (await f.boundingBox())!;
  await page.mouse.click(b.x + 3, b.y + b.height / 2); // the far left of the field: the start of the number
  await page.waitForTimeout(200); // the tap has put the cursor at the start, and the app has put it back (a finger cannot press again sooner)
  await expect.poll(() => f.evaluate((el: HTMLInputElement) => `${el.selectionStart}-${el.selectionEnd}`), { timeout: 3000 }).toBe(`${value.length}-${value.length}`);
  await f.press('Backspace');
  await expect(f).toHaveValue(value.slice(0, -1)); // the last digit goes, not one at the start
  await f.press('7');
  await expect(f).toHaveValue(`${value.slice(0, -1)}7`);
}

test.describe('the cursor of an amount field is always at the end', () => {
  test('Suma (the amount of a visit)', async ({ page }) => {
    await openApp(page, NOW);
    const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T08:00' }]);
    await page.getByTestId(`entry-${id}`).click();
    await expect(page.getByTestId('amount-input')).toBeFocused();
    await cursorIsAtTheEnd(page, 'amount-input', '4550');
  });

  test('the amount of a new expense, also when it starts with the fixed amount of its kind', async ({ page }) => {
    await openApp(page, NOW);
    await seedOptions(page);
    await page.evaluate(async () => { const { repo } = (window as any).__vizitai; const o = (await repo.listOptions('expense'))[1]; await repo.updateOption(o.id, { costCents: 45000 }); });
    await page.getByTestId('btn-add').click();
    await page.getByTestId('type-expense').click();
    await page.getByTestId('option-1').click();
    await expect(page.getByTestId('expense-amount')).toHaveValue('450');
    await cursorIsAtTheEnd(page, 'expense-amount', '450');
  });

  test('the fixed amount of a kind in Nustatymai', async ({ page }) => {
    await openApp(page, NOW);
    await seedOptions(page);
    await openSettings(page, 'expenses');
    await openRow(page, 'opt-expense', 1);
    await page.getByTestId('opt-expense-cost-toggle-1').click();
    await expect(page.getByTestId('opt-expense-cost-1')).toBeFocused();
    await page.waitForTimeout(600); // the row has finished opening: the field is where it will stay
    await cursorIsAtTheEnd(page, 'opt-expense-cost-1', '450');
  });

  test('any field with a number pad gets it, also one added later (the rule is about the keyboard, not a list of fields)', async ({ page }) => {
    await openApp(page, NOW);
    await page.evaluate(() => { const i = document.createElement('input'); i.inputMode = 'decimal'; i.id = 'later'; i.value = '1234'; document.body.appendChild(i); i.focus(); i.setSelectionRange(0, 0); });
    await expect.poll(() => page.evaluate(() => (document.getElementById('later') as HTMLInputElement).selectionStart), { timeout: 3000 }).toBe(4);
  });
});

test.describe('the amount of a new expense is never hidden under the blue button', () => {
  test('with the keyboard up the field and its note are in the part of the screen above the button, however long the list of kinds is', async ({ page }) => {
    await openApp(page, NOW);
    await page.evaluate(async () => { // twelve kinds: a long list above the amount field; one of them with a fixed amount
      const { repo } = (window as any).__vizitai;
      for (let i = 0; i < 12; i++) await repo.addOption('expense', `Rūšis ${i + 1}`);
      const o = (await repo.listOptions('expense'))[11];
      await repo.updateOption(o.id, { costCents: 45000 });
    });
    await page.getByTestId('btn-add').click();
    await page.getByTestId('type-expense').click();
    await page.waitForTimeout(500);
    await page.getByTestId('option-11').scrollIntoViewIfNeeded();
    await page.getByTestId('option-11').click();
    await expect(page.getByTestId('expense-amount')).toHaveValue('450');
    await page.evaluate(() => { // the keyboard comes up without resizing the page, as on iOS
      const vv = window.visualViewport!;
      Object.defineProperty(vv, 'height', { configurable: true, get: () => window.innerHeight - 336 });
      vv.dispatchEvent(new Event('resize'));
    });
    await page.getByTestId('expense-amount').focus();
    const bar = page.getByTestId('btn-next');
    await expect.poll(async () => {
      const f = (await page.getByTestId('expense-amount').boundingBox())!, h = (await page.getByTestId('amount-hint').boundingBox())!, b = (await bar.boundingBox())!;
      return Math.max(f.y + f.height, h.y + h.height) <= b.y - 4 && f.y >= 0;
    }, { timeout: 4000, message: 'the amount field or its note is hidden under the button' }).toBe(true);
    // and editing it there works: the cursor is at the end, a digit is removed from the end
    await page.getByTestId('expense-amount').press('Backspace');
    await expect(page.getByTestId('expense-amount')).toHaveValue('45');
    await expect(page.getByTestId('btn-next')).toHaveText('Toliau');
  });
});
