import type { Vec3 } from '@toolpath/api'

import type { PartFeature } from './contracts'
import { directionKey } from './report'
import type { FeatureVerdict } from './rules'
import { scoreFeature } from './rules'

/**
 * What can reach what, before anything decides what to do about it.
 *
 * These answer questions about the part alone — which directions see a face,
 * which faces have only one answer, which readings are undercuts — and nothing
 * here knows what a plan or an arrangement is. That is the whole reason the
 * module exists.
 *
 * `generate.ts` and `best-reading.ts` both need them, and both used to hold
 * their own copy: `undercutOnly`/`undercutOnlyRegions`, `skipUndercut` and
 * `scoreIn` were written out twice, byte for byte apart from one rename. The
 * two modules already imported from each other — `best-reading` took
 * `forcedRegions`, `isUndercut` and `requiredDirections` from `generate`, while
 * `generate` took `byBestReading` back — so the duplication was not even buying
 * a boundary. Lifting these here breaks that cycle in the only direction it can
 * go: both arrangers depend on reachability, and reachability depends on
 * neither.
 */

/** Which directions can reach a region at all, by the features that cover it. */
const directionsPerRegion = (features: ReadonlyArray<PartFeature>): Map<number, Set<string>> => {
  const reach = new Map<number, Set<string>>()

  for (const feature of features) {
    const key = directionKey(feature.machiningDirection)
    for (const idx of feature.regionIdxs) {
      const seen = reach.get(idx) ?? new Set<string>()
      seen.add(key)
      reach.set(idx, seen)
    }
  }

  return reach
}

/**
 * The regions only one direction can reach.
 *
 * These are what force a setup. Everything else on the part is a choice between
 * directions, and a plan is entitled to argue about it.
 */
export const forcedRegions = (features: ReadonlyArray<PartFeature>): Set<number> => {
  const forced = new Set<number>()

  for (const [idx, canReach] of directionsPerRegion(features)) {
    if (canReach.size === 1) forced.add(idx)
  }

  return forced
}

/**
 * The directions the part forces: each one is the only way to reach something.
 *
 * A plan can argue about everything else. It cannot argue about these — drop one
 * and a surface has nobody to cut it — so they are the honest floor of any
 * arrangement, and what is left over afterwards is the real decision.
 */
export const requiredDirections = (
  directions: ReadonlyArray<Vec3>,
  features: ReadonlyArray<PartFeature>,
): Array<number> => {
  const forced = forcedRegions(features)
  const only = new Set<string>()

  for (const feature of features) {
    if (feature.regionIdxs.some((idx) => forced.has(idx))) {
      only.add(directionKey(feature.machiningDirection))
    }
  }

  return directions.flatMap((direction, index) =>
    only.has(directionKey(direction)) ? [index] : [],
  )
}

export const isUndercut = (feature: PartFeature): boolean =>
  feature.featureType.toLowerCase().includes('undercut')

/**
 * The faces that are undercuts or nothing.
 *
 * An undercut is not work to be swept into an arrangement because it happens to
 * be reachable — it wants a T-slot cutter or a lollipop, and a plan that fills
 * itself with them has promised a shop something no endmill will do. But some
 * faces have no other answer, and refusing those leaves a hole with no
 * explanation. So the rule is *only when it is the only option*.
 */
export const undercutOnly = (features: ReadonlyArray<PartFeature>): Set<number> => {
  const ordinary = new Set<number>()
  const seen = new Set<number>()

  for (const feature of features) {
    for (const idx of feature.regionIdxs) {
      seen.add(idx)
      if (!isUndercut(feature)) ordinary.add(idx)
    }
  }

  return new Set([...seen].filter((idx) => !ordinary.has(idx)))
}

/** Whether an undercut reading should be passed over: it is not the only answer. */
export const skipUndercut = (feature: PartFeature, onlyUndercut: ReadonlySet<number>): boolean =>
  isUndercut(feature) && !feature.regionIdxs.some((idx) => onlyUndercut.has(idx))

/** What the rules made of a reading, or `null` where none reached it. */
export const scoreIn = (
  feature: PartFeature,
  verdicts: Map<string, FeatureVerdict>,
): number | null => {
  const verdict = verdicts.get(feature.featureTag)
  return verdict ? scoreFeature(verdict) : null
}
