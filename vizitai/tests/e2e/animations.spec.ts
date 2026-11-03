import { test, expect, type Page } from '@playwright/test';
import { openApp, openSettings, seedAppts, seedOptions } from './helpers';

/* eslint-disable @typescript-eslint/no-explicit-any */
// Everything that moves should run on the compositor (transform, opacity) and finish quickly. This samples every
// animation and transition that starts while the app is used and fails on properties that force layout.
const LAYOUT = /^(width|height|top|left|right|bottom|margin.*|padding.*|border-width|font-size|line-height|inset.*|max-.*|min-.*)$/;

async function watch(page: Page) {
  await page.evaluate(() => {
    const w = window as any;
    w.__anim = { props: new Set<string>(), longest: 0, seen: 0 };
    const sample = () => {
      for (const a of document.getAnimations()) {
        const e = a.effect as KeyframeEffect | null;
        if (!e || (e.target as HTMLElement | null)?.closest?.('.kb-primer')) continue;
        w.__anim.seen++;
        const t = e.getComputedTiming();
        if (typeof t.duration === 'number' && t.iterations !== Infinity) w.__anim.longest = Math.max(w.__anim.longest, t.duration + (t.delay as number));
        if (a instanceof CSSTransition) w.__anim.props.add(a.transitionProperty);
        else for (const k of e.getKeyframes()) for (const p of Object.keys(k)) if (!['offset', 'easing', 'composite', 'computedOffset'].includes(p)) w.__anim.props.add(p);
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
}
const report = (page: Page) => page.evaluate(() => { const a = (window as any).__anim; return { props: [...a.props] as string[], longest: a.longest as number, seen: a.seen as number }; });

test('sheets, pages, tabs and view changes only animate transform and opacity-type properties, and none take longer than 0.7 s', async ({ page }) => {
  test.setTimeout(90_000); // it walks through the whole app
  await openApp(page, '2026-10-14T10:40:00');
  await seedOptions(page);
  const [id] = await seedAppts(page, [{ name: 'Ona', start: '2026-10-14T09:00' }, { name: 'Rasa', start: '2026-10-14T15:00' }]);
  await watch(page);
  // booking flow: open, go through the screens, close
  await page.getByTestId('slot-2026-10-14T12:00').click();
  await page.getByTestId('field-name').fill('Ona');
  await page.getByTestId('btn-next').click();
  await page.waitForTimeout(450);
  await page.getByTestId('time-row').click();
  await page.waitForTimeout(450);
  await page.getByTestId('btn-back').click();
  await page.waitForTimeout(450);
  await page.getByTestId('btn-back').click();
  await page.getByTestId('type-personal').click();
  await page.getByTestId('option-0').click();
  await page.getByTestId('btn-dismiss').click();
  await page.waitForTimeout(450);
  // amount sheet and its follow-up question
  await page.getByTestId(`entry-${id}`).click();
  await page.waitForTimeout(300);
  await page.getByTestId('amount-input').fill('30');
  await page.getByTestId('amount-confirm').click();
  await page.waitForTimeout(300);
  await page.getByTestId('again-no').click();
  await page.waitForTimeout(450);
  // views, tabs, settings pages
  await page.getByTestId('seg-week').click();
  await page.waitForTimeout(450);
  await page.getByTestId('seg-day').click();
  await page.waitForTimeout(450);
  for (const tab of ['clients', 'expenses', 'calendar']) { await page.getByTestId(`tab-${tab}`).click(); await page.waitForTimeout(200); }
  // Klientai: the list, its tiles and filter sheet; Išlaidos: every page of the analysis with the glass period buttons
  await page.getByTestId('tab-clients').click();
  await page.getByTestId('tile-due').click();
  await page.waitForTimeout(450);
  await page.getByTestId('tile-due').click();
  await page.getByTestId('client-filter').click();
  await page.waitForTimeout(450);
  await page.getByTestId('sort-az').click();
  await page.waitForTimeout(450);
  await page.getByTestId('tab-expenses').click();
  await page.getByTestId('expenses-seg-stats').click();
  await page.waitForTimeout(500);
  for (const s of ['freq', 'profit', 'time', 'new']) { await page.getByTestId(`stat-seg-${s}`).click(); await page.waitForTimeout(500); }
  await page.getByTestId('glass-3').click();
  await page.waitForTimeout(500);
  await page.getByTestId('expenses-seg-main').click();
  await page.waitForTimeout(450);
  await page.getByTestId('tab-calendar').click();
  await openSettings(page, 'services');
  await page.getByTestId('settings-back').click();
  await page.waitForTimeout(450);
  const r = await report(page);
  expect(r.seen).toBeGreaterThan(20); // it really watched something
  const bad = r.props.filter((p) => LAYOUT.test(p));
  expect(bad, `layout-forcing animated properties: ${bad.join(', ')}`).toEqual([]);
  expect(r.longest).toBeLessThanOrEqual(700); // the confetti is the longest (about 0.65 s); everything else is under 0.35 s
});

test('with Reduce Motion on, sheets and pages appear without movement', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openApp(page);
  await page.getByTestId('slot-2026-10-14T12:00').click();
  await expect(page.getByTestId('sheet')).toBeVisible();
  const d = await page.getByTestId('sheet').evaluate((el) => getComputedStyle(el).animationDuration);
  expect(parseFloat(d)).toBeLessThan(0.01); // 1 ms, i.e. no slide
});

test('a long list of swipe rows does not give every row its own compositor layer', async ({ page }) => {
  await openApp(page);
  await page.evaluate(async () => {
    const { repo } = (window as any).__vizitai;
    const svc = await repo.listServices(true);
    for (let i = 0; i < 12; i++) await repo.createAppointment({ kind: 'client', name: 'Klientas ' + String.fromCharCode(65 + i), serviceId: svc[0].id, start: '2026-10-20T10:00' });
  });
  await page.getByTestId('tab-clients').click();
  await expect(page.getByTestId('client-swipe-11')).toBeVisible();
  const layers = await page.locator('.swipe-content').evaluateAll((els) => els.filter((e) => getComputedStyle(e).willChange !== 'auto').length);
  expect(layers).toBe(0);
});

test.describe('Low Power Mode (30 Hz)', () => {
  const open = async (page: Page, fps: 'low' | 'full') => {
    await page.clock.install({ time: new Date('2026-10-14T12:00:00') });
    await page.goto(`/?fps=${fps}`);
    await expect(page.getByTestId('app')).toBeVisible();
    await page.waitForFunction(() => !!(window as any).__vizitai);
  };
  const data = (page: Page) => page.evaluate(async () => {
    const { repo } = (window as any).__vizitai;
    const svc = await repo.listServices(true);
    const a = await repo.createAppointment({ kind: 'client', name: 'Ona', serviceId: svc[0].id, start: '2026-10-13T10:00' });
    await repo.setAmount(a.id, 4000);
  });

  test('in the low mode the page is marked, animations are shorter and the blur is gone; at full speed nothing changes', async ({ page }) => {
    await open(page, 'full');
    await expect(page.locator('html')).toHaveAttribute('data-fps', 'full');
    const seconds = (v: string) => (v.endsWith('ms') ? parseFloat(v) / 1000 : parseFloat(v)); // the browser may write 220ms as .22s
    const med = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--t-med').trim());
    expect(seconds(med)).toBeCloseTo(0.22);
    await data(page);
    await page.getByTestId('tab-expenses').click();
    await page.getByTestId('expenses-seg-stats').click();
    await expect(page.getByTestId('glass')).toBeVisible();
    expect(await page.getByTestId('glass').evaluate((el) => getComputedStyle(el).backdropFilter || (getComputedStyle(el) as any).webkitBackdropFilter)).toContain('blur');

    await open(page, 'low');
    await expect(page.locator('html')).toHaveAttribute('data-fps', 'low');
    expect(seconds(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--t-med').trim()))).toBeCloseTo(0.16);
    await data(page);
    await page.getByTestId('tab-expenses').click();
    await page.getByTestId('expenses-seg-stats').click();
    await expect(page.getByTestId('glass')).toBeVisible();
    expect(await page.getByTestId('glass').evaluate((el) => getComputedStyle(el).backdropFilter || (getComputedStyle(el) as any).webkitBackdropFilter)).toBe('none');
    // still works: a hold card opens and can be let go
    await page.getByTestId('tab-clients').click();
    const b = (await page.getByTestId('client-row-0').boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down(); await page.waitForTimeout(700); await page.mouse.up();
    await expect(page.getByTestId('peek')).toBeVisible();
    await page.getByTestId('peek-back').click({ position: { x: 12, y: 12 } });
    await expect(page.getByTestId('peek')).toHaveCount(0);
  });

  test('the monitor itself: frames arriving 33 ms apart switch the app to the low mode, and it stays full at normal speed', async ({ page }) => {
    test.setTimeout(60_000);
    await page.addInitScript(() => { // a screen held at 30 Hz: frames come on a 33.3 ms beat and carry the time of the beat, as the real ones do
      const beat = 1000 / 30;
      window.requestAnimationFrame = (cb: FrameRequestCallback) => {
        const at = Math.ceil((performance.now() + 1) / beat) * beat;
        return window.setTimeout(() => cb(at), Math.max(0, at - performance.now()));
      };
    });
    await page.goto('/');
    await expect(page.getByTestId('app')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-fps', 'low', { timeout: 25_000 });
  });

  test('at normal speed the monitor leaves the app in the full mode', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/');
    await expect(page.getByTestId('app')).toBeVisible();
    await page.waitForTimeout(8000); // longer than the first two looks
    await expect(page.locator('html')).toHaveAttribute('data-fps', 'full');
  });
});
