import {
  createToolpathClient,
  ResponseError,
  type KeyValidationResponseStatusEnum,
} from '@toolpath/api'
import type { PartFeature, PartReport } from '../app/shared/contracts'

const DATASHEET_BATCH_SIZE = 50

const apiBaseUrl = (): string => {
  const baseUrl = process.env.TOOLPATH_API_BASE_URL
  if (!baseUrl) {
    throw new Error('TOOLPATH_API_BASE_URL must be set. Add the Engine API URL to apps/dfm/.env.')
  }
  return baseUrl
}

export class EngineError extends Error {
  constructor(
    readonly status: number,
    readonly code = 'engine_request_failed',
    readonly operation = 'request',
  ) {
    super(`Toolpath Engine ${operation} failed with HTTP ${status}.`)
    this.name = 'EngineError'
  }
}

export class InvalidApiKeyError extends Error {
  constructor(readonly keyStatus?: KeyValidationResponseStatusEnum) {
    super('The Toolpath Engine rejected the API key.')
    this.name = 'InvalidApiKeyError'
  }
}

/** Safe to return to the browser; diagnostics stay in the server log. */
export const publicEngineErrorMessage = (status: number): string =>
  `Toolpath Engine request failed (HTTP ${status}).`

const engineFetch: typeof fetch = async (input, init) => {
  try {
    return await fetch(input, init)
  } catch (cause) {
    // The configured URL and transport error help operators diagnose a deployment, but neither
    // is returned through the public API.
    console.error('[part-viewer] Engine transport failure', {
      engineUrl: apiBaseUrl(),
      error: cause instanceof Error ? cause.message : String(cause),
    })
    throw new EngineError(502, 'engine_unavailable', 'transport')
  }
}

/** The sole construction point for the Toolpath TypeScript SDK in this application. */
export const createEngineClient = (apiKey: string) =>
  createToolpathClient({ apiKey, baseUrl: apiBaseUrl(), fetch: engineFetch })

export const requireData = async <T>(
  operationResult: Promise<T>,
  operation: string,
): Promise<T> => {
  try {
    return await operationResult
  } catch (error) {
    if (error instanceof ResponseError) {
      throw new EngineError(error.response.status, 'engine_request_failed', operation)
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

  const datasheetsByTag = new Map<string, NonNullable<PartFeature['datasheet']>>()
  const engine = createEngineClient(apiKey)
  for (let index = 0; index < missingIds.length; index += DATASHEET_BATCH_SIZE) {
    const ids = missingIds.slice(index, index + DATASHEET_BATCH_SIZE)
    const datasheets = await requireData(
      engine.features.getPartFeatures({ id: partId, ids: ids.join(',') }),
      'get feature datasheets',
    )
    for (const entry of datasheets.datasheets) {
      if (entry.datasheet) {
        datasheetsByTag.set(entry.featureTag, entry.datasheet)
      }
    }
  }

  return {
    ...report,
    features: report.features.map((feature) =>
      feature.datasheet
        ? feature
        : { ...feature, datasheet: datasheetsByTag.get(feature.featureTag) ?? null },
    ),
  }
}
