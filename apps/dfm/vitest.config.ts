import { createRequire } from 'node:module'
import { dirname } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const require = createRequire(import.meta.url)

export default defineConfig({
  plugins: [react()],
  resolve: {
    // The workspace has two Reacts on disk — the app pins 19.2.0 and a
    // transitive dependency of the UI package pulls 19.2.8 — and a component
    // test that renders across both fails inside React itself, which reads as a
    // broken component rather than as a resolution problem. Pinning by path
    // rather than by `dedupe` catches the transitive copy too.
    alias: {
      // The package directories rather than their entry files, so subpaths
      // like `react/jsx-dev-runtime` still resolve.
      react: dirname(require.resolve('react/package.json')),
      'react-dom': dirname(require.resolve('react-dom/package.json')),
    },
  },
  test: {
    // Published UI/viewer packages must be transformed by Vite so their React
    // and camera-control dependencies use the app's module resolution.
    server: {
      deps: {
        inline: ['@toolpath/ui', '@toolpath/viewer', 'camera-controls', 'react-resizable-panels'],
      },
    },
    include: ['app/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
    setupFiles: ['./test.setup.ts'],
  },
})
