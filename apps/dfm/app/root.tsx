import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router'
import appCss from './styles.css?url'
import { THEME_SCRIPT } from './shared/theme'

export const links = () => [
  { rel: 'stylesheet', href: appCss },
  // The portal's type scale: Open Sans for UI copy, Nunito for headings, and
  // Roboto Mono for identifiers and measured values.
  { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
  { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
  {
    rel: 'stylesheet',
    href: 'https://fonts.googleapis.com/css2?family=Nunito:wght@300;400;600;700&family=Open+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Roboto+Mono:wght@400&display=swap',
  },
]

export const Layout = ({ children }: { children: React.ReactNode }) => (
  /*
   * No `className` on `<html>` on purpose.
   *
   * The script below owns the class, because it has to run before the first
   * paint — reading the choice after mount is a flash of the wrong theme on
   * every load. React rendering `class="dark"` as well does not help and does
   * harm: hydration writes the attribute back, so a light session went dark
   * again on every navigation. One writer, and it is the one that runs first.
   *
   * `suppressHydrationWarning` because that is exactly the disagreement React
   * is built to shout about: the markup it rendered has no class and the
   * document it is hydrating has one, put there a moment earlier on purpose.
   * Suppressed on this element only, and only for this reason.
   */
  <html lang="en" suppressHydrationWarning>
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="color-scheme" content="dark light" />
      <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      <Meta />
      <Links />
    </head>
    <body className="font-body text-ink-body">
      {children}
      <ScrollRestoration />
      <Scripts />
    </body>
  </html>
)

export default function App() {
  return <Outlet />
}
