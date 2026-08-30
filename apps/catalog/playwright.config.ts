import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  /*
   * A committed `test.only` would shrink this suite to one test and leave CI
   * green, which is the one failure mode a test suite cannot report on itself.
   * Locally it stays allowed, because narrowing to one test is how you debug.
   */
  forbidOnly: !!process.env.CI,
  /*
   * Retries make a rare flake *visible* rather than hidden: Playwright reports
   * a test that failed and then passed as flaky, which is a different signal
   * from green. None locally, where a flake is worth chasing while it is in
   * front of you.
   */
  retries: process.env.CI ? 2 : 0,
  use: { baseURL: 'http://127.0.0.1:4174', browserName: 'chromium' },
  webServer: {
    // The production server: static files plus the part API, with the same
    // index.html fallback a static host has to be configured with.
    command: 'pnpm build && pnpm exec tsx server/prod.ts',
    env: {
      // Always the committed sample: an end-to-end suite whose assertions
      // depend on whether somebody has run a scrape passes on one machine and
      // fails on the next.
      CATALOG_DATASET: '../../packages/catalog-data/fixtures/sample-catalog.json',
      APP_SESSION_SECRET: 'tool-catalog-playwright-secret',
      TOOLPATH_API_BASE_URL: 'https://engine.test',
      PORT: '4174',
    },
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: false,
  },
})
