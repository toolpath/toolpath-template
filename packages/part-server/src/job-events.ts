import { createParser } from 'eventsource-parser'
import type { Context } from 'hono'
import { streamSSE, type SSEStreamingApi } from 'hono/streaming'
import { instanceOfJobDetail, JobDetailFromJSON, type JobDetail } from '@toolpath/api'
import { EngineError, createEngineClient, publicEngineErrorMessage, requireData } from './engine.js'
import type { AppEnv } from './types.js'

/** What every job event the browser reads has in common: anything but `pending` ends it. */
interface JobEvent {
  readonly status: 'pending' | 'failed' | 'ready'
}

type Failed = { status: 'failed'; message: string }

export interface JobEventsOptions<Event extends JobEvent> {
  readonly apiKey: string
  readonly appName: string
  readonly jobId: string
  /** The SSE event name the browser listens for. */
  readonly event: string
  /**
   * Whether the job is the subject's own. A job for another part or file is
   * refused rather than read, so a job id cannot open somebody else's subject.
   */
  readonly belongs: (job: JobDetail) => boolean
  /** What one Engine job update is, to the browser — which is all that differs between jobs. */
  readonly read: (job: JobDetail) => Promise<Event>
  /** Said when the job is not the subject's own. */
  readonly foreign: string
  /** Said when the stream itself could not be followed. */
  readonly lost: string
}

/** Forwards Engine job SSE events as one app-owned, redacted stream, until the job settles. */
const forward = async <Event extends JobEvent>(
  { apiKey, appName, jobId, event, belongs, read, foreign }: JobEventsOptions<Event>,
  stream: SSEStreamingApi,
): Promise<void> => {
  const response = await requireData(
    createEngineClient(apiKey, appName).jobs.streamJobEventsRaw({ id: jobId }),
    'open job events',
  )
  if (!response.raw.body) {
    throw new Error('The Toolpath Engine returned an empty event stream.')
  }

  const jobs: Array<JobDetail> = []
  const parser = createParser({
    onEvent: (each) => {
      if (each.event !== 'job') {
        return
      }
      const payload: unknown = JSON.parse(each.data)
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
        const next: Event | Failed = belongs(job)
          ? await read(job)
          : { status: 'failed', message: foreign }
        if (stream.aborted) {
          return
        }
        await stream.writeSSE({ event, data: JSON.stringify(next) })
        if (next.status !== 'pending') {
          return
        }
      }
    }
  } finally {
    await textStream.cancel()
  }

  throw new Error('The Toolpath Engine closed the event stream before the job settled.')
}

/**
 * The SSE response for one job: its updates as `options.read` words them, and
 * a final `failed` event — never a dropped connection — when the Engine or the
 * stream gives out. An Engine error is worded by the same public rule as every
 * other route; anything else says only `options.lost`.
 */
export const jobEvents = <Event extends JobEvent>(
  c: Context<AppEnv>,
  options: JobEventsOptions<Event>,
) =>
  streamSSE(c, async (stream) => {
    try {
      await forward(options, stream)
    } catch (error) {
      if (stream.aborted) {
        return
      }
      const message =
        error instanceof EngineError ? publicEngineErrorMessage(error.status) : options.lost
      await stream.writeSSE({
        event: options.event,
        data: JSON.stringify({ status: 'failed', message } satisfies Failed),
      })
    }
  })
