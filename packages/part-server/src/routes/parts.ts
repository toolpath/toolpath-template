import { zValidator } from '@hono/zod-validator'
import type { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { isSupportedCadFilename } from '@toolpath/part-contracts'
import { UpdatePartFeatureDetailsEnum } from '@toolpath/api'
import { createEngineClient, requireData } from '../engine.js'
import type { PartApiContext } from '../context.js'
import type { AppEnv } from '../types.js'

const createPartSchema = z.object({ filename: z.string().trim().min(1) })
const partParamsSchema = z.object({ partId: z.string().min(1) })
const updatePartQuerySchema = z.object({
  featureDetails: z.enum(['true', 'false']).default('true'),
})

export const registerPartRoutes = (app: Hono<AppEnv>, { appName, connection }: PartApiContext) => {
  app.post('/api/parts', zValidator('json', createPartSchema), async (c) => {
    const apiKey = await connection.requireApiKey(c)
    const { filename } = c.req.valid('json')
    if (!isSupportedCadFilename(filename)) {
      throw new HTTPException(400, { message: 'Choose a supported CAD file.' })
    }
    const engine = createEngineClient(apiKey, appName)
    const created = await requireData(engine.parts.createPart({ filename }), 'create part upload')
    // This URL is a short-lived, single-object PUT for uploading the CAD file.
    return c.json({ partId: created.partId, uploadUrl: created.uploadUrl }, 201)
  })

  app.patch(
    '/api/parts/:partId',
    zValidator('param', partParamsSchema),
    zValidator('query', updatePartQuerySchema),
    async (c) => {
      const apiKey = await connection.requireApiKey(c)
      const { partId } = c.req.valid('param')
      const { featureDetails } = c.req.valid('query')
      const analysis = await requireData(
        createEngineClient(apiKey, appName).parts.updatePart({
          id: partId,
          // Reports no longer embed these measurements. Ask Engine to compute them so the ready
          // report path can retrieve them from the part-scoped features endpoint.
          featureDetails:
            featureDetails === 'true'
              ? UpdatePartFeatureDetailsEnum.True
              : UpdatePartFeatureDetailsEnum.False,
          idempotencyKey: crypto.randomUUID(),
        }),
        'start analysis',
      )
      return c.json({ partId, jobId: analysis.jobId }, 202)
    },
  )
}
