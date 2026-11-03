import { zValidator } from '@hono/zod-validator'
import type { Hono } from 'hono'
import { z } from 'zod'
import type { JobDetail } from '@toolpath/api'
import { toPublicInspectionReport, type AnalysisEvent } from '@toolpath/part-contracts'
import { getWholePartReport } from '../engine.js'
import { jobEvents } from '../job-events.js'
import type { PartApiContext } from '../context.js'
import type { AppEnv } from '../types.js'

const paramsSchema = z.object({ partId: z.string().min(1) })
const querySchema = z.object({ jobId: z.string().min(1) })

/**
 * A part made of a file's body is checked against that body when it is
 * analysed; this is the Engine saying the file reads differently now. The part
 * cannot be fixed from here — the file has to be uploaded and its body chosen
 * again — and the Engine's own text says nothing a person can act on.
 */
const BODY_MISMATCH =
  'Toolpath reads this file’s bodies differently now. Upload the file again to choose its body.'

const failedAnalysis = (error: string | null | undefined): string => {
  if (error?.startsWith('body_mismatch:')) {
    return BODY_MISMATCH
  }
  return error ?? 'The Toolpath Engine could not analyze this part.'
}

const readAnalysis = async (
  apiKey: string,
  partId: string,
  job: JobDetail,
): Promise<AnalysisEvent> => {
  if (job.status === 'failed') {
    return { status: 'failed', message: failedAnalysis(job.error) }
  }
  if (job.status !== 'succeeded') {
    return {
      status: 'pending',
      progress: job.progress,
      message: job.status === 'running' ? 'Analyzing geometry…' : 'Analysis is queued…',
    }
  }
  const report = await getWholePartReport(apiKey, partId, job.jobUuid)
  if (!report) {
    return {
      status: 'failed',
      message: 'Analysis completed, but the report was not available. Try opening the part again.',
    }
  }
  return { status: 'ready', report: toPublicInspectionReport(report) }
}

export const registerAnalysisRoutes = (
  app: Hono<AppEnv>,
  { appName, connection }: PartApiContext,
) => {
  app.get(
    '/api/parts/:partId/events',
    zValidator('param', paramsSchema),
    zValidator('query', querySchema),
    async (c) => {
      const apiKey = await connection.requireApiKey(c)
      const { partId } = c.req.valid('param')
      const { jobId } = c.req.valid('query')

      return jobEvents(c, {
        apiKey,
        appName,
        jobId,
        event: 'analysis',
        belongs: (job) => job.partUuid === partId,
        read: (job) => readAnalysis(apiKey, partId, job),
        foreign: 'This analysis is not for this part. Try opening the part again.',
        lost: 'Could not monitor this analysis. Try opening the part again.',
      })
    },
  )
}

export { readAnalysis }
