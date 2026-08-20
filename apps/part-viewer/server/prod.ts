import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import app from './index'

const clientRoot = './build/client'
app.use('*', serveStatic({ root: clientRoot }))
app.get('*', (c, next) =>
  c.req.path === '/api' || c.req.path.startsWith('/api/')
    ? next()
    : serveStatic({ root: clientRoot, path: 'index.html' })(c, next),
)
app.notFound((c) => c.json({ error: 'not_found', message: 'API route not found.' }, 404))

const port = Number(process.env.PORT ?? 3000)

serve({ fetch: app.fetch, port })
