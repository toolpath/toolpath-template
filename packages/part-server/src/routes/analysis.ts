import { zValidator } from '@hono/zod-validator'
import { createParser } from 'eventsource-parser'
import type { Hono } from 'hono'
import { streamSSE, type SSEStreamingApi } from 'hono/streaming'
import { z } from 'zod'
import { instanceOfJobDetail, JobDetailFromJSON, type JobDetail } from '@toolpath/api'
import { toPublicInspectionReport, type AnalysisEvent } from '@toolpath/part-contracts'
import {
  EngineError,
  createEngineClient,
  getWholePartReport,
  publicEngineErrorMessage,
  requireData,
} from '../engine.js'
import type { PartApiContext } from '../context.js'
import type { AppEnv } from '../types.js'

const paramsSchema = z.object({ partId: z.string().min(1) })
const querySchema = z.object({ jobId: z.string().min(1) })

const readAnalysis = async (
  apiKey: string,
  partId: string,
  job: JobDetail,
): Promise<AnalysisEvent> => {
  if (job.status === 'failed') {
    return {
      status: 'failed',
      message: job.error ?? 'The Toolpath Engine could not analyze this part.',
    }
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

/** Forwards Engine job SSE events as the app-owned, redacted analysis stream. */
const streamAnalysis = async (
  apiKey: string,
  appName: string,
  partId: string,
  jobId: string,
  stream: SSEStreamingApi,
): Promise<void> => {
  const response = await requireData(
    createEngineClient(apiKey, appName).jobs.streamJobEventsRaw({ id: jobId }),
    'open analysis events',
  )
  if (!response.raw.body) {
    throw new Error('The Toolpath Engine returned an empty event stream.')
  }

  const jobs: Array<JobDetail> = []
  const parser = createParser({
    onEvent: (event) => {
      if (event.event !== 'job') {
        return
      }
      const payload: unknown = JSON.parse(event.data)
      if (!payload || typeof payload !== 'object' || !instanceOfJobDetail(payload)) {
        throw new Error('The Toolpath Engine returned an invalid job event.')
      }
      jobs.push(JobDetailFromJSON(payload))
    },
    onError: (error) => {
      throw new Error(`The Toolpath Engine returned an invalid SSE event: ${error.message}`, {
        cause: error,
      })
    },
  })

  const textStream = response.raw.body.pipeThrough(new TextDecoderStream())
  try {
    for await (const chunk of textStream) {
      parser.feed(chunk)
      while (jobs.length > 0) {
        const job = jobs.shift()!
        const analysis = await readAnalysis(apiKey, partId, job)
        if (stream.aborted) {
          return
        }
        await stream.writeSSE({ event: 'analysis', data: JSON.stringify(analysis) })
        if (analysis.status !== 'pending') {
          return
        }
      }
    }
  } finally {
    await textStream.cancel()
  }

  throw new Error('The Toolpath Engine closed the event stream before analysis completed.')
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

      return streamSSE(c, async (stream) => {
        try {
          await streamAnalysis(apiKey, appName, partId, jobId, stream)
        } catch (error) {
          if (stream.aborted) {
            return
          }
          const message =
            error instanceof EngineError
              ? publicEngineErrorMessage(error.status)
              : 'Could not monitor this analysis. Try opening the part again.'
          await stream.writeSSE({
            event: 'analysis',
            data: JSON.stringify({ status: 'failed', message } satisfies AnalysisEvent),
          })
        }
      })
    },
  )
}

export { readAnalysis }
