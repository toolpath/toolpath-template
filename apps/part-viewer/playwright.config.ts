import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  use: { baseURL: 'http://127.0.0.1:4173', browserName: 'chromium' },
  /**
   * The built app on CI, the dev server locally.
   *
   * The dev server compiles a route the first time it is navigated to, and on a
   * cold machine that outlasts the assertion waiting for the URL to change —
   * the first test paid for it and the three after it did not, which is the
   * shape of a warm-up cost rather than a slow app. Raising the timeout would
   * have hidden that behind a longer wait; serving what `pnpm build` already
   * produced removes it, and tests what actually ships.
   *
   * Locally the dev server stays, because it is already running and rebuilding
   * before every run would cost more than it saves.
   */
  webServer: {
    command: process.env.CI
      ? 'pnpm exec tsx server/prod.ts'
      : 'pnpm exec react-router dev --host 127.0.0.1 --port 4173',
    env: {
      APP_SESSION_SECRET: 'part-viewer-playwright-secret',
      PORT: '4173',
    },
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
})
