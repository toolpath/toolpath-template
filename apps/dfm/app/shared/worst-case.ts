import type { PartFeature } from './contracts'
import { asNumber, directionKey, directionLabel, facts } from './report'

/**
 * One datasheet from several, taking the harder answer every time.
 *
 * A reading handed a face is cut by one tool, to one depth, in one pass — so the
 * numbers a shop chooses that tool with are not the numbers it was reported
 * with. They are the **worst** of it and whatever the added face brought: the
 * deepest bottom, the tightest corner, the smallest bore. Reporting the gentler
 * half is worse than no datasheet at all, because it reads like a measurement
 * rather than an average.
 *
 * Which way is "worse" is not the same for every field, and that is the whole
 * content of this file:
 *
 * | Field                     | Taken as | Because                                     |
 * | ------------------------- | -------- | ------------------------------------------- |
 * | `zMin`                    | lowest   | the tool has to reach the deepest floor      |
 * | `zMax`, `extendedZMax`    | highest  | and start from the highest top               |
 * | `wallishArea`, `floorish` | summed   | the work is the work; there is more of it    |
 * | `cd.ignore.min`           | smallest | the tightest corner governs what fits at all |
 * | `maxEndmill`, `maxDrill`  | smallest | same, per kind                               |
 * | `maxEntryCd`              | smallest | the narrowest opening decides what gets in   |
 * | `diameter`                | smallest | nothing wider than the smallest bore goes in |
 * | `filletRadius`            | smallest | the tightest fillet the one tool must leave  |
 *
 * The derived rows come out right on their own: reach is `top − zMin` over the
 * widest tool that fits, and with the highest top, the lowest floor and the
 * smallest tool, the L/D that falls out is the worst L/D. Nothing has to know
 * that here.
 *
 * A field **no source reports is not invented**, and one only some report is
 * taken from those that do — an absent measurement is a question the Engine did
 * not answer, and filling it in with zero would answer it wrongly.
 */
export const worstDatasheet = (
  parts: ReadonlyArray<PartFeature>,
): Record<string, unknown> | null => {
  const sheets = parts.map((part) => part.datasheet).filter((sheet) => sheet != null)
  if (sheets.length === 0) {
    return null
  }

  const worst = (
    key: string,
    pick: (a: number, b: number) => number,
    read: (part: PartFeature) => number | null,
  ): [string, number] | null => {
    const values = parts.map(read).filter((value): value is number => value !== null)
    if (values.length === 0) {
      return null
    }

    // `reduce(Math.min)` hands the callback four arguments, and the fourth is
    // the array — `Math.min(acc, value, index, [..])` is NaN, silently.
    return [key, values.reduce((a, b) => pick(a, b))]
  }

  const sheetValue = (key: string) => (part: PartFeature) =>
    asNumber((part.datasheet as Record<string, unknown> | null | undefined)?.[key])

  const rows = [
    worst('zMin', Math.min, sheetValue('zMin')),
    worst('zMax', Math.max, sheetValue('zMax')),
    worst('extendedZMax', Math.max, sheetValue('extendedZMax')),
    worst('extendedZMin', Math.min, sheetValue('extendedZMin')),
    worst('wallishArea', (a, b) => a + b, sheetValue('wallishArea')),
    worst('floorishArea', (a, b) => a + b, sheetValue('floorishArea')),
  ].filter((row): row is [string, number] => row !== null)

  return { ...Object.fromEntries(rows), [DERIVED]: true, facts: worstFacts(parts) }
}

/**
 * The flag that says a datasheet is **ours**, not the Engine's.
 *
 * Everything in this file produces numbers by arithmetic over readings the
 * Engine measured. They are the best answer available today and they are not a
 * measurement: nobody has looked at the geometry of the merged shape, and the
 * arithmetic is a set of defensible rules, not an analysis.
 *
 * It matters because a made feature is **meant to go back to the Engine**. When
 * it does, the answer that comes back replaces these numbers wholesale — and
 * until then, anything reading a datasheet has to be able to tell which kind it
 * is holding. One flag, checked in one place, rather than inferring it from
 * `madeHere` or from which fields happen to be present.
 */
export const DERIVED = 'derivedHere'

/** Whether these numbers are our arithmetic rather than the Engine's analysis. */
export const isDerived = (feature: PartFeature): boolean =>
  (feature.datasheet as Record<string, unknown> | null | undefined)?.[DERIVED] === true

/**
 * The Engine's answer, when it arrives, replacing ours.
 *
 * **The seam this file exists to leave open.** A feature drawn or merged here is
 * meant to be sent back for analysis, and what comes back is a real datasheet:
 * measured, not derived. This is where it lands.
 *
 * What survives the swap is the **construction record** — `madeHere` and
 * `addedFrom`. Those are not measurements and the Engine cannot
 * produce them: they say how this feature came to exist and which readings it
 * was assembled from, which is exactly the provenance a shop needs whether or
 * not the numbers have since been measured properly. What goes is `derivedHere`
 * and every field it was vouching for.
 *
 * Kept here, beside the arithmetic it retires, so the two cannot drift: whoever
 * adds the Engine call has one function to reach for and one flag to stop
 * seeing.
 */
export const withEngineDatasheet = (
  feature: PartFeature,
  measured: Record<string, unknown>,
): PartFeature => {
  const ours = (feature.datasheet ?? {}) as Record<string, unknown>
  const { [DERIVED]: gone, ...kept } = ours

  return {
    ...feature,
    datasheet: {
      ...measured,
      // Ours, and not the Engine's to overwrite: how this feature was made.
      ...(kept['madeHere'] === undefined ? {} : { madeHere: kept['madeHere'] }),
      ...(kept['addedFrom'] === undefined ? {} : { addedFrom: kept['addedFrom'] }),
    },
  } as unknown as PartFeature
}

