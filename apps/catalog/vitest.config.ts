import { createRequire } from 'node:module'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  // Tests always run against the committed sample: a suite whose result depends
  // on whether somebody has run a scrape is a suite that fails on one machine.
  resolve: {
    // One React, whichever checkout a package was resolved from.
    dedupe: ['react', 'react-dom'],
    alias: {
      'catalog-dataset': createRequire(import.meta.url).resolve(
        '@toolpath/catalog-data/sample-catalog.json',
      ),
      'catalog-profiles': createRequire(import.meta.url).resolve(
        '@toolpath/catalog-data/sample-profiles.json',
      ),
    },
  },
  test: {
    // The published UI package must be transformed by Vite so its React
    // dependency resolves through this application's module graph.
    server: {
      deps: {
        // `@toolpath/tool-drawing` is here for a second reason as well as the
        // first: it is a `link:` onto a sibling checkout with a React of its
        // own, and React is a peer dependency it does not deduplicate across
        // that boundary. Left external, its `useRef` runs against the sibling's
        // React and every render throws "Cannot read properties of null".
        inline: [
          '@toolpath/ui',
          '@toolpath/viewer',
          '@toolpath/tool-drawing',
          'camera-controls',
          'react-resizable-panels',
        ],
      },
    },
    include: ['app/**/*.test.{ts,tsx}', '*.test.ts'],
    setupFiles: ['./test.setup.ts'],
    environment: 'jsdom',
    // Testing Library unmounts between tests only when the global hooks are
    // available; without this, one render's table is still in the document
    // while the next test asserts there is none.
    globals: true,
  },
})
