import { test, expect, type Page } from '@playwright/test';
import { dragRow, openApp, openRow, openSettings, seedOptions } from './helpers';

const kinds = (page: Page) => page.evaluate(async () => ((await (window as any).__vizitai.repo.listOptions('expense')) as { name: string }[]).map((o) => o.name)); // eslint-disable-line @typescript-eslint/no-explicit-any

test.describe('Nustatymai lists: press and hold to move or throw away, "+" at the top right', () => {
  test('the "+" is in the top right corner of the page, and there are no arrows or trash buttons in an open row', async ({ page }) => {
    await openApp(page);
    await seedOptions(page);
    for (const [section, prefix] of [['services', 'svc'], ['personal', 'opt-personal'], ['expenses', 'opt-expense']] as const) {
      await openSettings(page, section);
      const add = (await page.getByTestId(`${prefix}-add`).boundingBox())!;
      const vw = page.viewportSize()!.width;
      expect(add.y).toBeLessThan(100);
      expect(add.x + add.width).toBeGreaterThan(vw - 30); // at the right edge
      await openRow(page, prefix, 0);
      await expect(page.getByTestId(`${prefix}-up-0`)).toHaveCount(0);
      await expect(page.getByTestId(`${prefix}-delete-0`)).toHaveCount(0);
      await page.getByTestId('settings-back').click();
      await page.waitForTimeout(450);
    }
  });

  test('a row lifts with a hold and goes where it is dropped; a tap still opens a row, and the end of a drag is not a tap', async ({ page }) => {
    await openApp(page);
    await seedOptions(page);
    await openSettings(page, 'expenses');
    const before = await kinds(page); // Medžiagos, Nuoma, Mokesčiai, Kita
    await page.getByTestId('opt-expense-open-0').click(); // a tap opens
    await expect(page.getByTestId('opt-expense-open-0')).toHaveAttribute('aria-expanded', 'true');
    await page.getByTestId('opt-expense-open-0').click(); await page.waitForTimeout(450);
    await dragRow(page, 'opt-expense', 0, 2); // Medžiagos goes down to the third place
    await expect.poll(() => kinds(page)).toEqual([before[1], before[2], before[0], before[3]]);
    await expect(page.getByTestId('opt-expense-open-2')).toContainText(before[0]!);
    await expect(page.getByTestId('opt-expense-open-2')).toHaveAttribute('aria-expanded', 'false'); // dropping it did not open it
    await dragRow(page, 'opt-expense', 3, 0); // Kita to the top
    await expect.poll(() => kinds(page)).toEqual([before[3], before[1], before[2], before[0]]);
    // and it is the saved order: back to the list and in again
    await page.getByTestId('settings-back').click(); await page.waitForTimeout(450);
    await page.getByTestId('settings-row-expenses').click(); await page.waitForTimeout(450);
    await expect(page.getByTestId('opt-expense-open-0')).toContainText(before[3]!);
  });

  test('the trash rises only while a row is carried, lights up under the finger, and a row let go anywhere else leaves it', async ({ page }) => {
    await openApp(page);
    await seedOptions(page);
    await openSettings(page, 'expenses');
    const trash = page.getByTestId('opt-expense-trash');
    await expect(trash).not.toHaveClass(/on/);
    await dragRow(page, 'opt-expense', 1, 'trash', true);
    await expect(trash).toHaveClass(/on/);
    await expect(trash).toHaveClass(/hot/); // the finger is over it
    await expect(trash).toHaveText(''); // an icon, no words
    await expect(trash.locator('svg')).toBeVisible();
    await expect(page.getByTestId('opt-expense-row-1')).toHaveClass(/lift/);
    const a = (await page.getByTestId('opt-expense-open-1').boundingBox())!, t = (await trash.boundingBox())!;
    expect(a.y + a.height / 2).toBeGreaterThan(t.y - 40); // the row is carried down to it
    // back up and let go on the list: nothing is removed
    await page.mouse.move(200, 330, { steps: 8 });
    await expect(trash).not.toHaveClass(/hot/);
    await page.mouse.up(); await page.waitForTimeout(700);
    await expect(trash).not.toHaveClass(/on/);
    expect(await kinds(page)).toHaveLength(4);
  });

  test('dropped on the trash a row is removed at once, the toast says so, and Anuliuoti puts it back in its place', async ({ page }) => {
    await openApp(page);
    await seedOptions(page);
    await openSettings(page, 'expenses');
    const before = await kinds(page);
    await dragRow(page, 'opt-expense', 1, 'trash');
    await expect.poll(() => kinds(page)).toEqual([before[0], before[2], before[3]]);
    await expect(page.getByTestId('toast')).toContainText(`Ištrinta: ${before[1]}`);
    await expect(page.getByTestId('opt-expense-row-3')).toHaveCount(0);
    await page.getByTestId('toast-undo').click();
    await expect.poll(() => kinds(page)).toEqual(before);
    await expect(page.getByTestId('opt-expense-open-1')).toContainText(before[1]!);
  });

  test('scrolling the page from a row does not lift it, and a short press does not either', async ({ page }) => {
    await openApp(page);
    await seedOptions(page);
    await openSettings(page, 'expenses');
    const b = (await page.getByTestId('opt-expense-open-1').boundingBox())!;
    await page.mouse.move(b.x + 100, b.y + 30);
    await page.mouse.down();
    await page.mouse.move(b.x + 100, b.y + 90, { steps: 4 }); // moves at once: that is a scroll
    await page.waitForTimeout(600);
    await expect(page.getByTestId('opt-expense-trash')).not.toHaveClass(/on/);
    await page.mouse.up();
    await page.waitForTimeout(300);
    await page.mouse.move(b.x + 100, b.y + 30);
    await page.mouse.down(); await page.waitForTimeout(150); await page.mouse.up(); // a short press is a tap
    await expect(page.getByTestId('opt-expense-open-1')).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByTestId('opt-expense-trash')).not.toHaveClass(/on/);
  });

  test('holding an open row folds it and carries it like the others; a long list scrolls when the row is held near its edge', async ({ page }) => {
    await openApp(page);
    await openSettings(page, 'personal'); // twelve of her own words: longer than the screen
    await openRow(page, 'opt-personal', 0);
    const scrollTop = () => page.evaluate(() => document.querySelector('.set-page .settings-body')!.scrollTop);
    const b = (await page.getByTestId('opt-personal-open-0').boundingBox())!;
    await page.mouse.move(b.x + 100, b.y + 30);
    await page.mouse.down(); await page.waitForTimeout(550);
    await expect(page.getByTestId('opt-personal-row-0')).toHaveClass(/lift/);
    await expect(page.getByTestId('opt-personal-name-0')).toHaveCount(0); // it folded
    const trash = (await page.getByTestId('opt-personal-trash').boundingBox())!;
    await page.mouse.move(b.x + 100, trash.y - 30, { steps: 10 }); // near the bottom edge, above the trash
    await expect.poll(scrollTop, { timeout: 4000 }).toBeGreaterThan(80); // the page runs on under the finger
    await page.mouse.up(); await page.waitForTimeout(800);
    expect(await page.evaluate(async () => ((await (window as any).__vizitai.repo.listOptions('personal')) as unknown[]).length)).toBe(12); // eslint-disable-line @typescript-eslint/no-explicit-any
  });

  test('a service can be moved the same way, and the booking screen offers them in that order', async ({ page }) => {
    await openApp(page);
    await openSettings(page, 'services');
    const names = () => page.evaluate(async () => ((await (window as any).__vizitai.repo.listServices()) as { name: string }[]).map((s) => s.name)); // eslint-disable-line @typescript-eslint/no-explicit-any
    const before = await names();
    await dragRow(page, 'svc', 0, 2);
    await expect.poll(names).toEqual([before[1], before[2], before[0], ...before.slice(3)]);
    await page.getByTestId('tab-calendar').click();
    await page.getByTestId('slot-2026-10-14T10:00').click();
    await page.getByTestId('field-name').fill('Ona');
    await page.getByTestId('field-name').press('Enter');
    await expect(page.getByTestId('svc-2')).toContainText(before[0]!);
  });
});
