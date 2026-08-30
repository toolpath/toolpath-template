import type { FeatureDatasheet, PartFeature as ApiPartFeature, PartResponse } from '@toolpath/api'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * Datasheets are returned by a separate Engine endpoint, rather than embedded
 * in the part report. Keep the stitched result explicit at the application
 * boundary so both the server and inspector can rely on it being present (or
 * explicitly unavailable).
 */
/**
 * How deep a tool must reach, by how far outboard of the cut the material
 * stands — Engine API 1.0.4's `FeatureDatasheet.reachCurve`.
 *
 * Material within `horizontalOffset[i]` of the feature rises to
 * `verticalOffset[i]` above its bottom, so anything on the tool standing that
 * far past its own cutting edge must clear that much. Both arrays are the same
 * length, ascending, non-negative, in millimetres; the curve is a
 * non-decreasing step function, and offsets beyond its last knot clamp to it.
 * Offsets are from the wall of the cut, never the tool's axis.
 *
 * **Declared here, not taken from the SDK**, because `@toolpath/api` 0.2.x
 * predates the field and its deserialiser drops it. `@toolpath/part-server`
 * grafts it back from the raw response; when the SDK catches up this becomes
 * a re-export of its type and the graft goes.
 */
export interface ReachCurve {
  readonly horizontalOffset: ReadonlyArray<number>
  readonly verticalOffset: ReadonlyArray<number>
}

/** Whether a value is a well-formed reach curve: two equal-length, ascending, non-negative arrays. */
export const isReachCurve = (value: unknown): value is ReachCurve => {
  if (!isRecord(value)) {
    return false
  }
  const { horizontalOffset, verticalOffset } = value
  if (!Array.isArray(horizontalOffset) || !Array.isArray(verticalOffset)) {
    return false
  }
  if (horizontalOffset.length !== verticalOffset.length || horizontalOffset.length === 0) {
    return false
  }
  const ascending = (list: Array<unknown>): boolean =>
    list.every(
      (each, index) =>
        typeof each === 'number' &&
        Number.isFinite(each) &&
        each >= 0 &&
        (index === 0 || each >= (list[index - 1] as number)),
    )
  return ascending(horizontalOffset) && ascending(verticalOffset)
}

export type PartFeature = Omit<ApiPartFeature, 'featureId'> & {
  featureId?: string
  datasheet?: (FeatureDatasheet & { reachCurve?: ReachCurve }) | null
}

export type PartReport = Omit<PartResponse, 'features'> & {
  features: Array<PartFeature>
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

// Validate the event envelope before it affects UI state. Keep this small and dependency-free:
// the full report has already been validated by Engine and redacted by the server.
export const parseAnalysisEvent = (value: unknown): AnalysisEvent => {
  if (!isRecord(value) || typeof value.status !== 'string') {
    throw new Error('Invalid analysis event')
  }

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
