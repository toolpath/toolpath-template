import type { Vec3 } from '@toolpath/api'

import type { PartFeature } from './contracts'
import { directionKey, kindOf } from './report'
import { forcedRegions, isUndercut } from './reach'
import { PASSES, claimedRegions } from './setups'
import type { SetupPlan } from './setups'
import type { FeatureVerdict } from './rules'
import { scoreFeature } from './rules'

/**
 * Inferred readings — the app saying *"the part is already held this way, here
 * is everything else that could be cut without touching the vice."*
 *
 * The single biggest time-saver in the mapping flow and the single easiest thing
 * to get wrong, because it is the app volunteering work nobody asked for. The
 * rule the whole flow is built on:
 *
 * > **Nothing is inferred until somebody presses Infer. Nothing is assigned
 * > until somebody presses R, F or Both on a row.**
 *
 * Both halves were violated by earlier builds of the picker and both were
 * reported as bugs in almost those words — *"it's enabling features for roughing
 * and finishing without me telling it to"*, *"you're creating setups from out of
 * nowhere"*. So there are three visibly distinct states: nothing, **proposed**
 * (the app is offering; nothing has changed), and **assigned**.
 */
export type Infer = 'everything' | 'holes' | 'only here'

export const INFER_SCOPES: ReadonlyArray<{ kind: Infer; name: string; note: string }> = [
  { kind: 'only here', name: 'Only here', note: 'the work nothing else can reach' },
  { kind: 'everything', name: 'Infer features', note: 'everything else this way up can cut' },
  { kind: 'holes', name: 'Holes on axis', note: 'the holes on this axis' },
]

const scoreIn = (feature: PartFeature, verdicts: Map<string, FeatureVerdict>): number | null => {
  const verdict = verdicts.get(feature.featureTag)
  return verdict ? scoreFeature(verdict) : null
}

/**
 * What this way up could also cut.
 *
 * Excluded, and why:
 *
 * - **Undercuts, always.** Reachable in the Engine's sense, but they want a
 *   cutter that goes in sideways. Sweeping one into "everything else this way up
 *   can reach" quietly promises a shop something no endmill will do. They stay
 *   assignable by hand — they are only never *volunteered*.
 * - **What this setup already cuts.** Offering it again is noise.
 * - **Not** what another setup cuts. "Cut this from here instead" is an ordinary
 *   thing to decide, and a version that skipped everything already spoken for
 *   answered "0 features" on every part that had been mapped — which is every
 *   part by the time somebody is rearranging one.
 */
export const inferable = (
  features: ReadonlyArray<PartFeature>,
  plan: SetupPlan,
  direction: Vec3,
  kind: Infer = 'everything',
  verdicts?: ReadonlyArray<FeatureVerdict>,
  setupId?: string,
): Array<PartFeature> => {
  const forced = kind === 'only here' ? forcedRegions(features) : null
  const wanted = directionKey(direction)
  const byTag = new Map((verdicts ?? []).map((entry) => [entry.tag, entry]))
  const claimed = claimedRegions(features, plan)

  /*
   * Whether this setup is already cutting that reading.
   *
   * Spelled out because the obvious comparison has the trap in it: with no setup
   * named, `assigned[tag]?.[pass] === setupId` is `undefined === undefined` for
   * every feature on an empty plan, and the offer comes back empty on exactly
   * the part that needs it most.
   */
  const alreadyMine = (feature: PartFeature) =>
    setupId !== undefined &&
    PASSES.some((pass) => plan.assigned[feature.featureTag]?.[pass] === setupId)

  // Smallest readings first, then best-scoring. An offer of eight walls can have
  // one clicked off; the profile covering the same eight faces can only be taken
  // or left, and taking it decides seven faces nobody was asked about.
  // Granularity is what keeps an offer arguable.
  const mine = [...features]
    .filter(
      (feature) =>
        directionKey(feature.machiningDirection) === wanted &&
        !alreadyMine(feature) &&
        !isUndercut(feature) &&
        (kind !== 'holes' || kindOf(feature) === 'Hole') &&
        (forced === null || feature.regionIdxs.some((idx) => forced.has(idx))),
    )
    .sort(
      (a, b) =>
        a.regionIdxs.length - b.regionIdxs.length ||
        (scoreIn(b, byTag) ?? 0) - (scoreIn(a, byTag) ?? 0),
    )

  const offered: Array<PartFeature> = []

  for (const feature of mine) {
    if (feature.regionIdxs.some((idx) => claimed.has(idx))) continue
    for (const idx of feature.regionIdxs) claimed.add(idx)
    offered.push(feature)
  }

  /*
   * What smallest-first left behind.
   *
   * Preferring small readings keeps an offer arguable, but it also loses work: a
   * two-face fillet taken early blocks the twelve-face pocket sharing one of
   * them, and the pocket's other eleven faces are then covered by nothing at
   * all. The offer comes back short and those faces read as unreachable from a
   * direction that can plainly reach them.
   *
   * So each uncovered face gets a second hearing: the smallest reading covering
   * it that overlaps **only** readings this offer can give back — ones it wholly
   * contains. A face is still cut exactly once, and nothing outside this offer
   * is touched.
   */
  const missed = new Set(
    mine
      .flatMap((feature) => feature.regionIdxs)
      .filter((idx) => !offered.some((taken) => taken.regionIdxs.includes(idx))),
  )

  for (const idx of missed) {
    if (offered.some((taken) => taken.regionIdxs.includes(idx))) continue

    const rescue = mine
      .filter((feature) => feature.regionIdxs.includes(idx))
      .find((feature) => {
        const faces = new Set(feature.regionIdxs)
        return feature.regionIdxs.every(
          (face) =>
            // Free, or held only by a reading this one wholly contains.
            !claimed.has(face) ||
            offered.some(
              (taken) =>
                taken.regionIdxs.includes(face) &&
                taken.regionIdxs.every((held) => faces.has(held)),
            ),
        )
      })

    if (!rescue) continue

    const faces = new Set(rescue.regionIdxs)
    for (let at = offered.length - 1; at >= 0; at--) {
      if (offered[at]!.regionIdxs.every((held) => faces.has(held))) offered.splice(at, 1)
    }
    for (const face of rescue.regionIdxs) claimed.add(face)
    offered.push(rescue)
  }

  return offered
}

