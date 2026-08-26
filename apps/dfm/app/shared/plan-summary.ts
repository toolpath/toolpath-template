import type { PartFeature } from './contracts'
import type { PartFaces, Pass, Setup, SetupPlan } from './setups'
import {
  PASSES,
  areaOfRegions,
  coverageOf,
  coveredRegions,
  cutRegions,
  directionOf,
  givenUp,
  takenOn,
} from './setups'
import { directionKey, directionLabel } from './report'
import { inferable } from './infer'
import type { FeatureVerdict } from './rules'
import type { Vec3 } from '@toolpath/api'

/**
 * What a mapping amounts to, per pass and per direction.
 *
 * Everything the Directions panel reads, in one place, because "how much is
 * mapped" is asked from the bars at the top, from each direction's own row and
 * from the summary over the part — and three of them computing it slightly
 * differently is how a number stops being trusted.
 */

export interface PassCoverage {
  pass: Pass
  /** Fraction of the part's surface this pass reaches. */
  mapped: number
}

export const planCoverage = (
  report: PartFaces,
  features: ReadonlyArray<PartFeature>,
  plan: SetupPlan,
): Array<PassCoverage> =>
  PASSES.map((pass) => ({ pass, mapped: coverageOf(report, features, plan, pass).mapped }))

export interface SetupGroup {
  setup: Setup
  label: string
  /** The readings assigned to this setup, in either pass. */
  readings: Array<PartFeature>
  /** Fraction of the part this setup reaches, by roughing. */
  mapped: number
  /** Surface area it holds. */
  area: number
  /**
   * Whether there is anything left for this way up to pick up.
   *
   * False when every reading it can reach is already mapped — to it or to
   * somebody else — or when it can reach none at all, which is the state a
   * named direction the Engine never analysed is permanently in.
   *
   * The panel greys `Fill` on it. A button that does nothing is worse than no
   * button: it reads as a thing that failed rather than a thing with nothing
   * to do.
   */
  canInfer: boolean
}

/**
 * The confirmed directions — the plan's own list, not the Engine's candidates.
 *
 * A setup appears here because somebody put work on it. That is the difference
 * between this and the candidate list beside it: candidates are what the part
 * offers, setups are what has been decided.
 */
export const setupGroups = (
  report: PartFaces,
  features: ReadonlyArray<PartFeature>,
  directions: ReadonlyArray<Vec3>,
  plan: SetupPlan,
  /**
   * The rules' verdicts, where they are to hand.
   *
   * Only used to decide whether `Fill` has anything to offer — and it has to be
   * the same verdicts the press will use, or the button greys on a different
   * answer from the one somebody gets.
   */
  verdicts?: ReadonlyArray<FeatureVerdict>,
): Array<SetupGroup> =>
  plan.setups.map((setup) => {
    const readings = features.filter((feature) =>
      PASSES.some((pass) => plan.assigned[feature.featureTag]?.[pass] === setup.id),
    )
    const direction = directionOf(setup, directions)

    /*
     * Whether `Fill` has anything to offer, **asked of the thing that answers**.
     *
     * `inferable` is what `propose` runs, and `propose` returns nothing when it
     * comes back empty — so asking it here is the only way the button's greyed
     * state and the press agree. A second copy of the reasoning is the shape
     * this codebase has been bitten by four times: two answers to one question,
     * drifting apart quietly.
     *
     * `null` direction means a way up the Engine never analysed. Nothing is
     * attributed to it, so there is nothing to infer — which is exactly what
     * the button should say.
     */
    const canInfer =
      direction !== null &&
      inferable(features, plan, direction, 'everything', verdicts, setup.id).length > 0

    return {
      setup,
      canInfer,
      label: direction ? directionLabel(direction) : setup.name,
      readings,
      mapped: coverageOf(report, features, plan, 'rough', setup.id).mapped,
      // The area it actually holds. A reading that gave up nine of its twelve
      // faces is not holding twelve faces' worth of the part.
      area: readings.reduce(
        (total, feature) =>
          total +
          areaOfRegions(report, new Set(PASSES.flatMap((pass) => cutRegions(plan, feature, pass)))),
        0,
      ),
    }
  })

