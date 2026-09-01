import { useEffect, type ReactNode } from 'react'
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useRouteError,
} from 'react-router'
import { LinkProvider } from '@toolpath/ui'
import { RouterLink } from './components/router-link'
import appCss from './styles.css?url'

export const links = () => [
  { rel: 'stylesheet', href: appCss },
  // The same type scale as the rest of the portal: Open Sans for UI copy,
  // Nunito for headings, and Roboto Mono for identifiers and measured values.
  { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
  { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Nunito:wght@300;400;600;700&family=Open+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Roboto+Mono:wght@400&display=swap',
  },
]

/**
 * The last line of defence against a black page.
 *
 * The shell the server sends is empty but for the hydrate fallback; every
 * pixel after that depends on the browser loading modules that the dev server
 * — or a stale cache, or a bad network — may fail to serve. The React error
 * boundary below only runs once React is running. This runs regardless: plain
 * script, no imports, in the document itself. If nothing has hydrated after
 * ten seconds it says so where the fallback text was, and says what to do.
 * `App` marks the body once it is mounted, which is what it looks for.
 */
export const BOOT_WATCHDOG = `
setTimeout(function () {
  if (document.body.getAttribute('data-hydrated') === 'true') return
  var slot = document.getElementById('boot-status')
  if (!slot) return
  slot.textContent = 'The catalog did not load. Reload the page; if it comes back to this, restart the dev server with a clean cache: rm -rf apps/catalog/node_modules/.vite && pnpm dev:catalog'
  slot.setAttribute('role', 'alert')
}, 10000)
`.trim()

/**
 * The stored theme, on the document **before the first paint**.
 *
 * The build ships a dark page, so a shop that chose light would otherwise see
 * a dark flash on every load. Inline and blocking on purpose: it is three
 * lines and it runs before anything is drawn (Paul, 2026-08-31).
 */
const THEME = `
try {
  var theme = localStorage.getItem('tool-catalog.theme') === 'light' ? 'light' : 'dark'
  document.documentElement.classList.toggle('dark', theme === 'dark')
  document.documentElement.style.colorScheme = theme
} catch (error) {}
`.trim()

export const Layout = ({ children }: { children: ReactNode }) => (
  <html lang="en" className="dark">
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="color-scheme" content="dark light" />
      <Meta />
      <Links />
      <script dangerouslySetInnerHTML={{ __html: THEME }} />
    </head>
    <body className="font-body text-zinc-300">
      {children}
      <ScrollRestoration />
      <Scripts />
      <script dangerouslySetInnerHTML={{ __html: BOOT_WATCHDOG }} />
    </body>
  </html>
)

// Every `@toolpath/ui` link routes through React Router rather than reloading
// the document, which a static SPA cannot afford to do on an internal link.
const App = () => {
  // The watchdog in `Layout` looks for this: once it is set, the page is alive.
  useEffect(() => {
    document.body.setAttribute('data-hydrated', 'true')
  }, [])

  return (
    <LinkProvider component={RouterLink}>
      <Outlet />
    </LinkProvider>
  )
}

export default App

/**
 * What a failure looks like, so that it never looks like nothing.
 *
 * This is a single-page application: the server sends an empty dark page and
 * the browser draws everything. Without this, any error on the way — a module
 * that failed to load, a render that threw — left exactly that empty dark
 * page, which is what happened on 2026-08-29 when Vite served outdated
 * optimised dependencies after a rebuild. A black screen carries no
 * information; this carries the error and the one thing worth trying.
 */
export const ErrorBoundary = () => {
  const error = useRouteError()
  const title = isRouteErrorResponse(error)
    ? `${String(error.status)} ${error.statusText}`
    : 'Something went wrong'
  const detail = isRouteErrorResponse(error)
    ? typeof error.data === 'string'
      ? error.data
      : ''
    : error instanceof Error
      ? error.message
      : String(error)

  return (
    <main role="alert" className="mx-auto max-w-2xl p-8 font-body text-zinc-300">
      <h1 className="mb-2 font-heading text-2xl text-zinc-100">{title}</h1>
      <p className="mb-4 text-sm text-zinc-400">
        Reload the page. If it comes back to this, restart the dev server (
        <code>pnpm dev:catalog</code>) — a rebuild can leave it serving stale modules.
      </p>
      {detail ? (
        <pre className="overflow-x-auto rounded border border-zinc-700 bg-zinc-900 p-3 text-xs text-zinc-300">
          {detail}
        </pre>
      ) : null}
    </main>
  )
}

/** Shown while the modules load, so an empty page is a loading page rather than a broken one. */
export const HydrateFallback = () => (
  <p id="boot-status" className="p-8 font-body text-sm text-zinc-500" aria-busy="true">
    Loading the catalog…
  </p>
)
