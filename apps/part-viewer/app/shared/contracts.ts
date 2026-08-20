import type { FeatureDatasheet, PartFeature as ApiPartFeature, PartResponse } from '@toolpath/api'

/**
 * Datasheets are returned by a separate Engine endpoint, rather than embedded
 * in the part report. Keep the stitched result explicit at the application
 * boundary so both the server and inspector can rely on it being present (or
 * explicitly unavailable).
 */
export type PartFeature = Omit<ApiPartFeature, 'featureId'> & {
  featureId?: string
  datasheet?: FeatureDatasheet | null
}

export type PartReport = Omit<PartResponse, 'features'> & {
  features: PartFeature[]
}

/** Report data which is safe to serialize into an API response or Server-Sent Event. */
export type PublicInspectionReport = Omit<
  PartReport,
  'meshGlbUrl' | 'meshStlUrl' | 'thumbnailUrl'
> & {
  hasMeshGlb: boolean
  hasMeshStl: boolean
  hasThumbnail: boolean
}

export const toPublicInspectionReport = (report: PartReport): PublicInspectionReport => {
  const { meshGlbUrl, meshStlUrl, thumbnailUrl, ...safeReport } = report
  return {
    ...safeReport,
    hasMeshGlb: Boolean(meshGlbUrl),
    hasMeshStl: Boolean(meshStlUrl),
    hasThumbnail: Boolean(thumbnailUrl),
  }
}

export type AnalysisEvent =
  | { status: 'pending'; progress: number | null; message: string }
  | { status: 'failed'; message: string }
  | { status: 'ready'; report: PublicInspectionReport }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

// Validate the event envelope before it affects UI state. Keep this small and dependency-free:
// the full report has already been validated by Engine and redacted by the server.
export const parseAnalysisEvent = (value: unknown): AnalysisEvent => {
  if (!isRecord(value) || typeof value.status !== 'string')
    throw new Error('Invalid analysis event')

  if (
    value.status === 'pending' &&
    (typeof value.progress === 'number' || value.progress === null) &&
    typeof value.message === 'string'
  ) {
    return { status: 'pending', progress: value.progress, message: value.message }
  }
  if (value.status === 'failed' && typeof value.message === 'string') {
    return { status: 'failed', message: value.message }
  }
  if (
    value.status === 'ready' &&
    isRecord(value.report) &&
    typeof value.report.partId === 'string' &&
    typeof value.report.reportId === 'string' &&
    typeof value.report.jobId === 'string' &&
    Array.isArray(value.report.features)
  ) {
    return { status: 'ready', report: value.report as PublicInspectionReport }
  }
  throw new Error('Invalid analysis event')
}

export interface ApiProblem {
  error: string
  message: string
}
