import { zValidator } from '@hono/zod-validator'
import type { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import type { JobDetail } from '@toolpath/api'
import {
  MAX_BODY_INDEX,
  isPartBodies,
  isSupportedCadFilename,
  type InspectionEvent,
} from '@toolpath/part-contracts'
import { createEngineClient, requireData, startAnalysis } from '../engine.js'
import { jobEvents } from '../job-events.js'
import type { PartApiContext } from '../context.js'
import type { AppEnv } from '../types.js'

const createFileSchema = z.object({ filename: z.string().trim().min(1) })
const fileParamsSchema = z.object({ fileId: z.string().min(1) })
const eventsQuerySchema = z.object({ jobId: z.string().min(1) })
const makePartSchema = z.object({ bodyIndex: z.number().int().min(0).max(MAX_BODY_INDEX) })

/*
 * What this server reads of each Files response, and nothing more.
 *
 * The Files operations are experimental and change between Engine releases:
 * the SDK's own deserialisers read every field of a response, so an Engine a
 * release behind the SDK — one with no `shapes` on a file, say — failed a whole
 * upload over a field nothing here uses. Each response is read raw instead, and
 * only the fields used are checked.
 */
const createdFileSchema = z.object({ fileId: z.string().min(1), uploadUrl: z.string().url() })
const inspectionSchema = z.object({ jobId: z.string().min(1) })
const madePartsSchema = z.object({
  parts: z.array(z.object({ partId: z.string().min(1), bodyIndex: z.number().int() })),
})
const fileSchema = z.object({ bodies: z.array(z.unknown()) })

/** A Files response, read raw and checked against `schema`; anything else is a 500 in the log. */
const readRaw = async <T>(
  call: Promise<{ raw: Response }>,
  operation: string,
  schema: z.ZodType<T>,
): Promise<T> => {
  const response = await requireData(call, operation)
  const parsed = schema.safeParse(await response.raw.json().catch(() => null))
  if (!parsed.success) {
    throw new Error(`The Toolpath Engine returned an unreadable ${operation} response.`)
  }
  return parsed.data
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * The fields of a body the browser is told, a missing name as `null`.
 * Whether they are well formed is `isPartBodies`'s to say, afterwards.
 */
const toPartBody = (body: unknown): unknown =>
  isRecord(body)
    ? {
        index: body.index,
        name: body.name ?? null,
        faceCount: body.faceCount,
        boundingBox: isRecord(body.boundingBox)
          ? { lower: body.boundingBox.lower, upper: body.boundingBox.upper }
          : body.boundingBox,
      }
    : body

const failedInspection = (error: string | null | undefined): string => {
  if (error?.startsWith('no_solid_bodies:')) {
    return 'This file holds no solid body to machine. Export the part as a solid and upload it again.'
  }
  return error ?? 'The Toolpath Engine could not read this file.'
}

const readInspection = async (
  apiKey: string,
  appName: string,
  fileId: string,
  job: JobDetail,
): Promise<InspectionEvent> => {
  if (job.status === 'failed') {
    return { status: 'failed', message: failedInspection(job.error) }
  }
  if (job.status !== 'succeeded') {
    return {
      status: 'pending',
      progress: job.progress,
      message: job.status === 'running' ? 'Reading the file’s bodies…' : 'Inspection is queued…',
    }
  }
  const file = await readRaw(
    createEngineClient(apiKey, appName).files.getFileRaw({ id: fileId }),
    'read file',
    fileSchema,
  )
  const bodies = file.bodies.map(toPartBody)
  if (!isPartBodies(bodies)) {
    return { status: 'failed', message: failedInspection(null) }
  }
  return { status: 'ready', bodies }
}

/**
 * Every upload goes through a file, whether it holds one body or several: the
 * Engine lists a file's bodies once, and a part is made of the one chosen.
 *
 * The browser PUTs the CAD bytes straight to `uploadUrl`, so nothing large
 * passes through this server; nothing else here returns or logs an Engine URL.
 */
export const registerFileRoutes = (app: Hono<AppEnv>, { appName, connection }: PartApiContext) => {
  app.post('/api/files', zValidator('json', createFileSchema), async (c) => {
    const apiKey = await connection.requireApiKey(c)
    const { filename } = c.req.valid('json')
    if (!isSupportedCadFilename(filename)) {
      throw new HTTPException(400, { message: 'Choose a supported CAD file.' })
    }
    const created = await readRaw(
      createEngineClient(apiKey, appName).files.createFileRaw({ filename }),
      'create file upload',
      createdFileSchema,
    )
    // This URL is a short-lived, single-object PUT for uploading the CAD file.
    return c.json({ fileId: created.fileId, uploadUrl: created.uploadUrl }, 201)
  })

  app.patch('/api/files/:fileId', zValidator('param', fileParamsSchema), async (c) => {
    const apiKey = await connection.requireApiKey(c)
    const { fileId } = c.req.valid('param')
    const inspection = await readRaw(
      createEngineClient(apiKey, appName).files.updateFileRaw({
        id: fileId,
        idempotencyKey: crypto.randomUUID(),
      }),
      'inspect file',
      inspectionSchema,
    )
    return c.json({ fileId, jobId: inspection.jobId }, 202)
  })

  app.get(
    '/api/files/:fileId/events',
    zValidator('param', fileParamsSchema),
    zValidator('query', eventsQuerySchema),
    async (c) => {
      const apiKey = await connection.requireApiKey(c)
      const { fileId } = c.req.valid('param')
      const { jobId } = c.req.valid('query')

      return jobEvents(c, {
        apiKey,
        appName,
        jobId,
        event: 'inspection',
        belongs: (job) => job.fileUuid === fileId,
        read: (job) => readInspection(apiKey, appName, fileId, job),
        foreign: 'This inspection is not for this file. Upload the file again.',
        lost: 'Could not follow the inspection of this file. Upload it again.',
      })
    },
  )

  app.post(
    '/api/files/:fileId/parts',
    zValidator('param', fileParamsSchema),
    zValidator('json', makePartSchema),
    async (c) => {
      const apiKey = await connection.requireApiKey(c)
      const { fileId } = c.req.valid('param')
      const { bodyIndex } = c.req.valid('json')
      const engine = createEngineClient(apiKey, appName)
      const made = await readRaw(
        engine.files.createFilePartsRaw({
          id: fileId,
          createFilePartsRequest: { bodies: [bodyIndex] },
        }),
        'make part from file',
        madePartsSchema,
      )
      const part = made.parts.find((each) => each.bodyIndex === bodyIndex)
      if (!part) {
        throw new Error(`The Toolpath Engine made no part of body ${bodyIndex}.`)
      }
      const jobId = await startAnalysis(engine, part.partId)
      return c.json({ partId: part.partId, jobId }, 201)
    },
  )
}
