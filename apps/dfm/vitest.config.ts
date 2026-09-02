import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    // Published UI/viewer packages must be transformed by Vite so their React
    // and camera-control dependencies use the app's module resolution.
    server: {
      deps: {
        inline: ['@toolpath/ui', '@toolpath/viewer', 'camera-controls', 'react-resizable-panels'],
      },
    },
    include: ['app/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
    setupFiles: ['./test.setup.ts', './test.matchers.ts'],
  },
})