/**
 * The **faces** nothing cuts — which is what "not cut yet" actually means.
 *
 * Counting unassigned *readings* says something quite different and alarming: a
 * face is reported from every way up that can reach it, so most readings are
 * alternatives that were never going to be cut. Under cut-once they must lose,
 * and on a real part that reads as "60 of 74 have no way up" beside a coverage
 * bar at 100%.
 *
 * A face with no reading assigned is the honest gap, and it is the same thing
 * the coverage bar measures — so the two can no longer disagree.
 */
export const uncutFaces = (
  report: PartFaces,
  features: ReadonlyArray<PartFeature>,
  plan: SetupPlan,
  pass: Pass = 'rough',
): Array<number> => {
  const cut = new Set<number>()

  for (const feature of features) {
    // What each reading cuts, not what it covers — a face given up to another
    // reading is cut by that one, and a face nobody took is uncut even though
    // the reading covering it is assigned.
    for (const idx of cutRegions(plan, feature, pass)) cut.add(idx)
  }

  return report.regions.map((region) => region.idx).filter((idx) => !cut.has(idx))
}

/**
 * One uncut face, with everything the list needs to say about it.
 *
 * **Faces, not features.** A feature is "unmapped" whenever nothing is assigned
 * to it, which on a finished part is most of them — every reading of a face is
 * an alternative and only one can win. Worse, a feature can read as unmapped
 * while every face it covers is already cut by somebody else, so a list of them
 * is a list somebody has to sort through to find the few that are real gaps.
 * A face is either cut or it is not, and that is the question being asked.
 */
export interface UncutFace {
  idx: number
  shape: string
  area: number
  /**
   * The readings that could take it — the row's own answer to "so cut it how".
   *
   * A list that only says what is missing makes somebody go and find it again,
   * so the candidates travel with the face and the row opens onto them.
   */
  owners: Array<PartFeature>
  /**
   * The ways up those readings are read from, by candidate direction.
   *
   * Derived from `owners` rather than gathered beside them, so the dots on a
   * row and the readings under it cannot disagree. Empty means no reading
   * reaches it from any way up — a gap in the analysis rather than in the plan,
   * and the one kind of row nothing can be done about here. See
   * {@link unreachableFaces}.
   */
  from: Array<number>
}

/**
 * Every face nothing cuts, biggest first, with who could take it.
 *
 * Biggest first because the list is opened to find work, and the largest gap is
 * both the most expensive to leave and the easiest to find on the part. Sorted
 * on area rather than on face number for that reason alone: face order is the
 * Engine's, and it means nothing to the person reading.
 */
export function uncutRows(
  report: PartFaces,
  directions: ReadonlyArray<Vec3>,
  features: ReadonlyArray<PartFeature>,
  plan: SetupPlan,
  pass: Pass = 'rough',
): Array<UncutFace> {
  const byIdx = new Map(report.regions.map((region) => [region.idx, region]))
  const index = new Map(directions.map((direction, at) => [directionKey(direction), at]))

  /*
   * Who covers what, once, rather than per face.
   *
   * `coveredRegions` rather than the Engine's `regionIdxs`: a face handed to a
   * reading is one that reading could cut, and the row exists to say what could
   * take this face now.
   */
  const covering = new Map<number, Array<PartFeature>>()
  for (const feature of features) {
    if (index.get(directionKey(feature.machiningDirection)) === undefined) continue
    for (const idx of coveredRegions(plan, feature)) {
      const already = covering.get(idx)
      if (already) already.push(feature)
      else covering.set(idx, [feature])
    }
  }

  return uncutFaces(report, features, plan, pass)
    .map((idx) => {
      const owners = covering.get(idx) ?? []

      return {
        idx,
        shape: byIdx.get(idx)?.shapeKind ?? 'unknown',
        area: byIdx.get(idx)?.area ?? 0,
        owners,
        from: [
          ...new Set(
            owners.flatMap((feature) => {
              const at = index.get(directionKey(feature.machiningDirection))
              return at === undefined ? [] : [at]
            }),
          ),
        ].sort((a, b) => a - b),
      }
    })
    .sort((a, b) => b.area - a.area || a.idx - b.idx)
}

