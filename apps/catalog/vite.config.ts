import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import serverAdapter from 'hono-react-router-adapter/vite'
import { defineConfig, loadEnv } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import { DEV_SERVER_EXCLUDE } from './dev-server-exclude'

import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

/**
 * Which dataset gets bundled.
 *
 * `scrape-out/catalog.json` when it exists, the committed sample otherwise.
 * Scraped vendor data is the vendor's and is gitignored, so a checkout builds
 * against the sample and a machine that has run a scrape builds against the
 * real thing — without either one committing the difference. `CATALOG_DATASET`
 * overrides both, for a dataset kept somewhere else.
 */
const datasetPath = (root: string): string => {
  const override = process.env.CATALOG_DATASET
  if (override) {
    return resolve(override)
  }
  const scraped = resolve(root, '../../scrape-out/catalog.json')
  return existsSync(scraped)
    ? scraped
    : createRequire(import.meta.url).resolve('@toolpath/catalog-data/sample-catalog.json')
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))

  return {
    // Server configuration reads the environment explicitly above. Prevent Vite
    // from performing a second, client-oriented .env load.
    envDir: false,
    resolve: {
      // `@toolpath/tool-drawing` is linked from a sibling checkout that has a
      // React of its own, and React is a peer dependency there. Without this
      // the drawing renders against a second React and every hook throws.
      dedupe: ['react', 'react-dom'],
      alias: { 'catalog-dataset': datasetPath(import.meta.dirname) },
    },
    // 5173 is the DFM application's. Both are `react-router dev` and would
    // otherwise default to the same port, so whichever booted first would win.
    server: { port: 5174, strictPort: true },
    // Pre-bundle everything the first page needs before the first request.
    // Left to discovery, Vite optimises these on the first load, answers the
    // requests already in flight with 504 "Outdated Optimize Dep", and — this
    // being a single-page application with nothing rendered on the server —
    // the tab is left black. That is what a `pnpm check` under a running dev
    // server did on 2026-08-29. Listing them means the cache is built at
    // start-up and a rebuild of a workspace package invalidates it cleanly.
    optimizeDeps: {
      include: [
        'react',
        'react/jsx-runtime',
        'react/jsx-dev-runtime',
        'react-dom',
        'react-dom/client',
        'react-router',
        'react-router/dom',
        '@phosphor-icons/react',
        '@toolpath/ui',
        '@toolpath/viewer',
        '@toolpath/viewer/engine',
      ],
    },
    plugins: [
      tsconfigPaths(),
      tailwindcss(),
      reactRouter(),
      // Development only: mount the part API alongside Vite's SPA dev server on
      // one origin. The tool data still comes from the bundle, not from here.
      serverAdapter({ entry: 'server/index.ts', exclude: DEV_SERVER_EXCLUDE }),
    ],
    // Even with `ssr: false`, React Router builds a server bundle to render the
    // shell's index.html. `@toolpath/ui` must be bundled into it rather than
    // externalised: one of its dependencies uses a directory import that Node's
    // ESM resolver refuses, and only Vite's resolver gets it right.
    ssr: { noExternal: ['@toolpath/ui', '@toolpath/viewer', '@toolpath/tool-drawing'] },
  }
})
