import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
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
