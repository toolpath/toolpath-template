import type { Config } from '@react-router/dev/config'

/**
 * The catalog is a static site: the dataset is bundled at build time and every
 * filter runs in the browser, so there is no server to render on.
 *
 * **This is a deploy requirement, not only a build setting.** Clean paths mean
 * the host must rewrite unknown paths to `index.html`, or a refresh on
 * an active part route 404s. See `docs/TOOL-CATALOG-PLAN.md`.
 */
export default {
  ssr: false,
} satisfies Config
