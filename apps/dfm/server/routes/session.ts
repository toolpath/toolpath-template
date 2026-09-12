import { zValidator } from '@hono/zod-validator'
import type { Hono } from 'hono'
import { z } from 'zod'
import { clearConnection, readConnection, setConnection } from '../connection'
import { InvalidApiKeyError, requestDemoSession, validateApiKey } from '../engine'
import type { AppEnv } from '../types'

const connectSchema = z.object({ apiKey: z.string().trim().min(1, 'Enter an API key to connect.') })

export const registerSessionRoutes = (app: Hono<AppEnv>) => {
  app.get('/api/session', async (c) => {
    const connection = await readConnection(c)
    return c.json(
      connection ? { connected: true, isDemo: connection.isDemo } : { connected: false },
    )
  })

  /**
   * Connects with a shared demo key when the Engine offers one, so an
   * application can be tried without a key of its own. A demo key is only
   * sometimes available; when it is not, this reports `connected: false` and the
   * application falls back to asking for the user's own key. An existing session
   * is left as it is rather than replaced with a demo one.
   */
  app.post('/api/session/demo', async (c) => {
    const existing = await readConnection(c)
    if (existing) {
      return c.json({ connected: true, isDemo: existing.isDemo })
    }
    const apiKey = await requestDemoSession()
    if (!apiKey) {
      return c.json({ connected: false })
    }
    await setConnection(c, apiKey, true)
    return c.json({ connected: true, isDemo: true }, 201)
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
    await setConnection(c, apiKey)
    return c.json({ connected: true, isDemo: false }, 201)
  })

  app.delete('/api/session', (c) => {
    clearConnection(c)
    return c.body(null, 204)
  })
}
