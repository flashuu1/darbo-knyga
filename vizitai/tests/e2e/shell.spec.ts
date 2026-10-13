import { test, expect } from '@playwright/test';

test('standalone launch shows the three Lithuanian tabs', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('app')).toBeVisible();
  await expect(page.getByTestId('tab-calendar')).toHaveText('Kalendorius');
  await expect(page.getByTestId('tab-clients')).toHaveText('Klientai');
  await expect(page.getByTestId('tab-settings')).toHaveText('Nustatymai');
});

test('a Safari tab shows only the install screen and writes nothing', async ({ page }) => {
  await page.goto('/?safari');
  await expect(page.getByTestId('install')).toContainText('Įdiekite programėlę pagrindiniame ekrane');
  const dbs = await page.evaluate(() => indexedDB.databases());
  expect(dbs).toEqual([]);
});

test('if the database cannot be opened, a Lithuanian message replaces the blank screen', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => {
    IDBFactory.prototype.open = function () { throw new DOMException('blocked for the test', 'UnknownError'); };
  });
  await page.goto('/');
  await expect(page.getByTestId('boot-error')).toHaveText('Nepavyko atidaryti programėlės. Uždarykite ją ir atidarykite iš naujo.');
  await expect(page.getByTestId('app')).toHaveCount(0);
  expect(errors.length).toBeGreaterThan(0); // logged with console.error
});

test.describe('the document is locked like a native app', () => {
  test('no page scroll, rubber-banding or zoom; only the inner scrollers move', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('app')).toBeVisible();
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /maximum-scale=1, user-scalable=no/);
    const css = await page.evaluate(() => [document.documentElement, document.body].map((el) => {
      const s = getComputedStyle(el);
      return { position: s.position, overflow: s.overflow, touch: s.touchAction };
    }));
    for (const c of css) expect(c).toEqual({ position: 'fixed', overflow: 'hidden', touch: 'pan-x pan-y' });
    // (overscroll-behavior is not exposed by the test WebKit build; it is set in styles.css and verified on device)
    // Safari pinch gestures are cancelled
    expect(await page.evaluate(() => document.dispatchEvent(new Event('gesturestart', { cancelable: true })))).toBe(false);
    // the window itself never scrolls (not even programmatically, e.g. by iOS revealing a field)
    await page.evaluate(() => window.scrollTo(0, 400));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    // the timeline does scroll
    const moved = await page.getByTestId('timeline').evaluate((el) => { const a = el.scrollTop; el.scrollTop = a + 200; return el.scrollTop !== a; });
    expect(moved).toBe(true);
  });

  for (const scheme of ['light', 'dark'] as const) {
    test(`header, status-bar colour and page background agree (${scheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto('/');
      await expect(page.getByTestId('app')).toBeVisible();
      const r = await page.evaluate((s) => {
        const meta = document.querySelector<HTMLMetaElement>(`meta[name="theme-color"][media="(prefers-color-scheme: ${s})"]`)!.content;
        const probe = document.createElement('div');
        probe.style.color = meta;
        document.body.append(probe);
        const metaRgb = getComputedStyle(probe).color;
        probe.remove();
        const header = document.querySelector('.chrome')!;
        return { metaRgb, html: getComputedStyle(document.documentElement).backgroundColor, header: getComputedStyle(header).backgroundColor, tabbar: getComputedStyle(document.querySelector('.tabbar')!).backgroundColor, headerTop: header.getBoundingClientRect().top };
      }, scheme);
      expect(r.html).toBe(r.metaRgb);
      expect(r.header).toBe(r.metaRgb); // solid, opaque, same as the status-bar strip
      expect(r.tabbar).toBe(r.metaRgb);
      expect(r.headerTop).toBe(0); // the header owns the very top edge (it pads the safe area itself)
    });
  }
});
