import { test, expect, type Page } from '@playwright/test';
import site from '../../site.config.json' with { type: 'json' };

// The production build, served under its real sub-path (https://flashuu1.github.io/darbo-knyga/).
// Runs in the `prod-base` project only (service workers allowed). Skipped if VIZITAI_BASE overrides the base.
const BASE = site.basePath;
test.skip(!!process.env.VIZITAI_BASE, 'base overridden');

function watchFailures(page: Page) {
  const failed: string[] = [];
  page.on('requestfailed', (r) => failed.push(`${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.url()} ${r.status()}`); });
  return failed;
}

test('Safari tab under the sub-path shows the install screen without network failures', async ({ page }) => {
  const failed = watchFailures(page);
  await page.goto(BASE);
  await expect(page.getByTestId('install')).toBeVisible();
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', BASE + 'manifest.webmanifest');
  const m = await (await page.request.get(BASE + 'manifest.webmanifest')).json();
  expect([m.start_url, m.scope]).toEqual([BASE, BASE]);
  expect((await page.request.get('/assets/nope.js')).status()).toBe(404); // nothing is served outside the base
  expect(failed).toEqual([]);
});

test('standalone launch registers the SW at the sub-path scope and works offline', async ({ page, context }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true })); // iOS Home Screen launch
  const failed = watchFailures(page);
  await page.goto(BASE);
  await expect(page.getByTestId('app')).toBeVisible();
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(scope).toBe(new URL(BASE, page.url()).href);
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.ready).active?.state)).toBe('activated');
  // Precache is filled during install; wait until the shell is cached.
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).length)).toBeGreaterThan(0);
  expect(failed).toEqual([]);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('app')).toBeVisible();
  await context.setOffline(false);
});
