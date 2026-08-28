import type { Vec3 } from '@toolpath/api'

import type { PartFeature } from './contracts'
import { directionKey, directionLabel } from './report'

/**
 * Which way up would cut the faces somebody has painted.
 *
 * The panel under the toggle in `direction` mode. It answers "which way up cuts
 * this group", which is a different question from the candidate list's "what
 * owns this face" — and the reason the two modes exist.
 */
export interface DirectionOffer {
  index: number
  label: string
  /** Whole readings from this way up that would cover painted ground. */
  readings: Array<PartFeature>
  /** How many painted faces those readings reach. */
  covered: number
  /** Painted faces this way up cannot reach at all. */
  missed: number
}

/**
 * Offers for a painted set, best coverage first.
 *
 * Readings are taken **smallest first**. §8 of the parity plan: an offer built
 * largest-first hands somebody a profile covering eight faces that can only be
 * taken or left, where eight walls could have had one clicked off. Small
 * readings first leaves the most that can still be argued with.
 *
 * Whole readings only — a feature is one operation over the faces it covers, so
 * a reading is either in or out. That is also why a reading is skipped when it
 * overlaps one already taken: running both machines the shared face twice.
 */
export const offersFor = (
  directions: ReadonlyArray<Vec3>,
  features: ReadonlyArray<PartFeature>,
  painted: ReadonlySet<number>,
): Array<DirectionOffer> => {
  if (painted.size === 0) {
    return []
  }

  const offers = directions.map((direction, index) => {
    const key = directionKey(direction)
    const mine = features
      .filter(
        (feature) =>
          directionKey(feature.machiningDirection) === key &&
          feature.regionIdxs.some((idx) => painted.has(idx)),
      )
      .sort((a, b) => a.regionIdxs.length - b.regionIdxs.length)

    const taken = new Set<number>()
    const readings: Array<PartFeature> = []

    for (const feature of mine) {
      if (feature.regionIdxs.some((idx) => taken.has(idx))) {
        continue
      }
      for (const idx of feature.regionIdxs) {
        taken.add(idx)
      }
      readings.push(feature)
    }

    const covered = [...painted].filter((idx) => taken.has(idx)).length

    return {
      index,
      label: directionLabel(direction),
      readings,
      covered,
      missed: painted.size - covered,
    }
  })

  return offers
    .filter((offer) => offer.covered > 0)
    .sort((a, b) => b.covered - a.covered || a.readings.length - b.readings.length)
}

/**
 * Readings grouped by the way up they are read from.
 *
 * The candidate list answers "what owns this face", and the answer is usually
 * the same handful of shapes seen from three or four directions. Grouped, the
 * choice reads as what it is — *which way up*, then which reading — rather than
 * as a flat list of near-duplicates whose direction chip has to be compared row
 * by row.
 *
 * Group order follows the part's own direction list, so a way up sits in the
 * same place here as in the panel beside it. Order *within* a group is left
 * alone: it arrives ranked, and re-sorting would throw that away.
 */
export interface ReadingGroup {
  index: number
  label: string
  readings: Array<PartFeature>
}

export const byDirection = (
  directions: ReadonlyArray<Vec3>,
  features: ReadonlyArray<PartFeature>,
): Array<ReadingGroup> => {
  const groups = new Map<number, Array<PartFeature>>()

  for (const feature of features) {
    const index = directions.findIndex(
      (direction) => directionKey(direction) === directionKey(feature.machiningDirection),
    )
    if (index < 0) {
      continue
    }
    groups.set(index, [...(groups.get(index) ?? []), feature])
  }

  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, readings]) => ({
      index,
      label: directionLabel(directions[index]!),
      readings,
    }))
}
