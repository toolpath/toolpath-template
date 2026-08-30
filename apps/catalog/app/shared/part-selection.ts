import type { PartFeature } from '@toolpath/part-contracts'
import { asNumber, facts } from '@toolpath/part-contracts/datasheet'
import { sameDirection } from '@toolpath/viewer'

/**
 * What the part shows, and when.
 *
 * - **Nothing said** — every way up the part has. They are half the question,
 *   and hiding them until the other half is answered leaves nothing to press.
 * - **An arrow pressed** — that one, whether or not it found a reading.
 *   Pressing an arrow is a statement about which way up, and leaving the other
 *   five on screen makes it look like nothing happened.
 * - **A reading on screen** — the way up *it* is cut from. One arrow among six
 *   is a pointer; six with one of them meaning something else is a legend
 *   nobody reads.
 */
export interface ArrowPlan {
  readonly visible: boolean
  /** `null` for every arrow, an index for the one being read. */
  readonly shown: number | null
  /**
   * The way up the part is *scoped* to, which is what hides the other arrows.
   *
   * Only ever an arrow somebody pressed. Drawing an arrow for the reading on
   * screen is a pointer; hiding the other five because of it would take the
   * choice away from somebody who has not made one.
   */
  readonly active: number | null
}

export const arrowsFor = (context: {
  /** A way up somebody pressed, which stands whether or not it read anything. */
  readonly activeDirection?: number | null
  /** The way up the reading on screen is cut from. */
  readonly focusedDirection?: number | null
}): ArrowPlan => {
  const pressed = context.activeDirection ?? -1
  if (pressed >= 0) {
    return { visible: true, shown: pressed, active: pressed }
  }

  const reading = context.focusedDirection ?? -1
  return reading >= 0
    ? { visible: true, shown: reading, active: null }
    : { visible: true, shown: null, active: null }
}

/**
 * The group being asked about: feature tags, in the order they were kept.
 *
 * Order matters only for reading — the fit treats the group as a set — but a
 * list that reorders itself as it grows is one nobody can keep their place in.
 */
export const keepFeature = (kept: ReadonlyArray<string>, featureTag: string): Array<string> =>
  kept.includes(featureTag) ? [...kept] : [...kept, featureTag]

export const dropFeature = (kept: ReadonlyArray<string>, featureTag: string): Array<string> =>
  kept.filter((each) => each !== featureTag)

export const toggleKept = (kept: ReadonlyArray<string>, featureTag: string): Array<string> =>
  kept.includes(featureTag) ? dropFeature(kept, featureTag) : keepFeature(kept, featureTag)

/** Keep everything offered, without disturbing what is already kept. */
export const keepAll = (
  kept: ReadonlyArray<string>,
  featureTags: ReadonlyArray<string>,
): Array<string> => {
  const next = [...kept]
  for (const tag of featureTags) {
    if (!next.includes(tag)) {
      next.push(tag)
    }
  }
  return next
}

export const dropAll = (
  kept: ReadonlyArray<string>,
  featureTags: ReadonlyArray<string>,
): Array<string> => {
  const dropping = new Set(featureTags)
  return kept.filter((each) => !dropping.has(each))
}

/** The kept tags as features, in the part's own order rather than the group's. */
export const keptFeatures = (
  features: ReadonlyArray<PartFeature>,
  kept: ReadonlyArray<string>,
): Array<PartFeature> => {
  const wanted = new Set(kept)
  return features.filter((feature) => wanted.has(feature.featureTag))
}

/**
 * What one press of Escape puts down.
 *
 * **Outward, one thing per press**, the DFM application's rule: the click is
 * the newest thing said and the kept list is the work, so undoing a click must
 * not cost the list somebody spent five clicks building.
 *
 * Pressing it until nothing happens always lands somewhere known: a part with
 * nothing being read and nothing kept.
 */
export type EscapeStep = 'kept' | 'selection' | null

export const escapeStep = ({
  reading,
  keptCount,
}: {
  /** A face is picked, or a reading is being read. */
  readonly reading: boolean
  readonly keptCount: number
}): EscapeStep => {
  if (reading) {
    return 'selection'
  }
  if (keptCount > 0) {
    return 'kept'
  }
  return null
}

/**
 * Everything the part lights up.
 *
 * The kept group and the reading being read are both the viewer's own
 * highlight, so they are gathered in one place — each was wired separately once
 * and one of them was simply never passed on.
 */
