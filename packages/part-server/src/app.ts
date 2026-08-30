import { Hono } from 'hono'
import { csrf } from 'hono/csrf'
import { HTTPException } from 'hono/http-exception'
import { secureHeaders } from 'hono/secure-headers'
import { createConnection } from './connection.js'
import { EngineError, publicEngineErrorMessage } from './engine.js'
import { registerAnalysisRoutes } from './routes/analysis.js'
import { registerMeshRoutes } from './routes/mesh.js'
import { registerPartRoutes } from './routes/parts.js'
import { registerSessionRoutes } from './routes/session.js'
import type { PartApiContext } from './context.js'
import type { AppEnv } from './types.js'

export interface PartApiOptions {
  /**
   * Names the connection cookie, the key it is sealed with, and this
   * application in server logs. Changing it invalidates existing sessions.
   */
  readonly appName: string
}

/**
 * The Toolpath part API every application in this workspace serves.
 *
 * Upload a part, start an analysis, follow its events, read the mesh — none of
 * which differs between applications, because none of it is a product decision.
 * What differs is what an application does with a finished report, and that
 * stays in the application.
 *
 * Constructed without starting a listener so API behaviour can be tested with
 * `app.request()`.
 */
export const createPartApi = ({ appName }: PartApiOptions): Hono<AppEnv> => {
  const context: PartApiContext = { appName, connection: createConnection(appName) }
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

  registerSessionRoutes(app, context)
  registerPartRoutes(app, context)
  registerAnalysisRoutes(app, context)
  registerMeshRoutes(app, context)

  app.onError((error, c) => {
    if (error instanceof EngineError) {
      console.error(`[${appName}] Engine request failed`, {
        method: c.req.method,
        path: c.req.path,
        operation: error.operation,
        status: error.status,
        code: error.code,
      })
      return c.json(
        { error: error.code, message: publicEngineErrorMessage(error.status, error.detail) },
        error.status as never,
      )
    }
    if (error instanceof HTTPException) {
      return c.json({ error: 'request_failed', message: error.message }, error.status)
    }
    console.error(`[${appName}] Unexpected request failure`, {
      method: c.req.method,
      path: c.req.path,
      error: error instanceof Error ? error.message : String(error),
    })
    return c.json({ error: 'internal_error', message: 'Unexpected server error.' }, 500)
  })

  return app
}