/**
 * The best set of readings that cuts exactly these faces and no others.
 *
 * A face taken out of an offer should take only itself out. A face shared
 * between a wall and a `face` can be cut either way, so losing one face of a
 * wall does not mean losing its other seven — it means finding the readings that
 * cover what is *left*, which may be several smaller ones in place of the big
 * one.
 *
 * Whole readings only, no overlaps, and anything reaching outside the wanted set
 * is ineligible, because cutting it would cut a face nobody asked for.
 */
export const coverFaces = (
  features: ReadonlyArray<PartFeature>,
  direction: Vec3,
  wanted: ReadonlySet<number>,
  verdicts?: ReadonlyArray<FeatureVerdict>,
  /**
   * The readings already chosen, which stay chosen.
   *
   * Without this, re-covering is free to swap a wall for the profile containing
   * it — so enabling one wall quietly enables the whole outline. That was
   * reported as *"when I select this wall, it's chaining the wall into the full
   * profile"*, and it is why an offer is a face set rather than a feature set.
   */
  prefer: ReadonlySet<string> = new Set(),
): Array<PartFeature> => {
  const key = directionKey(direction)
  const byTag = new Map((verdicts ?? []).map((entry) => [entry.tag, entry]))
  const taken = new Set<number>()
  const chosen: Array<PartFeature> = []

  const eligible = [...features]
    .filter(
      (feature) =>
        directionKey(feature.machiningDirection) === key &&
        feature.regionIdxs.length > 0 &&
        feature.regionIdxs.every((idx) => wanted.has(idx)),
    )
    .sort(
      (a, b) =>
        Number(prefer.has(b.featureTag)) - Number(prefer.has(a.featureTag)) ||
        a.regionIdxs.length - b.regionIdxs.length ||
        (scoreIn(b, byTag) ?? 0) - (scoreIn(a, byTag) ?? 0),
    )

  for (const feature of eligible) {
    if (feature.regionIdxs.some((idx) => taken.has(idx))) continue
    for (const idx of feature.regionIdxs) taken.add(idx)
    chosen.push(feature)
  }

  return chosen
}

/**
 * The readings from one direction that **reach** any of these faces.
 *
 * Reaching, not contained by: a through pocket has walls and a floor, and nobody
 * paints all eight faces of three pockets to ask an obvious question. What each
 * reading brings with it beyond what was painted is shown as a face count rather
 * than hidden.
 *
 * Smallest first and non-overlapping, so the answer is as fine-grained as the
 * Engine allows and never cuts one face twice.
 */
export const readingsFor = (
  features: ReadonlyArray<PartFeature>,
  direction: Vec3,
  faces: ReadonlySet<number>,
  verdicts?: ReadonlyArray<FeatureVerdict>,
): Array<PartFeature> => {
  const key = directionKey(direction)
  const byTag = new Map((verdicts ?? []).map((entry) => [entry.tag, entry]))
  const taken = new Set<number>()
  const chosen: Array<PartFeature> = []

  const touching = [...features]
    .filter(
      (feature) =>
        directionKey(feature.machiningDirection) === key &&
        feature.regionIdxs.some((idx) => faces.has(idx)),
    )
    .sort(
      (a, b) =>
        a.regionIdxs.length - b.regionIdxs.length ||
        (scoreIn(b, byTag) ?? 0) - (scoreIn(a, byTag) ?? 0),
    )

  for (const feature of touching) {
    if (feature.regionIdxs.some((idx) => taken.has(idx))) continue
    for (const idx of feature.regionIdxs) taken.add(idx)
    chosen.push(feature)
  }

  return chosen
}