/**
 * Faces no reading reaches from any way up at all.
 *
 * Not a gap in the plan — a gap in the analysis. Counting them against a plan
 * makes an arrangement look incomplete for something no arrangement could fix,
 * so they are named separately or not at all.
 */
export const unreachableFaces = (
  report: PartFaces,
  features: ReadonlyArray<PartFeature>,
): Array<number> => {
  const reachable = new Set(features.flatMap((feature) => feature.regionIdxs))
  return report.regions.map((region) => region.idx).filter((idx) => !reachable.has(idx))
}

/**
 * Which way up cuts each feature, in one pass.
 *
 * The lookup the directions paint reads. Keyed by the **setup's** direction, so
 * the part is coloured by what has been decided rather than by what the Engine
 * happened to report — a feature the plan says nothing about has no entry, and
 * paints as nothing.
 */
export const cutByDirection = (
  features: ReadonlyArray<PartFeature>,
  plan: SetupPlan,
  pass: Pass,
): Map<string, number> => {
  const byId = new Map(plan.setups.map((setup) => [setup.id, setup.directionIndex]))
  const cutBy = new Map<string, number>()

  for (const feature of features) {
    const setupId = plan.assigned[feature.featureTag]?.[pass]
    if (setupId === undefined) continue
    const direction = byId.get(setupId)
    if (direction === undefined) continue
    // Only a reading cutting **exactly** what it covers can be named by its
    // tag: the viewer expands a tag to the faces the Engine reported, which is
    // one face too many for a reading that gave one up and one too few for a
    // reading that was handed one. Anything else paints face by face — see
    // `cutRegionsByDirection`.
    if (!exactlyItsOwn(plan, feature, pass)) continue
    cutBy.set(feature.featureTag, direction)
  }

  return cutBy
}

/**
 * The same answer, for readings whose faces are not the ones they were reported
 * with — cutting part of themselves, or holding a face handed to them.
 *
 * A feature is the usual way to say what a colour means, and the cheap one —
 * the viewer expands a tag to its faces itself. That breaks the moment a
 * reading gives a face up: painting the feature would colour a face the plan
 * has handed to a different way up, and the two layers would fight over it in
 * whatever order they happened to be in.
 *
 * So a part-cut reading paints **its own faces** instead, through the viewer's
 * region layer, and drops out of {@link cutByDirection}. The two sets are
 * disjoint by cut-once, so they cannot disagree about a face however they are
 * ordered.
 */
export const cutRegionsByDirection = (
  features: ReadonlyArray<PartFeature>,
  plan: SetupPlan,
  pass: Pass,
): Map<number, number> => {
  const byId = new Map(plan.setups.map((setup) => [setup.id, setup.directionIndex]))
  const cutBy = new Map<number, number>()

  for (const feature of features) {
    if (exactlyItsOwn(plan, feature, pass)) continue
    const setupId = plan.assigned[feature.featureTag]?.[pass]
    const direction = setupId === undefined ? undefined : byId.get(setupId)
    if (direction === undefined) continue
    for (const idx of cutRegions(plan, feature, pass)) cutBy.set(idx, direction)
  }

  return cutBy
}

/**
 * Whether this reading cuts precisely the faces the Engine reported in it.
 *
 * The question every by-tag paint has to ask first. The viewer colours a
 * feature by expanding its tag to `regionIdxs`, which is the whole truth only
 * while the plan has not moved a face either way: one face too many for a
 * reading that gave one up, and one too few for a reading that was handed one.
 *
 * Both halves matter and only the first was ever checked. A wall handed two
 * faces still cut all three of its own, so it passed the "gave nothing up" test
 * and was painted by tag — and the two added faces, mapped and listed and
 * ticked, were left grey on the part.
 */
const exactlyItsOwn = (plan: SetupPlan, feature: PartFeature, pass: Pass): boolean =>
  givenUp(plan, feature, pass).length === 0 && takenOn(plan, feature, pass).length === 0
