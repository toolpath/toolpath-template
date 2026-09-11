import { zValidator } from '@hono/zod-validator'
import type { Hono } from 'hono'
import { z } from 'zod'
import { InvalidApiKeyError, requestDemoSession, validateApiKey } from '../engine.js'
import type { PartApiContext } from '../context.js'
import type { AppEnv } from '../types.js'

const connectSchema = z.object({ apiKey: z.string().trim().min(1, 'Enter an API key to connect.') })

export const registerSessionRoutes = (
  app: Hono<AppEnv>,
  { appName, connection }: PartApiContext,
) => {
  app.get('/api/session', async (c) =>
    c.json({ connected: Boolean(await connection.readApiKey(c)) }),
  )

  /**
   * Connects with a shared demo key when the Engine offers one, so an
   * application can be tried without a key of its own. A demo key is only
   * sometimes available; when it is not, this reports `connected: false` and the
   * application falls back to asking for the user's own key. An existing session
   * is left as it is rather than replaced with a demo one.
   */
  app.post('/api/session/demo', async (c) => {
    if (await connection.readApiKey(c)) {
      return c.json({ connected: true })
    }
    const apiKey = await requestDemoSession(appName)
    if (!apiKey) {
      return c.json({ connected: false })
    }
    await connection.setConnection(c, apiKey)
    return c.json({ connected: true }, 201)
  })

  app.post('/api/session', zValidator('json', connectSchema), async (c) => {
    const { apiKey } = c.req.valid('json')
    try {
      await validateApiKey(apiKey)
    } catch (error) {
      if (error instanceof InvalidApiKeyError) {
        const message =
          error.keyStatus === 'expired'
            ? 'This API key has expired. Create a new key and try again.'
            : error.keyStatus === 'revoked'
              ? 'This API key has been revoked. Create a new key and try again.'
              : 'This API key is not valid. Check it and try again.'
        return c.json({ error: 'invalid_api_key', message }, 401)
      }
      throw error
    }
    await connection.setConnection(c, apiKey)
    return c.json({ connected: true }, 201)
  })

  app.delete('/api/session', (c) => {
    connection.clearConnection(c)
    return c.body(null, 204)
  })
}