export const partHighlight = ({
  kept,
  focused,
}: {
  readonly kept: Iterable<string>
  readonly focused: string | null
}): Array<string> => {
  const tags = new Set(kept)
  if (focused) {
    tags.add(focused)
  }
  return [...tags]
}

/**
 * How much of the part a reading covers, in square millimetres.
 *
 * Walls and floors together, which is everything the datasheet states as area.
 * A reading with neither is zero rather than absent: it still sorts, just last.
 */
export const surfaceArea = (feature: PartFeature): number => {
  const sheet = feature.datasheet
  return (asNumber(sheet?.wallishArea) ?? 0) + (asNumber(sheet?.floorishArea) ?? 0)
}

/** The widest cutter the kernel says still reaches this reading's corners. */
const cutterFor = (feature: PartFeature): number | null => {
  const sheetFacts = facts(feature)
  const cd =
    sheetFacts?.kind === 'Chamfer'
      ? sheetFacts.three?.cd
      : sheetFacts && 'cd' in sheetFacts
        ? sheetFacts.cd
        : undefined
  const widest = asNumber(cd?.ignore.min)
  return widest !== null && widest > 0 ? widest : null
}

/** How far the reading goes down, where the datasheet states both ends. */
const depthOf = (feature: PartFeature): number | null => {
  const sheet = feature.datasheet
  const top = asNumber(sheet?.zMax)
  const bottom = asNumber(sheet?.zMin)
  return top !== null && bottom !== null && top > bottom ? top - bottom : null
}

/**
 * How useful a reading is for **choosing a tool**.
 *
 * A face resolves to five or six readings and one of them is what somebody
 * meant. This is not the DFM application's score — that is a weighted average
 * of its rules, and the rules engine is not here — it is the geometry a tool is
 * actually chosen against, which is the same question asked more cheaply:
 *
 * - **Size carries it.** The reading whose shape the clicked face is most of is
 *   nearly always the one somebody pointed at.
 * - **A stated cutter counts for half again.** A reading the kernel gives a
 *   cutter diameter for is one a tool can be chosen for at all; one without is
 *   a shape nobody can answer with a tool.
 * - **Deep and narrow sinks.** A reading ten times deeper than it is wide is
 *   the awkward reading of a face, not the ordinary one — and if it really is
 *   what somebody meant, it is one keypress down the list.
 *
 * Comparable only against readings of the same face, which is all it is used
 * for. The number is never shown.
 */
export const toolingScore = (feature: PartFeature): number => {
  const area = surfaceArea(feature)
  const cutter = cutterFor(feature)
  const depth = depthOf(feature)

  const answerable = cutter === null ? 1 : 1.5
  // Length over diameter, the ratio a shop reads reach in. Softened by the
  // `1 +` so a shallow reading is not divided by nearly nothing.
  const slenderness = cutter !== null && depth !== null ? 1 + depth / cutter / 10 : 1

  return (area * answerable) / slenderness
}

/**
 * Which of a face's readings to open.
 *
 * Only for a fresh pick — clicking the same face again walks its readings in
 * the order the click ranked them, and re-sorting under a walk would make the
 * second press land somewhere unpredictable.
 */
export const preferLargest =
  (features: ReadonlyArray<PartFeature>) =>
  (tags: ReadonlyArray<string>): string | null => {
    const byTag = new Map(features.map((feature) => [feature.featureTag, feature]))
    let best: string | null = null
    let highest = -1

    for (const tag of tags) {
      const feature = byTag.get(tag)
      if (!feature) {
        continue
      }
      const score = toolingScore(feature)
      // Strictly greater, so a tie keeps the click's own order rather than
      // reshuffling readings the kernel already ranked.
      if (score > highest) {
        highest = score
        best = tag
      }
    }

    return best ?? tags[0] ?? null
  }

/**
 * A face's readings, as the list draws them: the most useful first.
 *
 * The reading a click opens is the top of this order, so the list opens on it
 * rather than somewhere in its own middle. **Ordered once per click, not per
 * keypress** — a list that re-sorted as the focus moved would slide out from
 * under whoever was walking it.
 */
export const byLargest = (features: ReadonlyArray<PartFeature>): Array<PartFeature> =>
  // A stable sort, so readings of equal score keep the order the click ranked
  // them in rather than swapping about between renders.
  [...features].sort((a, b) => toolingScore(b) - toolingScore(a))
