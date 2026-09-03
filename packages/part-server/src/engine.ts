import {
  createToolpathClient,
  ResponseError,
  type KeyValidationResponseStatusEnum,
} from '@toolpath/api'
import type { PartFeature, PartReport } from '@toolpath/part-contracts'

const DATASHEET_BATCH_SIZE = 50

/**
 * Batches in flight at once.
 *
 * Batching exists to stay inside a URL length limit, not to pace the Engine, so
 * the batches do not have to be serial — but firing every batch of a
 * 2,000-feature part at once trades a latency problem for a load one. Justin
 * Gray's number, ported from `apps/dfm/server/engine.ts` when the two servers
 * became one package (2026-09-02).
 */
const DATASHEET_BATCH_CONCURRENCY = 4

const apiBaseUrl = (): string => {
  const baseUrl = process.env.TOOLPATH_API_BASE_URL
  if (!baseUrl) {
    throw new Error(
      'TOOLPATH_API_BASE_URL must be set. Add the Engine API URL to the application’s .env file.',
    )
  }
  return baseUrl
}

export class EngineError extends Error {
  constructor(
    readonly status: number,
    readonly code = 'engine_request_failed',
    readonly operation = 'request',
    /** What the Engine said, in its own words, where it said anything. */
    readonly detail: string | null = null,
  ) {
    super(`Toolpath Engine ${operation} failed with HTTP ${status}.`)
    this.name = 'EngineError'
  }
}

/**
 * The Engine's own explanation of a failure, off its response body.
 *
 * A 402 with no words is "Payment Required" and a shrug; the Engine's body
 * usually says which account, plan or quota it is. JSON bodies give their
 * `message` / `detail` / `error`; anything else is taken as text. Kept short,
 * and never the whole body — it is shown to the person, not logged.
 */
export const engineDetail = async (response: Response): Promise<string | null> => {
  try {
    const text = (await response.clone().text()).trim()
    if (text === '') {
      return null
    }
    try {
      const body = JSON.parse(text) as Record<string, unknown>
      const said = [body.message, body.detail, body.error].find(
        (each): each is string => typeof each === 'string' && each.trim() !== '',
      )
      return said ? said.trim().slice(0, 200) : null
    } catch {
      return text.slice(0, 200)
    }
  } catch {
    return null
  }
}

export class InvalidApiKeyError extends Error {
  constructor(readonly keyStatus?: KeyValidationResponseStatusEnum) {
    super('The Toolpath Engine rejected the API key.')
    this.name = 'InvalidApiKeyError'
  }
}

/**
 * Safe to return to the browser; diagnostics stay in the server log. What the
 * Engine itself said is passed on, because a 402 without its reason is a
 * dead end for the person reading it.
 */
export const publicEngineErrorMessage = (status: number, detail: string | null = null): string =>
  `Toolpath Engine request failed (HTTP ${status})${detail ? `: ${detail}` : '.'}`

const engineFetch =
  (appName: string): typeof fetch =>
  async (input, init) => {
    try {
      return await fetch(input, init)
    } catch (cause) {
      // The configured URL and transport error help operators diagnose a deployment, but neither
      // is returned through the public API.
      console.error(`[${appName}] Engine transport failure`, {
        engineUrl: apiBaseUrl(),
        error: cause instanceof Error ? cause.message : String(cause),
      })
      throw new EngineError(502, 'engine_unavailable', 'transport')
    }
  }

/**
 * The sole construction point for the Toolpath TypeScript SDK.
 *
 * `appName` only names the application in transport logs. Everything else about
 * a client comes from the request's own BYOK key.
 */
export const createEngineClient = (apiKey: string, appName = 'toolpath') =>
  createToolpathClient({ apiKey, baseUrl: apiBaseUrl(), fetch: engineFetch(appName) })

export const requireData = async <T>(
  operationResult: Promise<T>,
  operation: string,
): Promise<T> => {
  try {
    return await operationResult
  } catch (error) {
    if (error instanceof ResponseError) {
      // The Engine's words are passed on for a 4xx — a quota, a plan, a key:
      // the person's own account, which only they can act on. A 5xx is the
      // Engine's problem and its body stays in the server log, never the
      // browser: the rule the 504 test below this pins.
      throw new EngineError(
        error.response.status,
        'engine_request_failed',
        operation,
        error.response.status < 500 ? await engineDetail(error.response) : null,
      )
    }
    throw error
  }
}

