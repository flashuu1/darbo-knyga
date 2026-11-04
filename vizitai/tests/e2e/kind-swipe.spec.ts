import { test, expect, type Page } from '@playwright/test';
import { openApp, seedOptions } from './helpers';

const NOW = '2026-10-14T12:00:00';
async function open(page: Page) {
  await openApp(page, NOW);
  await seedOptions(page);
  await page.getByTestId('btn-add').click();
  await expect(page.getByTestId('type-client')).toBeVisible();
  await page.waitForTimeout(600); // the sheet has come up
}
/** A sideways swipe with the mouse, from (x, y) by dx. */
async function swipe(page: Page, x: number, y: number, dx: number) {
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + 2, { steps: 4 }); await page.mouse.move(x + dx, y + 4, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(450);
}
const pressed = (page: Page, k: string) => expect(page.getByTestId(`type-${k}`)).toHaveAttribute('aria-pressed', 'true');

test.describe('the same cards everywhere in a new entry', () => {
  test('the services are cards like the choices of Asmeninis and Išlaidos: gradient, picture, round check, same size', async ({ page }) => {
    await open(page);
    await page.getByTestId('field-name').fill('Ona');
    await page.getByTestId('field-name').press('Enter');
    await expect(page.getByTestId('svc-0')).toBeVisible();
    await page.waitForTimeout(500);
    const look = (id: string) => page.getByTestId(id).evaluate((el) => {
      const c = getComputedStyle(el), r = el.getBoundingClientRect();
      return { cls: el.className.includes('opt-card'), grad: c.backgroundImage.includes('gradient'), ico: !!el.querySelector('.opt-ico'), radio: !!el.querySelector('.radio'), radius: c.borderRadius, h: Math.round(r.height), minH: c.minHeight, pad: c.padding };
    });
    const svc = await look('svc-0');
    expect(svc).toMatchObject({ cls: true, grad: true, ico: true, radio: true });
    await page.getByTestId('btn-back').click(); await page.waitForTimeout(500);
    await page.getByTestId('type-personal').click(); await page.waitForTimeout(500);
    const opt = await look('option-0');
    expect(svc.radius).toBe(opt.radius);
    expect(svc.minH, 'a service card and a choice card have the same size').toBe(opt.minH);
    expect(svc.pad).toBe(opt.pad);
    expect(svc.h).toBeGreaterThanOrEqual(parseInt(opt.minH));
    // choosing still works the same: one card is on, the others are not
    await page.getByTestId('type-client').click();
    await page.getByTestId('field-name').fill('Ona'); await page.getByTestId('field-name').press('Enter');
    await page.getByTestId('svc-2').click();
    await expect(page.getByTestId('svc-2')).toHaveClass(/on/);
    await expect(page.getByTestId('svc-0')).not.toHaveClass(/on/);
  });
});

test.describe('a swipe on the first screen moves between Klientas, Asmeninis and Išlaidos', () => {
  test('left goes forward, right goes back, nothing past the ends; the glass drop follows', async ({ page }) => {
    await open(page);
    const y = 560;
    await pressed(page, 'client');
    await swipe(page, 360, y, -220); await pressed(page, 'personal');
    await expect(page.getByTestId('option-list')).toBeVisible();
    await expect(page.locator('.kind-body')).toHaveClass(/slide-in-next/);
    await swipe(page, 360, y, -220); await pressed(page, 'expense');
    await expect(page.getByTestId('expense-amount')).toBeVisible();
    await swipe(page, 360, y, -220); await pressed(page, 'expense'); // nothing after the last
    await swipe(page, 60, y, 220); await pressed(page, 'personal');
    await expect(page.locator('.kind-body')).toHaveClass(/slide-in-prev/);
    await swipe(page, 60, y, 220); await pressed(page, 'client');
    await expect(page.getByTestId('field-name')).toBeVisible();
    await swipe(page, 60, y, 220); await pressed(page, 'client'); // nothing before the first
    // the glass drop is under the chosen one
    const drop = (await page.locator('.lq-seg.wide .lq-drop').boundingBox())!, c = (await page.getByTestId('type-client').boundingBox())!;
    expect(Math.abs(drop.x + drop.width / 2 - (c.x + c.width / 2))).toBeLessThan(6);
  });

  test('a swipe that starts on a choice does not pick it, one that starts in the name field or goes up and down does nothing', async ({ page }) => {
    await open(page);
    await page.getByTestId('type-personal').click(); await page.waitForTimeout(500);
    const b = (await page.getByTestId('option-1').boundingBox())!;
    await swipe(page, b.x + b.width - 30, b.y + b.height / 2, -200); // starts on a card
    await pressed(page, 'expense');
    await expect(page.getByTestId('option-1')).not.toHaveClass(/on/);
    await page.getByTestId('type-client').click(); await page.waitForTimeout(500);
    const f = (await page.getByTestId('field-name').boundingBox())!;
    await swipe(page, f.x + f.width - 20, f.y + f.height / 2, -200); // starts in the field
    await pressed(page, 'client');
    await page.mouse.move(300, 600); await page.mouse.down(); await page.mouse.move(305, 420, { steps: 6 }); await page.mouse.up(); // up and down
    await pressed(page, 'client');
    await swipe(page, 360, 560, -28); // too short
    await pressed(page, 'client');
  });

  test('it also works the other way round from the switch itself: tapping moves the choices in from the right side too', async ({ page }) => {
    await open(page);
    await page.getByTestId('type-expense').click();
    await expect(page.locator('.kind-body')).toHaveClass(/slide-in-next/);
    await page.getByTestId('type-personal').click();
    await expect(page.locator('.kind-body')).toHaveClass(/slide-in-prev/);
  });
});
