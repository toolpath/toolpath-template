import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { compress } from 'hono/compress'
import app from './index'

const clientRoot = './build/client'
/**
 * The bundle is mostly the tool catalog, and it went out uncompressed.
 *
 * The dataset is bundled at build time, so the chunk holding it is ~25 MB of
 * JSON — and the matcher worker imports the same module, which is a second
 * copy. Measured on the committed scrape: 25.5 MB down to 2.1 MB gzipped, and
 * the whole of it was crossing the wire on every first visit.
 *
 * Registered here rather than in `server/index.ts` because Hono runs a
 * middleware only for handlers registered after it: the part API is already
 * mounted by then, so this wraps the static files and nothing else. The
 * middleware streams, skips anything already encoded, and filters to
 * compressible content types, so the mesh relay and the GLBs are untouched.
 */
app.use('*', compress())
app.use('*', serveStatic({ root: clientRoot }))
// The catalog uses clean paths, so anything that is not an API route and not a
// file on disk is answered with the shell. This is the same rewrite a static
// host has to be configured with, and `tests/catalog.spec.ts` depends on it.
app.get('*', (c, next) =>
  c.req.path === '/api' || c.req.path.startsWith('/api/')
    ? next()
    : serveStatic({ root: clientRoot, path: 'index.html' })(c, next),
)
app.notFound((c) => c.json({ error: 'not_found', message: 'API route not found.' }, 404))

const port = Number(process.env.PORT ?? 3000)

serve({ fetch: app.fetch, port })
