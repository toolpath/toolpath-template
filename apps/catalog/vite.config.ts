import { reactRouter } from '@react-router/dev/vite'
import tailwindcss from '@tailwindcss/vite'
import serverAdapter from 'hono-react-router-adapter/vite'
import { defineConfig, loadEnv } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import { DEV_SERVER_EXCLUDE } from './dev-server-exclude'

import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { existsSync } from 'node:fs'
import { CATALOG_VERSION } from '@toolpath/catalog-data'
import { datasetSource, profilesSource, type DatasetChoice } from './dataset-source'

/**
 * Which dataset gets bundled.
 *
 * `scrape-out/catalog.json` when it exists, the committed sample otherwise.
 * Scraped vendor data is the vendor's and is gitignored, so a checkout builds
 * against the sample and a machine that has run a scrape builds against the
 * real thing — without either one committing the difference. `CATALOG_DATASET`
 * overrides both, for a dataset kept somewhere else.
 *
 * A file built against another contract is refused and the reason printed
 * here, where whoever started the build can read it: `dataset-source.ts` says
 * why.
 */
const datasetChoice = (root: string): DatasetChoice => {
  const override = process.env.CATALOG_DATASET
  return announce(
    datasetSource(
      {
        ...(override ? { override: resolve(override) } : {}),
        scraped: resolve(root, '../../scrape-out/catalog.json'),
        sample: createRequire(import.meta.url).resolve(
          '@toolpath/catalog-data/sample-catalog.json',
        ),
      },
      CATALOG_VERSION,
    ),
  )
}

/** Say what a build chose to stand in, where the build chose to stand something in. */
const announce = (chosen: DatasetChoice): DatasetChoice => {
  if (chosen.note) {
    console.warn(`[catalog] ${chosen.note}`)
  }
  return chosen
}

/**
 * Which measured holder profiles get bundled.
 *
 * A scrape that has run `toolpath-scrape profiles` on this machine leaves
 * `scrape-out/profiles.json` beside its catalog, and a checkout has the
 * committed synthetic sample. They are two aliases rather than one because the
 * profiles are a second document on purpose — ~110 vertices per holder that
 * only an assembly drawing needs, and every page loads the catalog.
 *
 * **Which one is not decided here.** The profiles follow the dataset that won,
 * because a profile is keyed by holder guid and one document's measurements
 * match nothing in another document's holders: `dataset-source.ts` has the
 * rule and what it cost to learn it.
 *
 * A dataset and a profiles document from the same side that disagree are still
 * not an error: `profileFor` answers null for a holder nobody measured, which
 * is what a partially-measured catalog genuinely is.
 */
const profilesPath = (root: string, dataset: DatasetChoice): string => {
  const override = process.env.CATALOG_PROFILES
  return announce(
    profilesSource(
      {
        ...(override ? { override: resolve(override) } : {}),
        scraped: resolve(root, '../../scrape-out/profiles.json'),
        sample: createRequire(import.meta.url).resolve(
          '@toolpath/catalog-data/sample-profiles.json',
        ),
      },
      dataset,
    ),
  ).path
}

export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))
  // Chosen once: the profiles document follows whichever catalog won, so a
  // dataset stood in for cannot be paired with another one's measurements.
  const dataset = datasetChoice(import.meta.dirname)

  return {
    // Server configuration reads the environment explicitly above. Prevent Vite
    // from performing a second, client-oriented .env load.
    envDir: false,
    resolve: {
      // `@toolpath/tool-drawing` is linked from a sibling checkout that has a
      // React of its own, and React is a peer dependency there. Without this
      // the drawing renders against a second React and every hook throws.
      dedupe: ['react', 'react-dom'],
      alias: {
        'catalog-dataset': dataset.path,
        'catalog-profiles': profilesPath(import.meta.dirname, dataset),
      },
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
