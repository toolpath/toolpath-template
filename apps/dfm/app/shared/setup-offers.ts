import type { Vec3 } from '@toolpath/api'

import type { PartFeature } from './contracts'
import { directionRows } from './direction-rows'
import { requiredDirections } from './reach'
import type { PartFaces } from './setups'

/**
 * What each candidate way up would be worth holding, before anything is chosen.
 *
 * **The question `from the rules` should have been asking all along.** Left to
 * itself it buys directions one at a time on an estimate of what each unlocks,
 * and `generate.ts` records what that costs: on a part that forces three ways up
 * and is fully cut by them, it reaches 95% across **five**, while pressing
 * *Required only* and then *Fill from current* does it in three at 100%.
 *
 * So this is that better sequence, made into one gesture: say which ways up you
 * will hold, and the rules decide what each one cuts. The buying loop is the
 * part that was wrong; the allocator was not.
 *
 * Every figure here is about the **candidate**, not about a plan — how much of
 * the part this direction can reach at all, whatever else is held. That is what
 * somebody choosing needs, and it does not change as they choose.
 */
export interface SetupOffer {
  readonly index: number
  readonly label: string
  /**
   * Whether the part **forces** it: something is reachable from here and
   * nowhere else, so a plan without it leaves that ground uncut.
   *
   * Not a recommendation — a fact about the geometry. These are pre-chosen and
   * can still be turned off, because a shop that would rather leave an undercut
   * to a second operation is allowed to say so.
   */
  readonly required: boolean
  /** Readings the Engine reported from this way up. */
  readonly features: number
  /** Faces those readings cover, de-duplicated. */
  readonly regions: number
  /** Their area as a share of the whole part, 0–1. */
  readonly share: number
}

export const setupOffers = (
  report: PartFaces & { features: ReadonlyArray<PartFeature> },
  directions: ReadonlyArray<Vec3>,
): Array<SetupOffer> => {
  const required = new Set(requiredDirections(directions, report.features))

  return (
    directionRows({
      regions: [...report.regions],
      candidateDirections: [...directions],
      features: [...report.features],
    })
      .map((row) => ({
        index: row.index,
        label: row.label,
        required: required.has(row.index),
        features: row.features,
        regions: row.regions,
        share: row.share,
      }))
      /*
       * Forced first, then by how much of the part each reaches.
       *
       * The order somebody decides in: the ways up that are not a choice, then
       * the ones that are, biggest first. Sorting purely by reach would bury a
       * required direction that only reaches an undercut, which is the one row
       * on the list that cannot be turned off without consequence.
       */
      .sort(
        (a, b) => Number(b.required) - Number(a.required) || b.share - a.share || a.index - b.index,
      )
  )
}

/**
 * What the chosen ways up leave uncut, as a share of the part.
 *
 * Shown while choosing rather than after mapping, because "you will not reach
 * 12% of this part" is a fact about the *choice* — and finding it out from a
 * coverage bar afterwards means undoing the decision to change it.
 *
 * Faces the Engine reported no reading for from any direction are not counted:
 * nothing can reach them, so no choice made here is responsible for them.
 */
export const missedBy = (
  report: PartFaces & { features: ReadonlyArray<PartFeature> },
  directions: ReadonlyArray<Vec3>,
  chosen: ReadonlyArray<number>,
): number => {
  const byIndex = new Map(directions.map((direction, index) => [index, direction]))
  const reachable = new Set<number>()
  const covered = new Set<number>()

  for (const feature of report.features) {
    const at = [...byIndex].find(
      ([, direction]) =>
        direction.x === feature.machiningDirection.x &&
        direction.y === feature.machiningDirection.y &&
        direction.z === feature.machiningDirection.z,
    )
    if (!at) continue

    for (const idx of feature.regionIdxs) {
      reachable.add(idx)
      if (chosen.includes(at[0])) covered.add(idx)
    }
  }

  const areaOf = new Map(report.regions.map((region) => [region.idx, region.area]))
  const total = [...reachable].reduce((sum, idx) => sum + (areaOf.get(idx) ?? 0), 0)
  if (total === 0) return 0

  const held = [...covered].reduce((sum, idx) => sum + (areaOf.get(idx) ?? 0), 0)
  return (total - held) / total
}
