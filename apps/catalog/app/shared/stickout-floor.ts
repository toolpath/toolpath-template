import {
  DEFAULT_STICKOUT_POLICY,
  type CatalogTool,
  type StickoutPolicy,
} from '@toolpath/catalog-data'

/**
 * The shortest a tool should ever be set up at: its flutes, plus a diameter.
 *
 * **Paul's rule (2026-09-07):** "the shortest length below holder depth you
 * should ever do is flute length + tool diameter. If the required length below
 * holder is less than that, we should just use flute length + tool diameter
 * instead."
 *
 * The flutes alone is what the arithmetic gives — the collet face sits at the
 * end of the cutting edge — and it is not a length anybody sets a tool up at.
 * It leaves the holder nose level with the top of the cut, so the first corner
 * the tool turns into puts the nut on the work. A diameter is the room a
 * machinist leaves for that, and it scales the way the problem does: a 20 mm
 * cutter needs more of it than a 3 mm one.
 *
 * A floor, never a target. Where a feature needs the tool further out than
 * this, it goes further out; this only stops a stack being set up shorter than
 * anybody would.
 *
 * Null-safe by omission: a tool that states no flute length has no known
 * stickout at all (`minStickout` answers `null` for it), and one that states no
 * diameter has nothing to add — in both cases the shop's own floor stands
 * alone rather than a floor invented from half a tool.
 */
export const leastStickout = (
  geometry: CatalogTool['geometry'],
  floor: number = DEFAULT_STICKOUT_POLICY.least,
): number => {
  const { LCF, DC } = geometry
  if (LCF === undefined || DC === undefined) {
    return floor
  }
  return Math.max(floor, LCF + DC)
}

/**
 * A shop's policy with this tool's own floor in it.
 *
 * `StickoutPolicy.least` is "the shortest stickout worth setting up, mm" and is
 * one figure for every tool, because a package cannot know which tool a caller
 * is about to ask about. This is where it becomes the tool's own — the sheet's
 * floor and the rule above it, whichever is longer.
 */
export const withLeastFor = (
  policy: StickoutPolicy,
  geometry: CatalogTool['geometry'],
): StickoutPolicy => ({ ...policy, least: leastStickout(geometry, policy.least) })

/**
 * A setup length raised to this tool's floor, and never past its ceiling.
 *
 * **The step must not round the floor away.** `setupStickout` applies the
 * policy's floor and then lands the answer on the shop's increment — and it
 * lands *downward*, so a floor of 19 mm on a 3 mm step came back as 18 and a
 * floor of 25 as 24. An increment is a convenience at the machine; the floor is
 * a rule, and a rule that the rounding can undo is not one.
 *
 * Paul's wording settles what to do about it: "we should **just use** flute
 * length + tool diameter" — the floor itself, not the next increment above it.
 *
 * The ceiling still wins. Where a tool cannot stand out that far and keep hold,
 * the honest answer is the furthest it can, not a length it has no shank for.
 */
export const atLeastFloor = (
  stickout: number | null,
  geometry: CatalogTool['geometry'],
  {
    floor = DEFAULT_STICKOUT_POLICY.least,
    ceiling = null,
  }: {
    readonly floor?: number
    readonly ceiling?: number | null
  } = {},
): number | null =>
  stickout === null
    ? null
    : Math.min(
        Math.max(stickout, leastStickout(geometry, floor)),
        ceiling ?? Number.POSITIVE_INFINITY,
      )
