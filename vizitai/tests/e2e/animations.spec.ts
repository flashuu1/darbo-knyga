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

test('sheets, pages, tabs and view changes only animate transform and opacity-type properties, and none take longer than half a second', async ({ page }) => {
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
  await openSettings(page, 'services');
  await page.getByTestId('settings-back').click();
  await page.waitForTimeout(450);
  const r = await report(page);
  expect(r.seen).toBeGreaterThan(20); // it really watched something
  const bad = r.props.filter((p) => LAYOUT.test(p));
  expect(bad, `layout-forcing animated properties: ${bad.join(', ')}`).toEqual([]);
  expect(r.longest).toBeLessThanOrEqual(500);
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
