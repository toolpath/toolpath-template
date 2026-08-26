import type { PartFeature } from './contracts'
import { directionKey, facts, kindOf } from './report'

/**
 * Holes that are the same hole.
 *
 * A part carries dozens of identical holes — eight on a bolt circle, six down a
 * rail — and the Engine reports each one separately, because each is its own
 * geometry. To a shop they are **one decision and one tool**: same diameter,
 * same depth, same way up, drilled in one operation. Listing them apart is
 * fifty rows of a list somebody has to read to discover they are all the same
 * row.
 *
 * So the three things that make two holes the same job:
 *
 * - **The way up.** A hole drilled from +Z and one from −Y are different jobs
 *   whatever their size — they are not even in the same setup.
 * - **The diameter.** The tool.
 * - **The depth.** A 6 mm hole 4 mm deep and one 40 mm deep are the same tool
 *   and very different cuts, and the second may not be drillable at all.
 *
 * Nothing else groups. A hole and a pocket that happen to share a diameter are
 * not one job, and two holes of the same size that different rules judged
 * differently still want reading separately.
 */
export interface HoleGroup {
  /** What every hole in the group has in common, for the row's own identity. */
  key: string
  /** The holes themselves, in the order they arrived. */
  holes: Array<PartFeature>
}

/** Rounded, because two holes a shop calls identical differ in the last bits. */
const number = (value: unknown): string =>
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(3) : '?'

const depthOf = (feature: PartFeature): number | null => {
  const sheet = feature.datasheet
  if (!sheet) return null
  const { zMin, zMax } = sheet as { zMin?: unknown; zMax?: unknown }
  if (typeof zMin !== 'number' || typeof zMax !== 'number') return null
  return zMax - zMin
}

/**
 * Whether this is a hole at all.
 *
 * The Engine's own family, not the feature type — `through_hole`, `blind_hole`
 * and the rest all answer `Hole`, and a spelling this app has not seen would
 * otherwise quietly stop grouping.
 */
export const isHole = (feature: PartFeature): boolean => kindOf(feature) === 'Hole'

const diameterOf = (feature: PartFeature): unknown =>
  (facts(feature) as Record<string, unknown> | null)?.['diameter']

/**
 * The tool a group is drilled with, in millimetres, or null if the Engine did
 * not report one.
 *
 * A row standing for sixteen holes says which sixteen by naming the drill: two
 * groups of the same type differ by nothing else a list can show.
 */
export const holeDiameter = (feature: PartFeature): number | null => {
  const value = diameterOf(feature)
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * The **tool**: one way up and one diameter.
 *
 * Depth is deliberately not in here — see `sameDepth`. A different diameter is a
 * different drill and is matched to a thousandth; a different way up is not even
 * the same setup.
 */
export const holeKey = (feature: PartFeature): string =>
  [directionKey(feature.machiningDirection), number(diameterOf(feature))].join('|')

/**
 * How far two depths may differ and still be the same hole.
 *
 * A twentieth, and a floor of a hundredth of a millimetre for shallow ones.
 * Depth is measured to where the hole meets the surface, so the same drill
 * through a curved or slanted face reports a different number every time —
 * observed at 1.036 against 1.052 on one part, which is the same hole by any
 * reading a shop would give it. Matching exactly split those in two.
 *
 * Loose enough to absorb that, tight enough to keep genuinely different cuts
 * apart: 3.688 and 4.958 are a third apart and stay two jobs.
 */
const SAME_DEPTH = 0.05
const DEPTH_FLOOR = 0.01

const sameDepth = (a: number, b: number): boolean =>
  Math.abs(a - b) <= Math.max(DEPTH_FLOOR, Math.max(Math.abs(a), Math.abs(b)) * SAME_DEPTH)

export const groupHoles = (features: ReadonlyArray<PartFeature>): Array<HoleGroup> => {
  const out: Array<HoleGroup> = []
  /** Groups still open for this tool, so a depth can join one of them. */
  const byTool = new Map<string, Array<{ group: HoleGroup; depth: number }>>()

  for (const feature of features) {
    const depth = isHole(feature) ? depthOf(feature) : null
    const key = isHole(feature) ? holeKey(feature) : null

    // Anything that is not a hole, and any hole the Engine could not measure,
    // comes through on its own — grouping on a missing number would put every
    // unmeasured hole in one heap.
    if (key === null || key.includes('?') || depth === null) {
      out.push({ key: feature.featureTag, holes: [feature] })
      continue
    }

    const open = byTool.get(key) ?? []
    const found = open.find((entry) => sameDepth(entry.depth, depth))

    if (found) {
      found.group.holes.push(feature)
      continue
    }

    const group: HoleGroup = { key: `${key}|${number(depth)}`, holes: [feature] }
    open.push({ group, depth })
    byTool.set(key, open)
    out.push(group)
  }

  return out
}

/**
 * Every hole on the part that is the same job as this one.
 *
 * The list a click produces holds the readings of **one face**, so a hole
 * arrives there alone however many identical ones the part has. That is the
 * moment the grouping is worth most: somebody clicking one of eight bolt-circle
 * holes means all eight, and finding the other seven by clicking each in turn is
 * the work the grouping exists to remove.
 *
 * Includes the hole itself, so the result is never empty and a caller can treat
 * one hole and eight the same way.
 */
export const sameHoles = (
  features: ReadonlyArray<PartFeature>,
  feature: PartFeature,
): Array<PartFeature> => {
  if (!isHole(feature)) return [feature]

  const key = holeKey(feature)
  const depth = depthOf(feature)
  // A hole the Engine could not measure is only ever itself — gathering on a
  // missing number would sweep every unmeasured hole on the part into one row.
  if (key.includes('?') || depth === null) return [feature]

  return features.filter((other) => {
    if (!isHole(other) || holeKey(other) !== key) return false
    const theirs = depthOf(other)
    return theirs !== null && sameDepth(depth, theirs)
  })
}

/**
 * The same readings, with every hole standing for its whole group **on the
 * part** rather than only for the ones beside it in the list.
 *
 * The difference from {@link groupHoles} is which question the list is
 * answering, and the two are not interchangeable:
 *
 * - A list of what a click found — the candidates — is asking *what is this*.
 *   A hole arrives there alone however many identical ones the part has, so
 *   grouping only within it would say "×1" about a row the part is lighting
 *   sixteen of. That is the one place the group is worth most.
 * - A list about a **set** — what a held way up cuts of the painted faces, or
 *   what nothing cuts at all — is asking about those readings and no others.
 *   Reaching across the part there would claim holes nobody painted, and put
 *   already-mapped holes in a list of unmapped ones. Those keep
 *   {@link groupHoles}.
 *
 * The reading the list supplied stays first, so a group opens onto the hole
 * that was clicked and then its siblings. Order is otherwise the part's.
 */
export const groupAcrossPart = (
  part: ReadonlyArray<PartFeature>,
  readings: ReadonlyArray<PartFeature>,
): Array<HoleGroup> => {
  const out: Array<HoleGroup> = []
  /** Holes already spoken for, so two candidates of one group make one row. */
  const placed = new Set<string>()

  for (const reading of readings) {
    if (placed.has(reading.featureTag)) continue

    const rest = sameHoles(part, reading).filter((hole) => hole.featureTag !== reading.featureTag)
    for (const hole of rest) placed.add(hole.featureTag)
    placed.add(reading.featureTag)

    // Keyed by the reading rather than by the tool: this is the row the
    // keyboard opens by name, and a tag is the one thing guaranteed unique.
    out.push({ key: reading.featureTag, holes: [reading, ...rest] })
  }

  return out
}
