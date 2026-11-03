import type {
  FeatureDatasheet,
  FileBody,
  PartFeature as ApiPartFeature,
  PartResponse,
  Vec3,
} from '@toolpath/api'

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
 * stands — the Engine's `FeatureDatasheet.reachCurve`.
 *
 * Material within `horizontalOffset[i]` of the feature rises to
 * `verticalOffset[i]` above its bottom, so anything on the tool standing that
 * far past its own cutting edge must clear that much. Both arrays are the same
 * length, ascending, non-negative, in millimetres; the curve is a
 * non-decreasing step function, and offsets beyond its last knot clamp to it.
 * Offsets are from the wall of the cut, never the tool's axis.
 *
 * **Structurally the SDK's, with the arrays read-only.** It was declared here
 * because `@toolpath/api` 0.2.x predated the field and its deserialiser dropped
 * it, so `@toolpath/part-server` read every datasheet batch a second time raw
 * to graft the curve back on. The SDK declares the field since 0.4.0 and that
 * graft is gone — but this stayed a declaration rather than becoming
 * `export type { ReachCurve } from '@toolpath/api'`, because two packages now
 * name this shape and only one of them can be re-exported:
 *
 * - the SDK's arrays are `Array<number>`, being generated from OpenAPI;
 * - `@toolpath/tool-support`'s are `readonly number[]`, and the catalog's
 *   holder choice, drawn assembly and clearance all pass curves typed by it.
 *
 * A `readonly number[]` is not assignable to an `Array<number>`, so re-exporting
 * the SDK's put six errors through `apps/catalog/app/routes/part.tsx` alone.
 * Read-only is the supertype: a value from either package satisfies this, and
 * nothing downstream mutates a curve it was handed.
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
  datasheet?: FeatureDatasheet | null
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

/**
 * One solid body of an uploaded CAD file, as its inspection lists it: the SDK's
 * `FileBody`, with `name` stated as `null` where the file gives none — the
 * server normalises it at the boundary — and without the experimental `shape`,
 * which nothing here reads. A part is one body, made by its `index`. The box
 * is in millimetres.
 */
export type PartBody = Pick<FileBody, 'index' | 'faceCount' | 'boundingBox'> & {
  name: string | null
}

/** The largest body index the server accepts, which the Engine's own clients use too. */
export const MAX_BODY_INDEX = 999_999

/** A job the browser is following: waiting, refused, or done with what it became. */
type JobEvent<Ready> =
  | { status: 'pending'; progress: number | null; message: string }
  | { status: 'failed'; message: string }
  | ({ status: 'ready' } & Ready)

export type AnalysisEvent = JobEvent<{ report: PublicInspectionReport }>

/** The inspection of an uploaded file, which ends in the bodies it holds. */
export type InspectionEvent = JobEvent<{ bodies: Array<PartBody> }>

const isCount = (value: unknown): value is number => Number.isInteger(value) && Number(value) >= 0

const isVec3 = (value: unknown): value is Vec3 =>
  isRecord(value) && [value.x, value.y, value.z].every(Number.isFinite)

const isPartBody = (value: unknown): value is PartBody =>
  isRecord(value) &&
  isCount(value.index) &&
  value.index <= MAX_BODY_INDEX &&
  (typeof value.name === 'string' || value.name === null) &&
  isCount(value.faceCount) &&
  isRecord(value.boundingBox) &&
  isVec3(value.boundingBox.lower) &&
  isVec3(value.boundingBox.upper)

/**
 * Whether a value is a non-empty list of well-formed bodies, each named once:
 * an index is what a part is made of, so two bodies under one would make the
 * choice between them meaningless.
 */
export const isPartBodies = (value: unknown): value is Array<PartBody> =>
  Array.isArray(value) &&
  value.length > 0 &&
  value.every(isPartBody) &&
  new Set(value.map((body) => body.index)).size === value.length

/** The two statuses every job event shares, or `null` for anything else. */
const parseUnsettled = (value: Record<string, unknown>) => {
  if (
    value.status === 'pending' &&
    (typeof value.progress === 'number' || value.progress === null) &&
    typeof value.message === 'string'
  ) {
    return { status: 'pending' as const, progress: value.progress, message: value.message }
  }
  if (value.status === 'failed' && typeof value.message === 'string') {
    return { status: 'failed' as const, message: value.message }
  }
  return null
}

// Validate the event envelope before it affects UI state. Keep this small and dependency-free:
// the full report has already been validated by Engine and redacted by the server.
export const parseAnalysisEvent = (value: unknown): AnalysisEvent => {
  if (!isRecord(value)) {
    throw new Error('Invalid analysis event')
  }
  const unsettled = parseUnsettled(value)
  if (unsettled) {
    return unsettled
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

export const parseInspectionEvent = (value: unknown): InspectionEvent => {
  if (!isRecord(value)) {
    throw new Error('Invalid inspection event')
  }
  const unsettled = parseUnsettled(value)
  if (unsettled) {
    return unsettled
  }
  if (value.status === 'ready' && isPartBodies(value.bodies)) {
    return { status: 'ready', bodies: value.bodies }
  }
  throw new Error('Invalid inspection event')
}

export interface ApiProblem {
  error: string
  message: string
}
