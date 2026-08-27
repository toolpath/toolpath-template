import { zValidator } from '@hono/zod-validator'
import type { Hono } from 'hono'
import { z } from 'zod'
import { EngineError, getPartReport } from '../engine'
import { requireApiKey } from '../connection'
import type { AppEnv } from '../types'

const paramsSchema = z.object({ partId: z.string().min(1) })
const querySchema = z.object({ jobId: z.string().min(1), format: z.enum(['glb', 'stl']) })

export const registerMeshRoutes = (app: Hono<AppEnv>) => {
  app.get(
    '/api/parts/:partId/mesh',
    zValidator('param', paramsSchema),
    zValidator('query', querySchema),
    async (c) => {
      const apiKey = await requireApiKey(c)
      const { partId } = c.req.valid('param')
      const { jobId, format } = c.req.valid('query')
      const load = async () => {
        const report = await getPartReport(apiKey, partId, jobId)
        const url = format === 'glb' ? report?.meshGlbUrl : report?.meshStlUrl
        if (!url) {
          throw new EngineError(404, 'mesh_unavailable', 'load mesh')
        }
        return fetch(url)
      }

      // The artifact URL on a report is presigned and short-lived, so a part left open past its
      // expiry fails here. Re-reading the report is what mints a fresh URL, which is why the retry
      // goes through `load` again rather than re-fetching the same URL.
      let artifact = await load()
      if (!artifact.ok) {
        // Release the socket now instead of when the discarded response is collected.
        await artifact.body?.cancel()
        artifact = await load()
      }
      if (!artifact.ok) {
        throw new EngineError(artifact.status, 'mesh_unavailable', 'load mesh')
      }
      return new Response(artifact.body, {
        headers: {
          'Cache-Control': 'no-store',
          'Content-Type': artifact.headers.get('content-type') ?? `model/${format}`,
        },
      })
    },
  )
}
