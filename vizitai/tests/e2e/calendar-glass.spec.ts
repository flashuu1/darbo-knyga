import { test, expect, type Page } from '@playwright/test';
import { openApp } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */
const NOW = '2026-10-14T12:00:00';
const box = async (page: Page, testId: string) => (await page.getByTestId(testId).boundingBox())!;

test.describe('the calendar bar is liquid glass', () => {
  test('the month button, the Diena / Savaitė switch and Šiandien are glass, and the drop slides to the chosen side', async ({ page }) => {
    await openApp(page, NOW);
    for (const id of ['month-name', 'btn-today']) {
      const css = await page.getByTestId(id).evaluate((el) => { const c = getComputedStyle(el); return { blur: c.backdropFilter || (c as any).webkitBackdropFilter, bg: c.backgroundImage !== 'none' || c.backgroundColor !== 'rgba(0, 0, 0, 0)', color: c.color }; });
      expect(css.blur, `${id} has no blurred backdrop`).toMatch(/blur/);
      expect(css.bg).toBe(true);
      expect(css.color, `${id} is no longer blue text`).not.toBe('rgb(0, 122, 255)');
    }
    const seg = page.locator('.lq-seg');
    expect(await seg.evaluate((el) => (getComputedStyle(el).backdropFilter || '').includes('blur'))).toBe(true);
    const drop = page.locator('.lq-drop');
    const a = (await drop.boundingBox())!;
    await page.getByTestId('seg-week').click();
    await expect.poll(async () => (await drop.boundingBox())!.x, { timeout: 2000 }).toBeGreaterThan(a.x + 40);
    await expect(page.getByTestId('seg-week')).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(600);
    const b = (await drop.boundingBox())!, w = await box(page, 'seg-week');
    expect(Math.abs(b.x + b.width / 2 - (w.x + w.width / 2)), 'the drop rests under the chosen label').toBeLessThan(6);
    await page.getByTestId('seg-day').click();
    await expect.poll(async () => Math.abs((await drop.boundingBox())!.x - a.x), { timeout: 2000 }).toBeLessThan(3);
    await page.getByTestId('month-name').click(); // the month grid: neither is chosen, the drop is gone
    await expect.poll(() => drop.evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
  });

  test('the drop only moves with transform: nothing in the bar animates a layout property', async ({ page }) => {
    await openApp(page, NOW);
    await page.evaluate(() => {
      const w = window as any; w.__props = new Set<string>();
      const tick = () => { for (const a of document.getAnimations()) { if (a instanceof CSSTransition) w.__props.add(a.transitionProperty); } requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    });
    await page.getByTestId('seg-week').click(); await page.waitForTimeout(700);
    await page.getByTestId('seg-day').click(); await page.waitForTimeout(700);
    const props: string[] = await page.evaluate(() => [...(window as any).__props]);
    expect(props.filter((p) => /^(width|height|top|left|right|bottom|margin.*|padding.*|inset.*)$/.test(p)), `layout properties animated: ${props.join(', ')}`).toEqual([]);
  });

  for (const date of ['2026-08-14', '2026-09-14', '2026-11-14', '2026-12-14', '2026-10-14', '2026-02-14']) {
    test(`the bar with the month of ${date}: the switch is in the middle, the blobs are one height and hug their text, nothing overlaps, no "<"`, async ({ page }) => {
      await openApp(page, NOW);
      await page.evaluate((d) => (window as any).__vizitai.ui.set({ date: d }), date);
      await page.waitForTimeout(300);
      const vw = page.viewportSize()!.width;
      for (const view of ['day', 'week', 'month']) {
        if (view === 'week') await page.getByTestId('seg-week').click();
        if (view === 'month') await page.getByTestId('month-name').click();
        await page.waitForTimeout(500);
        const m = await box(page, 'month-name'), p = await box(page, 'btn-add');
        const seg = (await page.locator('.lq-seg').boundingBox())!;
        const at = `(${date}, ${view})`;
        expect(Math.abs(seg.x + seg.width / 2 - vw / 2), `the switch is off centre ${at}`).toBeLessThanOrEqual(1);
        expect(seg.x - (m.x + m.width), `the month blob is too close to the switch ${at}`).toBeGreaterThanOrEqual(6);
        expect(p.x - (seg.x + seg.width), `the switch is too close to + ${at}`).toBeGreaterThanOrEqual(6);
        expect(p.x + p.width).toBeLessThanOrEqual(vw);
        expect(m.x).toBeGreaterThanOrEqual(0);
        for (const h of [m.height, seg.height, p.height]) expect(Math.abs(h - 40), `the blobs are not all 40 tall ${at}`).toBeLessThanOrEqual(1);
        expect(Math.abs(p.width - 40)).toBeLessThanOrEqual(1);
        // the month blob hugs its text: even padding, nothing sticks out, and no "<" (only the small chevron while the month grid is open)
        const hug = await page.getByTestId('month-name').evaluate((el) => {
          const text = el.querySelector('span')!.getBoundingClientRect(), r = el.getBoundingClientRect(), svg = el.querySelector('svg');
          return { left: text.left - r.left, right: r.right - (svg ? svg.getBoundingClientRect().right : text.right), svg: !!svg };
        });
        expect(hug.left, `the text touches the left edge of the blob ${at}`).toBeGreaterThanOrEqual(11);
        expect(hug.right, `the text sticks out of the blob on the right ${at}`).toBeGreaterThanOrEqual(11);
        expect(hug.svg, `the "<" (or any icon) beside the month ${at}`).toBe(view === 'month');
        if (view !== 'month') expect(Math.abs(hug.left - hug.right), `uneven padding ${at}`).toBeLessThanOrEqual(1.5);
      }
    });
  }

  test('Šiandien is a glass blob at the bottom left, above the tab bar, in every view; it brings the calendar back to today', async ({ page }) => {
    await openApp(page, NOW);
    for (const view of ['day', 'week', 'month']) {
      if (view === 'week') await page.getByTestId('seg-week').click();
      if (view === 'month') await page.getByTestId('month-name').click();
      await page.waitForTimeout(400);
      const t = await box(page, 'btn-today'), tab = await box(page, 'tab-calendar'), vh = page.viewportSize()!.height;
      expect(t.x, `${view}: bottom left`).toBeLessThanOrEqual(24);
      expect(t.y, `${view}: in the lower half`).toBeGreaterThan(vh * 0.7);
      expect(t.y + t.height, `${view}: above the tab bar`).toBeLessThanOrEqual(tab.y);
      expect(Math.abs(t.height - 40)).toBeLessThanOrEqual(1);
    }
    await page.evaluate(() => (window as any).__vizitai.ui.set({ date: '2026-03-02', view: 'day' }));
    await page.waitForTimeout(300);
    await page.getByTestId('btn-today').click();
    await expect(page.getByTestId('title')).toContainText('spalio 14');
  });
});

/** How far (px) the text of the chosen option is from the middle of the glass drop under it. */
const labelOffset = (page: Page, testId: string) => page.getByTestId(testId).evaluate((btn) => {
  const r = document.createRange(); r.selectNodeContents(btn);
  const text = r.getBoundingClientRect(), drop = btn.parentElement!.querySelector('.lq-drop')!.getBoundingClientRect();
  return Math.abs(text.left + text.width / 2 - (drop.left + drop.width / 2));
});

test.describe('the labels of the glass switches sit in the middle of their drop', () => {
  test('Diena / Savaitė: both labels, in both states', async ({ page }) => {
    await openApp(page, NOW);
    for (const id of ['seg-week', 'seg-day', 'seg-week']) {
      await page.getByTestId(id).click();
      await expect.poll(() => labelOffset(page, id), { message: `${id}: the label is off the middle of its drop`, timeout: 4000 }).toBeLessThanOrEqual(1.5); // once the drop has come to rest
    }
    // the two options are equally wide, so the drop is under exactly one of them
    const w = await page.locator('.lq-opt').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
    expect(w[0]).toBe(w[1]);
  });

  test('Klientas / Asmeninis / Išlaidos in the new entry: glass, equal thirds, every label in the middle of its drop', async ({ page }) => {
    await openApp(page, NOW);
    await page.getByTestId('btn-add').click();
    await expect(page.getByTestId('type-client')).toBeVisible();
    await page.waitForTimeout(500);
    const seg = page.locator('.lq-seg.wide');
    expect(await seg.evaluate((el) => getComputedStyle(el).backdropFilter)).toMatch(/blur/);
    for (const k of ['type-personal', 'type-expense', 'type-client']) {
      await page.getByTestId(k).click();
      await expect.poll(() => labelOffset(page, k), { message: `${k}: the label is off the middle of its drop`, timeout: 4000 }).toBeLessThanOrEqual(1.5);
      await expect(page.getByTestId(k)).toHaveAttribute('aria-pressed', 'true');
    }
    const w = await page.locator('.lq-seg.wide .lq-opt').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
    expect(new Set(w).size, 'the three options are equally wide').toBe(1);
    const s = (await seg.boundingBox())!, sheet = (await page.getByTestId('sheet').boundingBox().catch(() => null));
    expect(s.width).toBeGreaterThan(page.viewportSize()!.width - 60); // it fills the width
    expect(sheet === null || s.x >= sheet.x).toBe(true);
  });
});

test.describe('the summaries open up to the button that opened them at most', () => {
  async function many(page: Page) {
    await page.evaluate(async () => { // 28 visits that took place today and wait for their amount: a long page in all three summaries
      const { repo } = (window as any).__vizitai;
      const svc = await repo.listServices(true);
      for (let i = 0; i < 28; i++) await repo.createAppointment({ kind: 'client', name: `Klientas ${i}`, serviceId: svc[0].id, start: `2026-10-14T${String(Math.floor((i * 25) / 60)).padStart(2, '0')}:${String((i * 25) % 60).padStart(2, '0')}` });
    });
  }

  for (const [view, label] of [['day', 'Dienos'], ['week', 'Savaitės'], ['month', 'Mėnesio']] as const) {
    test(`${label} suvestinė with many entries does not reach higher than its button`, async ({ page }) => {
      await openApp(page, NOW);
      await many(page);
      if (view === 'week') await page.getByTestId('seg-week').click();
      if (view === 'month') await page.getByTestId('month-name').click();
      await page.waitForTimeout(500);
      const btn = await box(page, 'summary-btn');
      await page.getByTestId('summary-btn').click();
      const sheet = page.getByTestId('day-sheet');
      await expect(sheet).toBeVisible();
      await expect(page.getByTestId('eod-row-0')).toBeVisible();
      await page.waitForTimeout(600);
      const s = (await sheet.boundingBox())!;
      expect(s.y, 'the sheet covers the button that opened it').toBeGreaterThanOrEqual(btn.y + btn.height - 1);
      expect(s.y, 'the sheet should be as tall as that allows when there is a lot in it').toBeLessThan(btn.y + btn.height + 30);
      expect(s.y + s.height).toBeGreaterThanOrEqual(page.viewportSize()!.height - 2); // and it still sits on the bottom
      await expect(page.getByTestId('summary-btn')).toBeVisible();
    });
  }

  test('with few entries the sheet is only as tall as its content', async ({ page }) => {
    await openApp(page, NOW);
    await page.getByTestId('summary-btn').click();
    await expect(page.getByTestId('day-sheet')).toBeVisible();
    await page.waitForTimeout(500);
    const s = (await page.getByTestId('day-sheet').boundingBox())!;
    expect(s.height).toBeLessThan(page.viewportSize()!.height * 0.7);
  });
});
