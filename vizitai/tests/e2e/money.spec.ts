import { test, expect, type Page } from '@playwright/test';
import { apptState, openApp, seedAppts } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */
const count = (page: Page, table: string) => page.evaluate((x) => (window as any).__vizitai.db[x].count(), table);

async function swipeLeft(page: Page, testId: string, dx = 130) {
  const b = (await page.getByTestId(testId).boundingBox())!;
  const y = b.y + b.height / 2, x = b.x + b.width - 40;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) { await page.mouse.move(x - (dx * i) / 6, y); await page.waitForTimeout(25); }
  await page.mouse.up();
}

test('the balance sits under the calendar title and is money in minus money out', async ({ page }) => {
  await openApp(page, '2026-10-14T12:00:00');
  await expect(page.getByTestId('balance-value')).toHaveText(/^0,00\s€$/);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T09:00' }]);
  await page.evaluate(async (x) => (window as any).__vizitai.repo.setAmount(x, 10000), id);
  await expect(page.getByTestId('balance-value')).toHaveText(/^100,00\s€$/);
  await page.evaluate(async () => {
    const { repo } = (window as any).__vizitai;
    const [o] = await repo.listOptions('expense');
    await repo.createAppointment({ kind: 'expense', title: o.name, optionId: o.id, amountCents: 3050, start: '2026-10-14T10:00' });
  });
  await expect(page.getByTestId('balance-value')).toHaveText(/^69,50\s€$/);
  await expect(page.getByTestId('balance-split')).toContainText('Gauta');
  const title = (await page.getByTestId('title').boundingBox())!, bal = (await page.getByTestId('balance').boundingBox())!;
  expect(bal.y).toBeGreaterThanOrEqual(title.y + title.height - 2);
  await page.getByTestId('seg-week').click();
  await expect(page.getByTestId('balance-value')).toBeVisible(); // on every calendar view
});

test('an expense is added from her own choices with an amount, shows in the calendar and lowers the balance', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('slot-2026-10-14T12:00').click();
  await page.getByTestId('type-expense').click();
  await expect(page.getByTestId('btn-next')).toBeDisabled();
  await page.getByTestId('option-1').click(); // Nuoma
  await expect(page.getByTestId('btn-next')).toBeDisabled(); // an amount is needed too
  await page.getByTestId('expense-amount').fill('12,5');
  await page.getByTestId('btn-next').click();
  await page.getByTestId('btn-save-time').click();
  await expect(page.getByTestId('col-2026-10-14')).toContainText('Nuoma');
  await expect(page.getByTestId('col-2026-10-14')).toContainText('−12,50');
  await expect(page.getByTestId('balance-value')).toHaveText(/^[-−]12,50\s€$/);
  expect(await page.getByTestId('balance-value').getAttribute('class')).toContain('neg');
});

test('an expense can be opened and its amount changed, and it never blocks a visit at the same time', async ({ page }) => {
  await openApp(page);
  const [vid] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T12:00' }]);
  const id = await page.evaluate(async () => {
    const { repo } = (window as any).__vizitai;
    const [o] = await repo.listOptions('expense');
    return (await repo.createAppointment({ kind: 'expense', title: o.name, optionId: o.id, amountCents: 1000, start: '2026-10-14T12:00' })).id;
  });
  expect(await page.evaluate(() => (window as any).__vizitai.repo.findOverlapFor({ start: '2026-10-14T12:00', kind: 'expense', serviceId: null }))).toBeUndefined();
  await page.getByTestId(`entry-${id}`).click();
  await expect(page.getByTestId('appt-amount')).toContainText('10,00');
  await page.getByTestId('appt-amount').click();
  await page.getByTestId('amount-input').fill('25');
  await page.getByTestId('amount-confirm').click();
  await expect.poll(async () => (await apptState(page, id)).amountCents).toBe(2500);
  expect((await apptState(page, vid)).amountCents ?? null).toBeNull();
});

test('Settings lists her own choices; she can add, rename and swipe-delete them, and the flow offers them', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('tab-settings').click();
  await expect(page.getByTestId('opt-personal-row-3')).toBeVisible();
  await expect(page.getByTestId('opt-expense-row-3')).toBeVisible();
  await page.getByTestId('opt-personal-add').click();
  await expect(page.getByTestId('opt-personal-row-4')).toBeVisible();
  await page.getByTestId('opt-personal-name-4').fill('Sporto salė');
  await page.getByTestId('opt-personal-name-4').blur();
  await expect.poll(() => page.evaluate(async () => (await (window as any).__vizitai.repo.listOptions('personal')).map((o: any) => o.name))).toContain('Sporto salė');
  await swipeLeft(page, 'opt-expense-swipe-0');
  await page.getByTestId('opt-expense-swipe-0-trash').click();
  await page.getByTestId('action-item-0').click();
  await expect.poll(() => page.evaluate(async () => (await (window as any).__vizitai.repo.listOptions('expense')).length)).toBe(3);
  await page.getByTestId('toast-undo').click();
  await expect.poll(() => page.evaluate(async () => (await (window as any).__vizitai.repo.listOptions('expense')).length)).toBe(4);
  await page.getByTestId('tab-calendar').click();
  await page.getByTestId('slot-2026-10-14T12:00').click();
  await page.getByTestId('type-personal').click();
  await expect(page.getByTestId('option-4')).toHaveText(/Sporto salė/);
  expect(await count(page, 'options')).toBe(9);
});

test('with the keyboard up the name suggestions stay above it, and dragging the list puts the keyboard away', async ({ page }) => {
  await openApp(page);
  await page.evaluate(async () => {
    const { repo } = (window as any).__vizitai;
    const svc = await repo.listServices(true);
    for (const n of 'ABCDEFGHIJKL'.split('').map((c) => 'Rasa ' + c)) await repo.createAppointment({ kind: 'client', name: n, serviceId: svc[0].id, start: '2026-10-20T10:00' });
  });
  await page.getByTestId('slot-2026-10-14T12:00').click();
  await page.getByTestId('field-name').fill('Ras');
  await expect(page.getByTestId('suggest-7')).toBeAttached();
  const vh = page.viewportSize()!.height;
  await page.evaluate(() => {
    const vv = window.visualViewport!;
    Object.defineProperty(vv, 'height', { configurable: true, get: () => window.innerHeight - 336 });
    vv.dispatchEvent(new Event('resize'));
  });
  // the pane that holds the list ends above the button, which is above the keyboard
  await expect.poll(async () => page.evaluate(() => document.querySelector('.flow-pane')!.getBoundingClientRect().bottom)).toBeLessThan(vh - 336);
  const first = (await page.getByTestId('suggest-0').boundingBox())!;
  expect(first.y + first.height).toBeLessThan(vh - 336);
  await page.evaluate(() => {
    const pane = document.querySelector('.flow-pane')!;
    const fire = (type: string, y: number) => {
      const tt = { identifier: 1, target: pane, clientX: 200, clientY: y };
      const ev = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(ev, { touches: type === 'touchend' ? [] : [tt], changedTouches: [tt] });
      pane.dispatchEvent(ev);
    };
    fire('touchstart', 500); fire('touchmove', 470); fire('touchmove', 440);
  });
  await expect(page.getByTestId('field-name')).not.toBeFocused();
});
