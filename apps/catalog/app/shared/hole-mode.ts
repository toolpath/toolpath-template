import type { PartFeature } from '@toolpath/part-contracts'
import type { CatalogTool } from '@toolpath/catalog-data'
import { asNumber, asRecord } from '@toolpath/part-contracts/datasheet'
import { makerOf, minorOf, type HoleMode, type ThreadSpec } from './threads'

/**
 * Holes, read as holes.
 *
 * A part's holes are the part of it a shop plans by size rather than by
 * feature: eight ⌀5 × 12 deep is one drill and one line on a bill, whatever
 * the kernel called each of them. This module is that reading — grouping,
 * standing a hole in at another diameter, and finding the tap for a thread —
 * kept pure so the mode above it is a layout rather than a calculation
 * (Paul, 2026-08-31).
 */

/** The bore, in millimetres, where the datasheet states one. */
export const holeDiameterOf = (feature: PartFeature): number | null =>
  asNumber(asRecord(feature.datasheet?.facts)?.diameter)

/** How deep it goes, in millimetres. */
export const holeDepthOf = (feature: PartFeature): number | null => {
  const sheet = feature.datasheet
  const zMin = asNumber(sheet?.zMin)
  const zMax = asNumber(sheet?.zMax)
  return zMin === null || zMax === null ? null : Math.round((zMax - zMin) * 1000) / 1000
}

/** Every feature the kernel reports as a hole of some kind. */
export const isHole = (feature: PartFeature): boolean =>
  feature.featureType.toLowerCase().includes('hole') && holeDiameterOf(feature) !== null

/** One size of hole, however many of them the part carries. */
export interface HoleGroup {
  /** Stable across renders: the diameter and depth it is grouped on. */
  readonly key: string
  readonly diameter: number
  readonly depth: number
  /** Every hole in it, in the order the report listed them. */
  readonly features: ReadonlyArray<PartFeature>
  /** Whether they all go through, which decides the drill's overcut. */
  readonly through: boolean
}

/** How close two holes have to be to be the same hole, in millimetres. */
const SAME = 0.01

const roundTo = (value: number) => Math.round(value / SAME) * SAME

/**
 * The part's holes, grouped by diameter and depth.
 *
 * Not by way up: a shop buys one drill for eight ⌀5 holes whichever face they
 * are cut from, and the ways up are a setup question rather than a tooling
 * one. Deepest first within a diameter, because the deepest is the one that
 * decides the drill.
 */
export const holeGroups = (features: ReadonlyArray<PartFeature>): Array<HoleGroup> => {
  const groups = new Map<string, HoleGroup & { features: Array<PartFeature> }>()
  for (const feature of features) {
    if (!isHole(feature)) {
      continue
    }
    const diameter = holeDiameterOf(feature)
    const depth = holeDepthOf(feature)
    if (diameter === null || depth === null) {
      continue
    }
    const key = `${String(roundTo(diameter))}×${String(roundTo(depth))}`
    const had = groups.get(key)
    if (had) {
      had.features.push(feature)
      groups.set(key, {
        ...had,
        through: had.through && feature.featureType.startsWith('Through'),
      })
      continue
    }
    groups.set(key, {
      key,
      diameter,
      depth,
      features: [feature],
      through: feature.featureType.startsWith('Through'),
    })
  }
  return [...groups.values()].sort((a, b) => a.diameter - b.diameter || b.depth - a.depth)
}

/**
 * The same hole, stood in at another diameter.
 *
 * A threaded hole is drilled at the tap drill, and the model may have been
 * drawn at the minor or the nominal size instead — so the drill is judged
 * against the hole the shop will actually make. Nothing else about the feature
 * changes, which is what keeps the depth, the way up and the reach curve the
 * ones the rules already read.
 */
export const holeAt = (feature: PartFeature, diameter: number): PartFeature => {
  const sheet = (feature.datasheet ?? {}) as Record<string, unknown>
  const facts = asRecord(sheet.facts) ?? {}
  return {
    ...feature,
    datasheet: { ...sheet, facts: { ...facts, diameter } },
  } as PartFeature
}

/** How far a tap's own diameter may be from the thread's, in millimetres. */
const TAP_WITHIN = 0.2

/**
 * The taps that cut this thread, closest first.
 *
 * **By size alone.** A tap's diameter is its nominal size and every vendor
 * states it; the *pitch* is in the catalog number and the family name, in a
 * different shape for every brand, and nothing in this dataset holds it as a
 * number. So an M8×1.25 and an M8×1 are both offered for an M8 thread and the
 * choice is the person's — which the panel says out loud rather than picking
 * one and being wrong half the time.
 */
export const tapsFor = (spec: ThreadSpec, tools: ReadonlyArray<CatalogTool>): Array<CatalogTool> =>
  tools
    .filter((tool) => tool.form.startsWith('tap'))
    .filter((tool) => {
      const size = tool.geometry.DC
      return size !== undefined && Math.abs(size - spec.major) <= TAP_WITHIN
    })
    .sort(
      (a, b) =>
        Math.abs((a.geometry.DC ?? 0) - spec.major) - Math.abs((b.geometry.DC ?? 0) - spec.major) ||
        a.catalogNumber.localeCompare(b.catalogNumber),
    )

/**
 * The thread mills that cut this thread, smallest first.
 *
 * A thread mill works from inside the hole, so what bounds it is the **minor**
 * diameter rather than the nominal one — the sheet's own rule, `diameter <=
 * hole diameter - thread mill margin`, read here for the tool half of hole
 * mode. Smallest first because the smaller mill reaches deeper before it fouls
 * the wall.
 */
