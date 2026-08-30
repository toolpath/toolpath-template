import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // `@toolpath/viewer` installs camera controls at import time against a DOM.
    // It must be transformed by Vite and run in jsdom even though nothing this
    // package exports renders anything.
    server: { deps: { inline: ['@toolpath/viewer', 'camera-controls'] } },
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
  },
})
