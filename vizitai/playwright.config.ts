import { defineConfig, devices } from '@playwright/test';
// Ports are overridable (E2E_PORT / E2E_PROD_PORT) so parallel worktrees can run the suite side by side.
const PORT = process.env.E2E_PORT ?? '4173';
const PROD_PORT = process.env.E2E_PROD_PORT ?? '4180';
const device = { ...devices['iPhone 17 Pro Max'], locale: 'lt-LT', timezoneId: 'Europe/Vilnius' };
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  projects: [
    {
      name: 'app',
      testIgnore: 'prod-base.spec.ts',
      use: { ...device, baseURL: `http://localhost:${PORT}`, serviceWorkers: 'block' },
    },
    {
      // Production build served under its real sub-path, service workers allowed (real offline check).
      name: 'prod-base',
      testMatch: 'prod-base.spec.ts',
      use: { ...device, baseURL: `http://localhost:${PROD_PORT}`, serviceWorkers: 'allow' },
    },
  ],
  webServer: [
    {
      command: `npm run build:e2e && npm run preview:e2e -- --port ${PORT} --strictPort`,
      url: `http://localhost:${PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: `npm run build:prod-base && npm run preview:prod-base -- --port ${PROD_PORT} --strictPort`,
      url: `http://localhost:${PROD_PORT}/darbo-knyga/`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