export const threadMillsFor = (
  spec: ThreadSpec,
  tools: ReadonlyArray<CatalogTool>,
  /** How far under the minor a mill has to stay, as a share: the sheet's knob. */
  margin = 0.02,
): Array<CatalogTool> => {
  const room = minorOf(spec) * (1 - margin)
  return tools
    .filter((tool) => tool.form === 'thread mill')
    .filter((tool) => {
      const size = tool.geometry.DC
      return size !== undefined && size <= room
    })
    .sort((a, b) => (a.geometry.DC ?? 0) - (b.geometry.DC ?? 0))
}

/** How deep the thread goes, and how far under the part top it starts. */
export interface ThreadReach {
  /** The threaded depth, in millimetres. */
  readonly depth: number
  /** From the top of the part down to the bottom of it, in millimetres. */
  readonly below: number
  /**
   * Whether the tool's own body clears the part on the way down — the reach
   * curve, swept the same way a drill's is.
   *
   * **Given, this is the answer; `below` is only the stand-in for when there
   * is no curve to ask.** A hole at the bottom of an open pocket is half an
   * inch of fresh air above a quarter inch of hole, and a tap whose derived
   * length below the holder is shorter than that drop reaches it perfectly
   * well: what is beside the shank there is nothing (Paul, 2026-08-31, on
   * taps that "don't reach" a hole its own drill reaches).
   */
  readonly clears?: (tool: CatalogTool) => boolean
}

/**
 * Whether a threading tool reaches the bottom of the thread.
 *
 * **It was not being asked** (Paul, 2026-08-31: "are we checking to make sure
 * the taps can reach the feature?"). The drills go through the rules sheet,
 * which measures flutes against depth and the holder against the part; taps
 * did not, because the sheet's hole rules are written about a *bore* and a tap
 * is wider than the hole it threads — every one of them would be refused on
 * diameter before anything about reach was read.
 *
 * So the two questions the sheet would have asked are asked here directly:
 * the cutting length has to cover the thread, and the tool's own body has to
 * clear the part on the way down — swept against the reach curve where there
 * is one, which is the same question `clearance.ts` asks of a drill. Without a
 * curve it falls back to the derived length below the holder against the drop
 * from the part top, which is the conservative reading.
 *
 * A number the vendor never stated cannot refuse a tool, so an absent one
 * passes.
 */
export const reaches = (tool: CatalogTool, reach: ThreadReach | null): boolean => {
  if (reach === null) {
    return true
  }
  const cutting = tool.geometry.LCF
  if (cutting !== undefined && cutting < reach.depth) {
    return false
  }
  if (reach.clears) {
    return reach.clears(tool)
  }
  const below = tool.geometry.LBH
  return below === undefined || below >= reach.below
}

/** How far short of the bottom a threading tool falls, in millimetres. */
export const fallsShortBy = (tool: CatalogTool, reach: ThreadReach): number =>
  Math.max(
    0,
    tool.geometry.LCF === undefined ? 0 : reach.depth - tool.geometry.LCF,
    // Only where the drop is what was measured: a swept tool either clears or
    // does not, and there is no shortfall to sort by.
    reach.clears || tool.geometry.LBH === undefined ? 0 : reach.below - tool.geometry.LBH,
  )

/**
 * Which number keeps a threading tool off the list, and by how much.
 *
 * A section that says "none reach the bottom" and then lists tools with every
 * number in plain grey has told somebody nothing they can act on; the length
 * that falls short is the one to paint (Paul, 2026-08-31: "it should show some
 * length on the tap in red").
 *
 * `by` is null where the tool was swept against the reach curve rather than
 * measured: it fouls the part or it does not, and there is no shortfall.
 */
export const shortfallOf = (
  tool: CatalogTool,
  reach: ThreadReach | null,
): { readonly code: 'LCF' | 'LBH'; readonly by: number | null } | null => {
  if (reach === null || reaches(tool, reach)) {
    return null
  }
  const cutting = tool.geometry.LCF
  if (cutting !== undefined && cutting < reach.depth) {
    return { code: 'LCF', by: Math.round((reach.depth - cutting) * 1000) / 1000 }
  }
  if (reach.clears) {
    return { code: 'LBH', by: null }
  }
  const below = tool.geometry.LBH
  return below === undefined
    ? null
    : { code: 'LBH', by: Math.round((reach.below - below) * 1000) / 1000 }
}

/**
 * What makes the thread, for the mode it is made by.
 *
 * Those that reach the bottom, and — when **none** of them do — the nearest
 * misses instead, closest first, with `short` saying so. An empty section is a
 * true answer told uselessly: "these are the taps for this thread and here is
 * how far each falls short" is what somebody can act on (Paul, 2026-08-31).
 */
export const makersFor = (
  spec: ThreadSpec,
  mode: HoleMode,
  tools: ReadonlyArray<CatalogTool>,
  reach: ThreadReach | null = null,
): { readonly made: Array<CatalogTool>; readonly short: boolean } => {
  const maker = makerOf(mode)
  if (maker === null) {
    return { made: [], short: false }
  }
  const sized = maker === 'tap' ? tapsFor(spec, tools) : threadMillsFor(spec, tools)
  const reaching = sized.filter((tool) => reaches(tool, reach))
  if (reaching.length > 0 || reach === null || sized.length === 0) {
    return { made: reaching.length > 0 ? reaching : sized, short: false }
  }
  return {
    made: [...sized].sort((a, b) => fallsShortBy(a, reach) - fallsShortBy(b, reach)).slice(0, 8),
    short: true,
  }
}
