import { test, expect, type Page } from '@playwright/test';
import { openApp, openRow, openSettings, seedOptions } from './helpers';

/**
 * The gesture audit. A page that is taken away by a sideways swipe (Nustatymai pages, the client card) or turned by one (Išlaidos)
 * must never be taken by a drag that belongs to something else on it. This test does not know the pages' contents: it FINDS every
 * element on a page that scrolls sideways, whatever it is called and whoever adds it next, and drags on it. So a new row of chips,
 * a new strip of anything, is covered the moment it exists, on every page listed here. Add a page to the lists when a page
 * gets a page-level gesture.
 */

type Box = { x: number; y: number; width: number; height: number };
/** The elements inside `root` that scroll sideways and have something to scroll, as boxes (tagged so they can be told apart). */
const sideScrollers = (page: Page, root: string) => page.evaluate((sel) => {
  const out: Box[] = [];
  document.querySelectorAll(`${sel} *`).forEach((el) => {
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (/(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1 && r.width > 40 && r.height > 10 && r.bottom > 0 && r.top < window.innerHeight) out.push({ x: r.x, y: r.y, width: r.width, height: r.height });
  });
  return out;
}, root);

/** Presses at (x, y) and drags sideways by dx; `then` looks at what the page does with the finger still down. */
async function dragSideways(page: Page, x: number, y: number, dx: number, then: () => Promise<void>) {
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y, { steps: 5 });
  await page.mouse.move(x + dx, y, { steps: 5 });
  await page.waitForTimeout(80);
  await then();
  await page.mouse.up();
  await page.waitForTimeout(600);
}
const pageX = (page: Page, testId: string) => page.getByTestId(testId).evaluate((el) => Math.round(el.getBoundingClientRect().x));

const SETTINGS = ['services', 'hours', 'personal', 'expenses', 'backup', 'about'] as const;
const rowsOf = { services: 'svc', personal: 'opt-personal', expenses: 'opt-expense' } as const;

for (const section of SETTINGS) {
  test(`Nustatymai > ${section}: only a swipe from the left part takes the page; anything that scrolls sideways keeps its own drag`, async ({ page }) => {
    await openApp(page);
    await seedOptions(page);
    await openSettings(page, section);
    const id = `settings-page-${section}`;
    if (section in rowsOf) await openRow(page, rowsOf[section as keyof typeof rowsOf], 0); // opens the editor: its rows of chips are in the page
    const vw = page.viewportSize()!.width;

    // 1. every element that scrolls sideways: a drag that starts on it, in its left part or in its middle, leaves the page where it is
    const scrollers = await sideScrollers(page, `[data-testid="${id}"]`);
    if (section === 'services' || section === 'personal') expect(scrollers.length, 'the audit must find the chips of the length').toBeGreaterThan(0);
    for (const b of scrollers) {
      for (const sx of [b.x + 24, b.x + b.width / 2]) {
        await dragSideways(page, sx, b.y + b.height / 2, Math.min(180, vw - sx - 4), async () => {
          expect(await pageX(page, id), `the page moved with a drag that started on something that scrolls sideways (at x ${Math.round(sx)})`).toBe(0);
        });
        await expect(page.getByTestId(id)).toBeVisible();
        expect(await pageX(page, id)).toBe(0);
      }
    }

    // 2. the middle and the right of the page (empty header space): nothing happens
    const title = (await page.getByTestId(id).locator('.large-title').boundingBox())!;
    const mx = Math.round(vw * 0.62);
    await dragSideways(page, mx, title.y + title.height / 2, Math.min(150, vw - mx - 4), async () => {
      expect(await pageX(page, id), 'a swipe from the middle of the page moved it').toBe(0);
    });
    await expect(page.getByTestId(id)).toBeVisible();

    // 3. the left part: the page follows the finger and goes back when it is let go far enough
    await dragSideways(page, 30, title.y + title.height / 2, 220, async () => {
      expect(await pageX(page, id), 'a swipe from the left part did not move the page').toBeGreaterThan(100);
    });
    await expect(page.getByTestId(id)).toHaveCount(0);
  });
}

test('Išlaidos: a drag that starts on anything that scrolls sideways (the payers) does not turn the page, a swipe elsewhere does', async ({ page }) => {
  await openApp(page, '2026-10-14T12:00:00');
  await page.evaluate(async () => { // twelve people who paid this month: more than fit in the row
    const { repo } = (window as any).__vizitai; // eslint-disable-line @typescript-eslint/no-explicit-any
    const svc = await repo.listServices(true);
    for (let i = 0; i < 12; i++) {
      const a = await repo.createAppointment({ kind: 'client', name: `Klientas ${String.fromCharCode(65 + i)}`, serviceId: svc[0].id, start: `2026-10-${String(1 + (i % 12)).padStart(2, '0')}T10:00` });
      await repo.setAmount(a.id, 4000 + i * 500);
    }
  });
  await page.getByTestId('tab-expenses').click();
  await page.waitForTimeout(600);
  await expect(page.getByTestId('expenses-seg-main')).toHaveClass(/on/);
  const scrollers = await sideScrollers(page, '[data-testid="expenses"]');
  expect(scrollers.length, 'the audit must find the row of payers').toBeGreaterThan(0);
  const vw = page.viewportSize()!.width;
  for (const b of scrollers) {
    for (const sx of [b.x + 24, b.x + b.width / 2, b.x + b.width - 40]) {
      const dx = sx > vw / 2 ? -180 : 180;
      await dragSideways(page, sx, b.y + b.height / 2, dx, async () => {});
      await expect(page.getByTestId('expenses-seg-main'), `the page turned with a drag that started on something that scrolls sideways (at x ${Math.round(sx)})`).toHaveClass(/on/);
    }
  }
  // and the page still turns where nothing else scrolls
  const seg = (await page.getByTestId('expenses-seg').boundingBox())!;
  await dragSideways(page, 360, seg.y + seg.height / 2, -170, async () => {});
  await expect(page.getByTestId('stat-seg-new')).toHaveClass(/on/);
});

test('the client card: a swipe from the left part takes it back, from the middle it does not', async ({ page }) => {
  await openApp(page, '2026-10-14T12:00:00');
  await page.evaluate(async () => {
    const { repo } = (window as any).__vizitai; // eslint-disable-line @typescript-eslint/no-explicit-any
    const svc = await repo.listServices(true);
    await repo.createAppointment({ kind: 'client', name: 'Ona', serviceId: svc[0].id, start: '2026-10-10T10:00' });
  });
  await page.getByTestId('tab-clients').click();
  await page.getByTestId('client-row-0').click();
  await expect(page.getByTestId('client-card')).toBeVisible();
  await page.waitForTimeout(500);
  const vw = page.viewportSize()!.width;
  const scrollers = await sideScrollers(page, '[data-testid="client-card"]');
  for (const b of scrollers) await dragSideways(page, b.x + 24, b.y + b.height / 2, Math.min(180, vw - b.x - 28), async () => { expect(await pageX(page, 'client-card')).toBe(0); });
  const v = (await page.getByTestId('card-visits').boundingBox())!, y = v.y + v.height / 2;
  await dragSideways(page, Math.round(vw * 0.62), y, 150, async () => { expect(await pageX(page, 'client-card'), 'a swipe from the middle of the card moved it').toBe(0); });
  await expect(page.getByTestId('client-card')).toBeVisible();
  await dragSideways(page, 40, y, 220, async () => { expect(await pageX(page, 'client-card')).toBeGreaterThan(100); });
  await expect(page.getByTestId('client-card')).toHaveCount(0);
});
