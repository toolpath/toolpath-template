import type { CatalogTool } from './types.js'
import type { Assembly } from './toolholding.js'

/**
 * Which tool cuts which feature, and how far through the part that gets you.
 *
 * **Two passes, counted separately.** `rough` and `finish` are the same two the
 * DFM application uses, and progress is reported per pass rather than rolled
 * into one number: a part whose every feature has a rougher and no finisher is
 * half-planned in a specific way, and one number would hide which half.
 *
 * **Progress is counted in features**, not area or volume. A feature is the
 * unit the selection already works in, it needs no measurement the report might
 * not state, and it is the thing a person actually ticks off.
 *
 * **100% is not the goal.** A part is allowed to ship with features nobody maps
 * — a fillet somebody leaves as cast, a face the fixture covers — so nothing
 * here treats an unmapped feature as an error, and no percentage is presented
 * as a score to beat.
 */

export type Pass = 'finish' | 'rough'

export const PASSES: ReadonlyArray<Pass> = ['rough', 'finish']

/**
 * One decision: this feature, this pass, this tool.
 *
 * Identities, never geometry. The tool is a guid that resolves through the
 * catalog on every render, so a rebuilt catalog cannot leave a stale diameter
 * behind in somebody's plan.
 */
export interface Mapping {
  readonly featureTag: string
  readonly pass: Pass
  readonly toolGuid: string
  /** The assembly chosen for it, where one has been. */
  readonly holderGuid?: string | null
  readonly colletGuid?: string | null
  readonly stickout?: number | null
}

/** Every mapping for a part, keyed by nothing: order is the order they were made. */
export type Plan = ReadonlyArray<Mapping>

const at = (plan: Plan, featureTag: string, pass: Pass): Mapping | undefined =>
  plan.find((each) => each.featureTag === featureTag && each.pass === pass)

export const mappingFor = (plan: Plan, featureTag: string, pass: Pass): Mapping | null =>
  at(plan, featureTag, pass) ?? null

/**
 * Map a tool to a feature for one pass, replacing whatever was there.
 *
 * One tool per feature per pass: mapping a second is a correction, not an
 * addition, and keeping both would leave a plan that says two things.
 */
export const mapTool = (
  plan: Plan,
  featureTag: string,
  pass: Pass,
  tool: CatalogTool,
  assembly?: Assembly | null,
): Array<Mapping> => [
  ...plan.filter((each) => !(each.featureTag === featureTag && each.pass === pass)),
  {
    featureTag,
    pass,
    toolGuid: tool.guid,
    holderGuid: assembly?.holder.guid ?? null,
    colletGuid: assembly?.collet?.guid ?? null,
    stickout: assembly?.stickout ?? null,
  },
]

export const unmap = (plan: Plan, featureTag: string, pass: Pass): Array<Mapping> =>
  plan.filter((each) => !(each.featureTag === featureTag && each.pass === pass))

/** How far one pass has got, in features. */
export interface PassProgress {
  readonly pass: Pass
  readonly mapped: number
  readonly total: number
  /** Zero when there is nothing to map, rather than a division by zero. */
  readonly fraction: number
}

export const passProgress = (
  plan: Plan,
  featureTags: ReadonlyArray<string>,
  pass: Pass,
): PassProgress => {
  const tags = new Set(featureTags)
  const mapped = new Set(
    plan
      .filter((each) => each.pass === pass && tags.has(each.featureTag))
      .map((each) => each.featureTag),
  ).size

  return {
    pass,
    mapped,
    total: tags.size,
    fraction: tags.size === 0 ? 0 : mapped / tags.size,
  }
}

/** Both passes, in the order they happen. */
export const planProgress = (plan: Plan, featureTags: ReadonlyArray<string>): Array<PassProgress> =>
  PASSES.map((pass) => passProgress(plan, featureTags, pass))

/**
 * Which features have nothing mapped for a pass.
 *
 * Named rather than counted, because "eleven left" is a number and "these
 * eleven" is a next action.
 */
export const unmappedFeatures = (
  plan: Plan,
  featureTags: ReadonlyArray<string>,
  pass: Pass,
): Array<string> => {
  const done = new Set(plan.filter((each) => each.pass === pass).map((each) => each.featureTag))
  return featureTags.filter((tag) => !done.has(tag))
}

/**
 * A plan that refers to features this part does not have.
 *
 * Reported rather than swept up: a plan saved against one part and opened
 * against another is a mistake worth seeing, and silently dropping the strays
 * would make a half-applied plan look complete.
 */
export const strayMappings = (plan: Plan, featureTags: ReadonlyArray<string>): Array<Mapping> => {
  const tags = new Set(featureTags)
  return plan.filter((each) => !tags.has(each.featureTag))
}

/** Every distinct tool a plan calls for — the tool list a setup sheet needs. */
export const toolsInPlan = (plan: Plan): Array<string> => [
  ...new Set(plan.map((each) => each.toolGuid)),
]
