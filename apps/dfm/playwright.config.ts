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
   * from green. Without them the same test is simply red, and the branch learns
   * to ignore a red suite — which is the more expensive failure.
   *
   * None locally, where a flake is worth chasing while it is in front of you.
   */
  retries: process.env.CI ? 2 : 0,
  use: { baseURL: 'http://127.0.0.1:4173', browserName: 'chromium' },
  webServer: {
    command: 'pnpm build && pnpm exec tsx server/prod.ts',
    env: {
      APP_SESSION_SECRET: 'part-viewer-playwright-secret',
      PORT: '4173',
    },
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
})
