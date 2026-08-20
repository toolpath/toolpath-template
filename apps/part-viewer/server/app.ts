import { Hono } from 'hono'
import { csrf } from 'hono/csrf'
import { HTTPException } from 'hono/http-exception'
import { secureHeaders } from 'hono/secure-headers'
import { EngineError, publicEngineErrorMessage } from './engine'
import { registerAnalysisRoutes } from './routes/analysis'
import { registerMeshRoutes } from './routes/mesh'
import { registerPartRoutes } from './routes/parts'
import { registerSessionRoutes } from './routes/session'
import type { AppEnv } from './types'

/** Construct without starting a listener so API behavior can be tested with `app.request()`. */
export const createApp = (): Hono<AppEnv> => {
  const app = new Hono<AppEnv>()
  app.use('*', secureHeaders())
  // Keep the probe independent of Engine availability and browser session state.
  app.get('/health', (c) => c.text('ok'))
  app.use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'no-store')
    c.header('Pragma', 'no-cache')
    await next()
  })
  app.use('/api/*', csrf({ secFetchSite: 'same-origin' }))

  registerSessionRoutes(app)
  registerPartRoutes(app)
  registerAnalysisRoutes(app)
  registerMeshRoutes(app)

  app.onError((error, c) => {
    if (error instanceof EngineError) {
      console.error('[part-viewer] Engine request failed', {
        method: c.req.method,
        path: c.req.path,
        operation: error.operation,
        status: error.status,
        code: error.code,
      })
      return c.json(
        { error: error.code, message: publicEngineErrorMessage(error.status) },
        error.status as never,
      )
    }
    if (error instanceof HTTPException) {
      return c.json({ error: 'request_failed', message: error.message }, error.status)
    }
    console.error('[part-viewer] Unexpected request failure', {
      method: c.req.method,
      path: c.req.path,
      error: error instanceof Error ? error.message : String(error),
    })
    return c.json({ error: 'internal_error', message: 'Unexpected server error.' }, 500)
  })
  return app
}
