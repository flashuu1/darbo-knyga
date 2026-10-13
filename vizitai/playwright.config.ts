import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  use: { ...devices['iPhone 17 Pro Max'], baseURL: 'http://localhost:4173', serviceWorkers: 'block', locale: 'lt-LT', timezoneId: 'Europe/Vilnius' },
  webServer: {
    command: 'npm run build:e2e && npm run preview:e2e',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
