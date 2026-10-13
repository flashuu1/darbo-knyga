import { defineConfig, devices } from '@playwright/test';
const device = { ...devices['iPhone 17 Pro Max'], locale: 'lt-LT', timezoneId: 'Europe/Vilnius' };
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  projects: [
    {
      name: 'app',
      testIgnore: 'prod-base.spec.ts',
      use: { ...device, baseURL: 'http://localhost:4173', serviceWorkers: 'block' },
    },
    {
      // Production build served under its real sub-path, service workers allowed (real offline check).
      name: 'prod-base',
      testMatch: 'prod-base.spec.ts',
      use: { ...device, baseURL: 'http://localhost:4180', serviceWorkers: 'allow' },
    },
  ],
  webServer: [
    {
      command: 'npm run build:e2e && npm run preview:e2e',
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm run build:prod-base && npm run preview:prod-base',
      url: 'http://localhost:4180/darbo-knyga/',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