const keyStatusFromResponse = async (
  response: Response,
): Promise<KeyValidationResponseStatusEnum | undefined> => {
  try {
    const body = (await response.clone().json()) as { status?: unknown }
    return typeof body.status === 'string'
      ? (body.status as KeyValidationResponseStatusEnum)
      : undefined
  } catch {
    return undefined
  }
}

/** Confirms a submitted BYOK key before it is persisted in the encrypted browser session. */
export const validateApiKey = async (apiKey: string): Promise<void> => {
  try {
    const validation = await createEngineClient(apiKey).keys.validateKey()
    if (!validation.valid) {
      throw new InvalidApiKeyError(validation.status)
    }
  } catch (error) {
    if (error instanceof InvalidApiKeyError) {
      throw error
    }
    if (error instanceof ResponseError && error.response.status === 401) {
      throw new InvalidApiKeyError(await keyStatusFromResponse(error.response))
    }
    if (error instanceof ResponseError) {
      throw new EngineError(error.response.status, 'engine_request_failed', 'validate API key')
    }
    throw error
  }
}

export const getPartReport = async (
  apiKey: string,
  partId: string,
  jobId: string | null,
): Promise<PartReport | null> => {
  try {
    return await createEngineClient(apiKey).parts.getPart({
      id: partId,
      jobId: jobId ?? undefined,
    })
  } catch (error) {
    if (error instanceof ResponseError && error.response.status === 404) {
      return null
    }
    if (error instanceof ResponseError) {
      throw new EngineError(error.response.status, 'engine_request_failed', 'get report')
    }
    throw error
  }
}

/**
 * Engine omits datasheets from reports so large reports stay reasonably sized.
 * Fetch those measurements in URL-safe batches and put them back on their
 * report feature before sending the report to the browser.
 */
export const getWholePartReport = async (
  apiKey: string,
  partId: string,
  jobId: string | null,
): Promise<PartReport | null> => {
  const report = await getPartReport(apiKey, partId, jobId)
  if (!report) {
    return null
  }

  const missingIds = report.features.flatMap((feature) =>
    feature.datasheet || typeof feature.featureId !== 'string' ? [] : [feature.featureId],
  )
  if (missingIds.length === 0) {
    return report
  }

  const batches: Array<string> = []
  for (let index = 0; index < missingIds.length; index += DATASHEET_BATCH_SIZE) {
    batches.push(missingIds.slice(index, index + DATASHEET_BATCH_SIZE).join(','))
  }

  const datasheetsByTag = new Map<string, NonNullable<PartFeature['datasheet']>>()
  const engine = createEngineClient(apiKey)
  /**
   * This runs inside the SSE handler after the analysis has already succeeded,
   * so every serial round trip is time the browser spends on "Analyzing
   * geometry…" for nothing. A shared cursor hands each worker the next batch as
   * it frees up, so one slow batch does not stall the rest. The workers share
   * `datasheetsByTag`, which is safe because a feature tag belongs to exactly
   * one batch — no two workers write the same key. (Justin Gray.)
   */
  let nextBatch = 0
  const drainBatches = async () => {
    while (nextBatch < batches.length) {
      const ids = batches[nextBatch]
      nextBatch += 1
      const datasheets = await requireData(
        engine.features.getPartFeatures({ id: partId, ids: ids ?? '' }),
        'get feature datasheets',
      )
      for (const entry of datasheets.datasheets) {
        if (entry.datasheet) {
          datasheetsByTag.set(entry.featureTag, entry.datasheet)
        }
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(DATASHEET_BATCH_CONCURRENCY, batches.length) }, drainBatches),
  )

  return {
    ...report,
    features: report.features.map((feature) =>
      feature.datasheet
        ? feature
        : { ...feature, datasheet: datasheetsByTag.get(feature.featureTag) ?? null },
    ),
  }
}
