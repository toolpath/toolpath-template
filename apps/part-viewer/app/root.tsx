import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router'
import appCss from './styles.css?url'

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
  <html lang="en" className="dark">
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="color-scheme" content="dark" />
      <Meta />
      <Links />
    </head>
    <body className="font-body text-gray dark:text-zinc-300">
      {children}
      <ScrollRestoration />
      <Scripts />
    </body>
  </html>
)

export default function App() {
  return <Outlet />
}
