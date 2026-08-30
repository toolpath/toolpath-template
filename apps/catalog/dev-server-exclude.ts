/**
 * What the Hono dev-server adapter must leave to Vite.
 *
 * The adapter hands every request it does not exclude to the Hono app — and
 * so to React Router's document handler, which answers an unknown path with a
 * 404 page. Its own list covers `.ts`, `.css`, `/@vite/…` and a Vite query
 * that *ends* in `?raw` or `?t=123`. It does not cover a hot update of a
 * `?raw` import, which is fetched as `rules.csv?raw&t=123`, nor the bare
 * `.csv`. On 2026-08-30 every edit to the rules sheets under an open tab
 * fetched HTML where the HMR client expected a module, and the tab went
 * black. So: anything Vite would serve — any path with a Vite query, any
 * imported asset — is Vite's, and only a document is the app's.
 */
export const DEV_SERVER_EXCLUDE: Array<string | RegExp> = [
  // The adapter's own defaults, spelled out so a change upstream is a diff here.
  /.*\.css$/,
  /.*\.ts$/,
  /.*\.tsx$/,
  /^\/@.+$/,
  /\?t=\d+$/,
  /^\/favicon\.ico$/,
  /^\/static\/.+/,
  /^\/node_modules\/.*/,
  '/assets/**',
  /\?(?:inline|url|no-inline|raw|import(?:&(?:inline|url|no-inline|raw)?)?)$/,
  // Ours: a Vite query anywhere in the string, and the assets the app imports.
  /[?&](?:raw|import|url|inline|no-inline)(?:[&=]|$)/,
  /[?&]t=\d+/,
  /^\/app\/.*\.(?:csv|json|svg|png|glb|woff2?)(?:\?.*)?$/,
]

/** True when the dev server must leave this URL to Vite. */
export const leftToVite = (url: string): boolean =>
  DEV_SERVER_EXCLUDE.some((pattern) =>
    typeof pattern === 'string'
      ? new RegExp(`^${pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*')}$`).test(url)
      : pattern.test(url),
  )