/**
 * The `facts` block, which is where the tool-sizing numbers live.
 *
 * `kind` survives only where every source agrees. Two pockets merged are still
 * a pocket; a pocket merged with a hole is neither, and stamping one of the two
 * names on it would send somebody looking for a bore that is only half there.
 * `Other` is honest, and the reading carries its sources for the rest.
 */
const worstFacts = (parts: ReadonlyArray<PartFeature>): Record<string, unknown> => {
  const all = parts.map(facts).filter((sheet) => sheet != null)
  const kinds = new Set(all.map((sheet) => sheet.kind))

  const smallest = (read: (sheet: NonNullable<ReturnType<typeof facts>>) => number | null) => {
    const values = all.map(read).filter((value): value is number => value !== null && value > 0)
    if (values.length === 0) {
      return null
    }
    return Math.min(...values)
  }

  const cutter = smallest((sheet) => {
    if (sheet.kind === 'Chamfer') {
      return asNumber(sheet.three?.cd?.ignore?.min)
    }
    return 'cd' in sheet ? asNumber(sheet.cd?.ignore?.min) : null
  })
  const endmill = smallest((sheet) =>
    sheet.kind === 'Hole' ? asNumber(sheet.maxEndmillDiameter) : null,
  )
  const drill = smallest((sheet) =>
    sheet.kind === 'Hole' ? asNumber(sheet.maxDrillDiameter) : null,
  )
  const entry = smallest((sheet) => (sheet.kind === 'Tslot' ? asNumber(sheet.maxEntryCd) : null))
  const bore = smallest((sheet) => (sheet.kind === 'Hole' ? asNumber(sheet.diameter) : null))
  const fillet = smallest((sheet) =>
    'filletRadius' in sheet ? asNumber(sheet.filletRadius) : null,
  )

  return {
    kind: kinds.size === 1 ? [...kinds][0] : 'Other',
    ...(cutter === null ? {} : { cd: { ignore: { min: cutter } } }),
    ...(endmill === null ? {} : { maxEndmillDiameter: endmill }),
    ...(drill === null ? {} : { maxDrillDiameter: drill }),
    ...(entry === null ? {} : { maxEntryCd: entry }),
    ...(bore === null ? {} : { diameter: bore }),
    ...(fillet === null ? {} : { filletRadius: fillet }),
  }
}

/** Where a merged reading's numbers came from, for the panel to name them. */
export interface Source {
  readonly featureTag: string
  readonly featureType: string
  /** How the way up read, so a face folded in from elsewhere says so. */
  readonly from: string
  readonly faces: number
}

/**
 * A reading as the plan has it, rather than as the Engine reported it.
 *
 * A face handed to a reading (`Assignment.also`) is a face one tool now has to
 * reach, and the datasheet had no idea: it went on reporting the depth, the
 * corner and the area of the reading before the face was added, which is a
 * measurement of something nobody is going to cut.
 *
 * The added face's own numbers are not reported — the Engine measures readings,
 * not faces — so the nearest true thing is the reading it came from: the
 * smallest one covering that face **from the same way up**, which is the
 * operation that face would otherwise have been part of. Its numbers are folded
 * in as a worst case, exactly as a merge folds its sources.
 *
 * Smallest, because it is the most specific reading of that face and therefore
 * the least likely to drag in the measurements of a much larger operation that
 * merely happens to include it.
 *
 * Returns the reading untouched where nothing was added, so every caller can
 * ask without checking first.
 */
export const asPlanned = (
  report: { features: ReadonlyArray<PartFeature> },
  added: ReadonlyArray<number>,
  feature: PartFeature,
): PartFeature => {
  if (added.length === 0) {
    return feature
  }

  const here = directionKey(feature.machiningDirection)
  const folded: Array<PartFeature> = []
  const seen = new Set<string>()

  for (const idx of added) {
    const owner = report.features
      .filter(
        (other) =>
          other.featureTag !== feature.featureTag &&
          directionKey(other.machiningDirection) === here &&
          other.regionIdxs.includes(idx),
      )
      .sort((a, b) => a.regionIdxs.length - b.regionIdxs.length)[0]

    if (!owner || seen.has(owner.featureTag)) {
      continue
    }
    seen.add(owner.featureTag)
    folded.push(owner)
  }

  if (folded.length === 0) {
    return feature
  }

  return {
    ...feature,
    datasheet: {
      ...worstDatasheet([feature, ...folded]),
      // What it was before the plan changed it, so the panel can say so and the
      // raw record further down the same panel still reads as the Engine's.
      addedFrom: folded.map((part) => ({
        featureTag: part.featureTag,
        featureType: part.featureType,
        from: directionLabel(part.machiningDirection),
        faces: part.regionIdxs.length,
      })),
    },
  } as unknown as PartFeature
}

/** The readings whose measurements were folded in with an added face. */
export const addedFrom = (feature: PartFeature): ReadonlyArray<Source> => {
  const from = (feature.datasheet as Record<string, unknown> | null | undefined)?.addedFrom
  if (!Array.isArray(from)) {
    return []
  }

  return from.filter((entry): entry is Source => {
    if (entry === null || typeof entry !== 'object') {
      return false
    }
    const row = entry as Record<string, unknown>
    return typeof row.featureTag === 'string' && typeof row.featureType === 'string'
  })
}
