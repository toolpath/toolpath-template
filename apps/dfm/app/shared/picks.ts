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

/**
 * Every reading owning **any** held face — the mapping page's rule.
 *
 * The opposite of {@link sharedReadings}, and the two are not interchangeable:
 *
 * - **Inspecting**, holding two faces asks "what is the one thing these are both
 *   part of" — two walls of a pocket resolve to the pocket. Narrowing is the
 *   whole point, and a reading covering only one of them is not an answer.
 * - **Mapping**, holding two faces asks "what work is here" — and the faces do
 *   not have to belong to one feature. A floor and a wall cut from the same way
 *   up are two readings to assign, not a failed intersection. Narrowing there
 *   would empty the list exactly when somebody is gathering work into it.
 *
 * Order: the faces in the order they were picked, and within each the order that
 * click ranked them, de-duplicated. So the newest face's best reading is never
 * buried under the first face's worst.
 */
export const gatheredReadings = (held: readonly PartPick[]): string[] => {
  const tags: string[] = []
  const seen = new Set<string>()

  for (const pick of held) {
    // `ranked` where the click supplied one, `owners` otherwise — `ranked` can
    // be narrowed by whatever direction was in force, and a face with nothing
    // reachable that way still has owners worth listing.
    for (const tag of pick.ranked.length > 0 ? pick.ranked : pick.owners) {
      if (seen.has(tag)) continue
      seen.add(tag)
      tags.push(tag)
    }
  }

  return tags
}

/**
 * The reading a right click means — read it, change nothing.
 *
 * Right is the **peek** gesture everywhere on the part, not just inside an
 * offer. Left does something (picks, paints, prunes, depending on the mode);
 * right only ever answers *"what is this"*. Having one button that never
 * changes anything is what makes a part safe to interrogate while half-way
 * through a decision.
 *
 * Which of a face's readings it means is decided by **what is already on
 * screen**, most specific first: a face in an open editor means that editor's
 * reading, a face in a standing offer means the offered one, a painted face
 * means the painted one.
 *
 * **The plan is not one of those lists**, though it was. Counting it made right
 * click open a datasheet on any mapped face — on a mostly mapped part, every
 * right click, including the ones that were only ever the start of a pan. A
 * list somebody put up is a question they are asking; the plan is just the
 * part.
 *
 * **A face in no list means nothing, and nothing happens.** Peeking is a
 * question about a list — *which of these is this face?* — so with no list there
 * is nothing to answer. The obvious fallback, opening the top-ranked reading,
 * is precisely the silent best guess §3.8 forbids: a face usually has several
 * readings, and picking one without being asked to is the app deciding which
 * question was meant. Left click is what asks that, and it answers with the
 * whole list rather than with a guess.
 */
export const peekTarget = (
  /** The face's readings, in the order this click ranked them. */
  ranked: readonly string[],
  /** Lists currently on screen, most specific first. */
  onScreen: ReadonlyArray<readonly string[]>,
): string | null => {
  for (const list of onScreen) {
    const found = ranked.find((tag) => list.includes(tag))
    if (found) return found
  }

  return null
}
