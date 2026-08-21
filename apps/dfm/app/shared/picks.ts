import type { PartPick } from '@toolpath/viewer'

/**
 * Adds a face to the held set, or takes it off if it was already held.
 *
 * Keyed on the region rather than on the pick: the same face clicked twice is
 * the same face, whatever the ray happened to hit.
 */
export const holdFace = (held: readonly PartPick[], pick: PartPick): PartPick[] => {
  const without = held.filter((each) => each.region !== pick.region)
  return without.length === held.length ? [...held, pick] : without
}

/**
 * The readings that own every held face, in the order the last click ranked
 * them — so the most specific reading of the newest face still comes first.
 *
 * Empty is a real answer: two faces with nothing in common are two faces, and
 * saying so beats offering a reading that only covers one of them.
 */
export const sharedReadings = (held: readonly PartPick[]): string[] => {
  const newest = held.at(-1)
  if (!newest) return []

  // From `owners` rather than `ranked`, because `ranked` was already narrowed
  // by whatever direction was in force when the face was clicked — and these
  // faces outlive that direction. `ranked` still supplies the order.
  const order = new Map(newest.ranked.map((tag, at) => [tag, at]))
  return newest.owners
    .filter((tag) => held.every((pick) => pick.owners.includes(tag)))
    .sort(
      (a, b) =>
        (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER),
    )
}
