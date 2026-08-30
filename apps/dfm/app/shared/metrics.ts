import type { CdData, FeatureDatasheet, FeatureDatasheetFacts } from '@toolpath/api'
import type { PartFeature } from '@toolpath/part-contracts'

/**
 * A stable key for a machining direction, for grouping features cut the same
 * way up. Rounded, because two directions the Engine reports as the same way up
 * differ in the last bits of a float.
 */
const directionKey = ({ x, y, z }: { x: number; y: number; z: number }): string =>
  `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`

/** The travel a machine has, which the part has to fit inside. */
export interface MachineEnvelope {
  x: number
  y: number
  z: number
}

/**
 * The measurements a rule can read, taken from the Engine's report.
 *
 * The DFM prototype worked these out itself: it tessellated the STEP, built a
 * face graph, and derived reach, wall thickness and corner radii from the mesh.
 * None of that is here. The Engine has already done the recognition, so a
 * measurement is either something its datasheet states or something arithmetic
 * away from one — and where the Engine says nothing, the metric is `null` and
 * the rules that read it stand down rather than guessing.
 *
 * ## Showing the working
 *
 * Every metric reports **which datasheet fields it read and what they held**,
 * not just the number it arrived at. A verdict that says "milling L/D is 7.1"
 * cannot be checked; one that says "`zMax − zMin` 50.80 ÷ `facts.cd.
 * terminalCornerRadius` × 2 = 7.06" can be argued with, and argued with against
 * the raw report sitting in the same panel. That is what `Reading` carries.
 *
 * ## Units
 *
 * Lengths are millimetres and areas square millimetres, exactly as reported —
 * conversion happens at the edges, when a number is shown or typed.
 *
 * Angles are degrees, as the Engine API specifies.
 *
 * Ratios and flags are unitless.
 */

export type Quantity = 'angle' | 'area' | 'count' | 'length' | 'ratio'

/**
 * The prototype's vocabulary, kept name for name where the Engine can answer.
 *
 * A rule set written against the DFM app reads the same here, which is the
 * point: the thresholds a shop argued over are about `millingLD` and
 * `requiredCutter`, and renaming those would silently orphan every rule that
 * mentions them.
 */
export type MetricId =
  | 'chamferAngle'
  | 'cornerRadius'
  | 'minRadius'
  | 'cuspHeight'
  | 'depth'
  | 'depthBelowPartTop'
  | 'drillConeAngle'
  | 'drillingLD'
  | 'entryCutter'
  | 'filletHeight'
  | 'floorFilletRadius'
  | 'floorArea'
  | 'footprintAcross'
  | 'holeDiameter'
  | 'maxBottomDiameter'
  | 'maxDrillDiameter'
  | 'maxEndmillDiameter'
  | 'maxStepdown'
  | 'millingLD'
  | 'needsBallFinish'
  | 'needsSidemill'
  | 'openingWidth'
  | 'profileLength'
  | 'requiredCutter'
  | 'minCutterDiameter'
  | 'partOverMachine'
  | 'partLongestSide'
  | 'partShortestSide'
  | 'sharpCorners'
  | 'smallestCutter'
  | 'surfaceArea'
  | 'taperAngle'
  | 'tolerance'
  | 'undercutDepth'
  | 'wallArea'
  | 'wallHeightRatio'

/**
 * One field the Engine reported, and what it held.
 *
 * `path` is where it lives in the datasheet, written the way it would be read
 * out of the raw JSON in the panel below — `facts.cd.terminalCornerRadius`, not
 * "corner radius". `note` explains what the metric did with it where that is
 * not simply "read it".
 */
export interface Reading {
  path: string
  value: number | null
  note?: string | undefined
}

/**
 * What a metric needs to know about the part, beyond the one feature.
 *
 * Almost nothing does — a hole's diameter is a hole's diameter. Reach is the
 * exception: how far below the top of the part a tool has to go is a question
 * about the part, and the datasheet describes one feature at a time.
 */
export interface MetricContext {
  /** The machine the part has to fit, when the shop has said. */
  machine?: MachineEnvelope | undefined
  /** The top of the part **in this feature's own machining direction**. */
  partTopZ: number | null
  /**
   * How big the whole part is, longest side first.
   *
   * Off the mesh rather than the report: the Engine describes features, not
   * stock, and nothing in a datasheet says how large the thing is. A part that
   * does not fit the machine is not a feature's problem — but it is a fact
   * every feature on it shares, so it is carried here with the part's top.
   */
  partSides: ReadonlyArray<number> | null
}

export const NO_CONTEXT: MetricContext = { partTopZ: null, partSides: null }

/**
 * The top of the part, per machining direction.
 *
 * Per direction and not per part, which is the correction: `zMin` and `zMax`
 * are measured along the feature's own tool axis, so they are coordinates in
 * that direction's frame and comparing them across directions is comparing
 * different rulers.
 *
 * A real part made this obvious. Six directions, each with its own span:
 * features cut from `0,0,1` run from −23.95 to −1.48, while features from
 * `-0.994,0,-0.113` run from 45.38 to 156.55. Taking the highest number
 * anywhere — 156.55 — as "the top of the part" gave a feature in the first
 * group about 180 mm of reach, which is not a distance that exists.
 */
export interface PartContext {
  /** The machine the part has to fit, from the rule set. */
  machine?: MachineEnvelope | undefined
  topByDirection: Map<string, number>
  /** The part's own bounding box, longest side first, when the mesh is known. */
  sides: ReadonlyArray<number> | null
}

/**
 * The part's top in this feature's direction, as the Engine reports it.
 *
 * The Engine reports a feature's bounds but not a separate stock top. The
 * highest `extendedZMax` among features cut in the same direction is therefore
 * the top from which reach is measured.
 */
export const NO_PART: PartContext = {
  topByDirection: new Map(),
  sides: null,
}

/**
 * How high this feature reaches, for working out where the top of the part is.
 *
 * `extendedZMax` rather than `zMax`: the extended pair is the feature plus the
 * run-out a tool needs to clear it, which is where a cutter actually has to
 * start from. `zMax` stops at the material and makes every reach in the part
 * read short by the clearance.
 */
const zOf = (datasheet: FeatureDatasheet | null): number | undefined => datasheet?.extendedZMax

export const partContext = (
  features: ReadonlyArray<PartFeature>,
  /** The part's bounding box, in any order — sorted here. */
  boundingBox?: ReadonlyArray<number>,
  /** The machine the part has to fit, from the rule set. */
  machine?: MachineEnvelope,
): PartContext => {
  const topByDirection = new Map<string, number>()

  for (const feature of features) {
    const top = zOf(feature.datasheet ?? null)

    if (typeof top === 'number' && Number.isFinite(top)) {
      const key = directionKey(feature.machiningDirection)

      topByDirection.set(key, Math.max(topByDirection.get(key) ?? top, top))
    }
  }

  return {
    topByDirection,
    sides: boundingBox ? [...boundingBox].sort((a: number, b: number) => b - a) : null,
    ...(machine ? { machine } : {}),
  }
}

/** The part-level facts as they apply to one feature. */
export const contextFor = (feature: PartFeature, part: PartContext): MetricContext => ({
  partTopZ: part.topByDirection.get(directionKey(feature.machiningDirection)) ?? null,
  partSides: part.sides,
  ...(part.machine ? { machine: part.machine } : {}),
})

export interface MetricSpec {
  id: MetricId
  /** What a shop calls it. */
  label: string
  /**
   * The datasheet field it reads, written exactly as it appears there.
   *
   * Shown alongside the label wherever a metric is chosen, so a rule says which
   * number it is about rather than only what somebody decided to call it.
   * Absent where the metric is arithmetic over several fields, in which case
   * `formula` is the honest answer.
   */
  field?: string | undefined
  quantity: Quantity
  /** Where it comes from and what it means, in a sentence. */
  note: string
  /**
   * The arithmetic, where there is any.
   *
   * A function where the arithmetic itself depends on what was reported: the
   * cutter is twice a corner radius when there is one and a band reading when
   * there is not, and a fixed string saying "terminalCornerRadius × 2" over a
   * reading that came from `effectiveAdaptive.max` is the panel contradicting
   * itself in the same box.
   */
  formula?: string | ((datasheet: FeatureDatasheet, context: MetricContext) => string) | undefined
  /**
   * Whether this kernel reports what the metric needs at all.
   *
   * Two of the prototype's measurements — the narrow way across a cavity, and a
   * wall's height against its thickness — came from its own face graph and have
   * no equivalent in the Engine's datasheet. The rules that read them are kept,
   * because the rule set is a shop's document and deleting rows out of it is
   * not this app's call, but they are marked and shipped off.
   */
  unavailable?: boolean | undefined
  read: (datasheet: FeatureDatasheet, context: MetricContext) => number | null
  /** Exactly what was read to arrive at that number. */
  sources: (datasheet: FeatureDatasheet, context: MetricContext) => Array<Reading>
}

/* -------------------------------------------------------------------------- */
/* Reading the datasheet                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A number the Engine actually stated.
 *
 * Every datasheet field is optional and several are nullable, and the two mean
 * the same thing here: no measurement. `NaN` and infinities are treated the
 * same way — a rule cannot band a value that is not a number, and letting one
 * through would place a feature somewhere arbitrary rather than nowhere.
 */
const stated = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const flag = (value: boolean | undefined): number | null =>
  value === undefined ? null : value ? 1 : 0

/**
 * A quotient, where both sides are stated and the divisor is not zero.
 *
 * A zero divisor is the case worth naming: a cutter of zero diameter is no
 * cutter, and `depth / 0` is infinite rather than merely large. Reporting that
 * as "no measurement" is honest — the reach rule has nothing to say about a
 * feature no tool reaches, and the rule that catches it is the cutter rule.
 */
const ratio = (top: number | null, bottom: number | null): number | null =>
  top === null || bottom === null || bottom === 0 ? null : top / bottom

const factsOf = (datasheet: FeatureDatasheet): FeatureDatasheetFacts => datasheet.facts

/**
 * Where this feature's cutter-diameter facts live, and what they are.
 *
 * `cd` sits on eight of the ten `facts` variants directly, and a chamfer keeps
 * its own under the `Three` it nests — so the path is returned alongside the
 * values, because "which `cd`" is exactly the thing a reader needs to check.
 */
const cdAt = (datasheet: FeatureDatasheet): { cd: CdData | null; path: string } => {
  const facts = factsOf(datasheet)

  if (facts && 'cd' in facts && facts.cd) {
    return { cd: facts.cd, path: 'facts.cd' }
  }

  if (facts?.kind === 'Chamfer' && facts.three?.cd) {
    return { cd: facts.three.cd, path: 'facts.three.cd' }
  }

  return { cd: null, path: 'facts.cd' }
}

/**
 * Whether the Engine is describing a corner that is drawn sharp.
 *
 * Only what it says outright, via `hasSharpCorner`. An earlier version of this
 * also treated a `terminalCornerRadius` of zero as a sharp corner, which reads
 * the field backwards: on a flat-bottomed pocket the Engine reports
 * `terminalCornerRadius: 0` and `filletRadius: 0` to say **there is no blend**,
 * and a floor with no blend is one pass with a flat endmill — the easy case,
 * not an unmillable one. That inference put ordinary pockets in `no go`.
 */
export const sharpCorner = (datasheet: FeatureDatasheet): boolean | null =>
  nestedBoolean(datasheet, 'hasSharpCorner')

/**
 * The tool diameter the L/D ratios are taken against: `facts.cd.ignore.min`.
 *
 * The Engine reports three cutter-diameter bands — `ignore`, `deviate` and
 * `effectiveAdaptive` — each with a `min` and a `max`. `ignore.min` is the one:
 * it is the minimum radius the panel shows for that band, doubled.
 *
 * Confirmed against Fusion on two parts, which is worth writing down because
 * the temptation to "correct" it comes round often. A pocket whose corner
 * measures 3.302 mm reports `ignore.min` 6.616, and a pocket the Engine says
 * has no blend at all — `terminalCornerRadius` and `filletRadius` both zero —
 * reports 3.429 for a minimum radius of 1.71, which is also right. So half this
 * band is the answer whether or not a corner is what limits the tool, and
 * `terminalCornerRadius` is *not* the corner drawn on the part: on every part
 * looked at so far it reports exactly `filletRadius`, the floor blend.
 *
 * The others are fallbacks in name order, used only where `ignore.min` is
 * absent or reported as zero, and each reading says which answered. On the
 * mount sample `ignore.min` is stated on 44 features of 72.
 */
const cutterFromBand = (
  cd: CdData | null,
  path: string,
): { value: number; path: string } | null => {
  // In order of preference, `ignore.min` first.
  const bands: Array<[string, number | null | undefined]> = [
    ['ignore.min', cd?.ignore?.min],
    ['deviate.min', cd?.deviate?.min],
    ['effectiveAdaptive.min', cd?.effectiveAdaptive?.min],
    ['ignore.max', cd?.ignore?.max],
    ['deviate.max', cd?.deviate?.max],
    ['effectiveAdaptive.max', cd?.effectiveAdaptive?.max],
  ]

  for (const [name, raw] of bands) {
    const value = stated(raw)

    if (value !== null && value > 0) {
      return { path: `${path}.${name}`, value }
    }
  }

  return null
}

/**
 * The biggest cutter the corners allow: twice the tightest internal radius.
 *
 * The prototype's definition, kept exactly — "the corners decide the cutter" —
 * and the Engine states that radius directly as `terminalCornerRadius`, on 287
 * of the 305 features in the feature-rich capture. Reading
 * `cd.effectiveAdaptive.max` first, as this did originally, left the rule
 * silent on two thirds of the part: that band is reported on fewer than a
 * third of features.
 *
 * `terminalCornerRadius` is **not** a fallback for it, though it was one here
 * until three parts in a row proved otherwise. On every feature looked at so
 * far that field reports exactly `filletRadius` — the floor blend, not a corner
 * a cutter has to fit. Doubling it said a 0.01 in floor fillet demanded a 0.02
 * in cutter, which put a T-slot's milling L/D at 23:1 and a pocket's at
 * whatever its floor happened to be blended to.
 *
 * So where no band is reported the metric is `null` and the rules that read it
 * stand down. That is the same answer this file gives everywhere else the
 * Engine says nothing, and it costs coverage: a rule that cannot see a tool
 * says nothing rather than judging a feature on a number that was never about
 * tools. The alternative is a verdict nobody can defend, which is worse than a
 * gap somebody can see.
 */
const requiredCutter = (datasheet: FeatureDatasheet): number | null => {
  const { cd, path } = cdAt(datasheet)

  // The bands or nothing. There is no third thing here that says what fits.
  return cutterFromBand(cd, path)?.value ?? null
}

const requiredCutterSources = (datasheet: FeatureDatasheet): Array<Reading> => {
  const { cd, path } = cdAt(datasheet)
  const band = cutterFromBand(cd, path)

  if (band) {
    return [
      {
        path: band.path,
        value: band.value,
        note: band.path.endsWith('ignore.min')
          ? 'the tool this band leaves room for — the minimum radius, doubled'
          : stated(cd?.ignore?.min) === 0
            ? 'ignore.min is 0, which is no tool at all, so this band stands in'
            : 'ignore.min was not reported, so this band stands in',
      },
    ]
  }

  return [
    {
      path: `${path}.ignore.min`,
      value: null,
      note: 'no cutter band reported, so nothing here says what tool fits',
    },
  ]
}

/**
 * The top and bottom of the feature, in part space.
 *
 * `zMin` and `zMax` are Z coordinates in the feature's machining frame, not
 * depths. A depth is their difference.
 */
const zTop = (datasheet: FeatureDatasheet): number | null => stated(datasheet.zMax)

const zBottom = (datasheet: FeatureDatasheet): number | null => stated(datasheet.zMin)

const zPath = (_datasheet: FeatureDatasheet, end: 'max' | 'min'): string =>
  end === 'max' ? 'zMax' : 'zMin'

/**
 * How deep the feature is: the distance between its top and its bottom.
 *
 * Reading `zMax` alone would read a coordinate as a
 * measurement — on the part that exposed it, one wall's "depth" came out as
 * −1.48. Every reach ratio in the app is built on this number, so it was wrong
 * everywhere at once and quietly: a negative or tiny depth simply put features
 * in the easy band.
 */
const depthOf = (datasheet: FeatureDatasheet): number | null => {
  const top = zTop(datasheet)
  const bottom = zBottom(datasheet)

  if (top === null) {
    return null
  }

  // A report stating only one end is taken at its word rather than guessed at
  // from zero.
  return bottom === null ? top : top - bottom
}

/**
 * How far below the top of the part the tool has to reach.
 *
 * A different measurement from the feature's own depth, which is what this was
 * conflated with: a 5 mm floor at the bottom of a 100 mm cavity is 5 mm deep
 * and 100 mm of reach, and it is the reach that has the tool hanging out of the
 * holder and chattering.
 *
 * The part top is derived from the features rather than reported, so a part
 * with only one feature reaches exactly its own depth — which is true, and the
 * reading says where the number came from.
 */
const reachOf = (datasheet: FeatureDatasheet, context: MetricContext): number | null => {
  const bottom = zBottom(datasheet)

  if (bottom === null || context.partTopZ === null) {
    return null
  }

  return context.partTopZ - bottom
}

const reachSources = (datasheet: FeatureDatasheet, context: MetricContext): Array<Reading> => [
  {
    path: 'part top',
    value: context.partTopZ,
    note: 'derived: the highest extendedZMax reported by any feature cut from this same direction',
  },
  {
    path: zPath(datasheet, 'min'),
    value: zBottom(datasheet),
    note: 'subtracted: the tool has to get down to here',
  },
]

const depthSources = (datasheet: FeatureDatasheet): Array<Reading> => [
  { path: zPath(datasheet, 'max'), value: zTop(datasheet) },
  {
    path: zPath(datasheet, 'min'),
    value: zBottom(datasheet),
    note: 'subtracted: these are Z coordinates, so the depth is the difference',
  },
]

const holeDiameter = (datasheet: FeatureDatasheet): number | null => {
  const facts = factsOf(datasheet)

  return facts?.kind === 'Hole' ? stated(facts.diameter) : null
}

const holeDiameterSource = (datasheet: FeatureDatasheet): Reading => ({
  path: 'facts.diameter',
  value: holeDiameter(datasheet),
  ...(factsOf(datasheet)?.kind === 'Hole'
    ? {}
    : { note: 'not a hole, so there is no bore to read' }),
})

/** A fact that lives on the variant directly, or on a chamfer's nested Three. */
const nested = (
  datasheet: FeatureDatasheet,
  key: 'filletHeight' | 'filletRadius' | 'hasSharpCorner' | 'maxBottomDiameter',
): { value: unknown; path: string } => {
  const facts = factsOf(datasheet)

  const source = facts.kind === 'Chamfer' ? facts.three : facts
  const path = facts.kind === 'Chamfer' ? `facts.three.${key}` : `facts.${key}`

  if (!source) return { value: undefined, path }

  switch (key) {
    case 'filletHeight':
      return {
        value:
          source.kind === 'Boss' || source.kind === 'Hole' || source.kind === 'Pocket'
            ? source.filletHeight
            : undefined,
        path,
      }
    case 'filletRadius':
      return {
        value:
          source.kind === 'Boss' ||
          source.kind === 'Dovetail' ||
          source.kind === 'Hole' ||
          source.kind === 'Pocket' ||
          source.kind === 'Three'
            ? source.filletRadius
            : undefined,
        path,
      }
    case 'hasSharpCorner':
      return { value: source.kind === 'Three' ? source.hasSharpCorner : undefined, path }
    case 'maxBottomDiameter':
      return {
        value:
          source.kind === 'Boss' ||
          source.kind === 'Face' ||
          source.kind === 'Pocket' ||
          source.kind === 'Three'
            ? source.maxBottomDiameter
            : undefined,
        path,
      }
  }
}

type FactsKind = FeatureDatasheetFacts['kind']
type FactsByKind = { [K in FactsKind]: Extract<FeatureDatasheetFacts, { kind: K }> }

const isFactsKind = <K extends FactsKind>(
  facts: FeatureDatasheetFacts,
  kind: K,
): facts is FactsByKind[K] => facts.kind === kind

const nestedBoolean = (datasheet: FeatureDatasheet, key: 'hasSharpCorner'): boolean | null => {
  const found = nested(datasheet, key)

  return typeof found.value === 'boolean' ? found.value : null
}

const nestedNumber = (
  datasheet: FeatureDatasheet,
  key: 'filletHeight' | 'filletRadius' | 'maxBottomDiameter',
): number | null => {
  const found = nested(datasheet, key)

  return stated(typeof found.value === 'number' || found.value === null ? found.value : undefined)
}

/** How far off 180° a bottom can be and still be flat, in degrees. */
const FLAT_WITHIN = 0.5

/**
 * Whether an endmill is what makes this feature.
 *
 * Everything that is not a hole, plus the holes that are: a bore bottomed at
 * 180° has a flat bottom, and a flat bottom is not something a drill leaves —
 * it is milled or bored, and the milling reach is the ratio that describes it.
 * A hole bottomed by a point is drilled, and the drilling ratio answers for it
 * against the bore rather than against a cutter.
 *
 * A hole that reports no point angle is left to the drill: claiming it is
 * milled would be inventing the one fact this turns on.
 */
const milled = (datasheet: FeatureDatasheet): boolean => {
  if (factsOf(datasheet)?.kind !== 'Hole') return true

  const tip = kindNumber(datasheet, 'Hole', 'fullConeDeg')

  return tip !== null && Math.abs(tip - 180) <= FLAT_WITHIN
}

/** A fact only one `facts.kind` carries, read only from that kind. */
const onKind = <K extends FactsKind>(
  datasheet: FeatureDatasheet,
  kind: K,
  key: keyof FactsByKind[K],
): { value: unknown; path: string; wrongKind: boolean } => {
  const facts = factsOf(datasheet)

  return {
    value: isFactsKind(facts, kind) ? Reflect.get(facts, key) : undefined,
    path: `facts.${String(key)}`,
    wrongKind: !isFactsKind(facts, kind),
  }
}

const kindNumber = <K extends FactsKind>(
  datasheet: FeatureDatasheet,
  kind: K,
  key: keyof FactsByKind[K],
): number | null => {
  const found = onKind(datasheet, kind, key)

  return stated(typeof found.value === 'number' || found.value === null ? found.value : undefined)
}

const kindReading = <K extends FactsKind>(
  datasheet: FeatureDatasheet,
  kind: K,
  key: keyof FactsByKind[K],
): Reading => {
  const found = onKind(datasheet, kind, key)
  const raw = kindNumber(datasheet, kind, key)

  return {
    path: found.path,
    value: raw,
    ...(found.wrongKind ? { note: `only a ${kind} feature reports this` } : {}),
  }
}

const kindFlag = <K extends FactsKind>(
  datasheet: FeatureDatasheet,
  kind: K,
  key: keyof FactsByKind[K],
): number | null => {
  const found = onKind(datasheet, kind, key)

  return flag(typeof found.value === 'boolean' ? found.value : undefined)
}

/* -------------------------------------------------------------------------- */
/* The catalogue                                                              */
/* -------------------------------------------------------------------------- */

const NOT_REPORTED = 'The Engine does not report this at kernel 0.3.0.'

export const METRICS: ReadonlyArray<MetricSpec> = [
  {
    id: 'millingLD',
    label: 'Milling L/D',
    quantity: 'ratio',
    formula: (datasheet) => `part top − ${zPath(datasheet, 'min')} ÷ facts.cd.ignore.min`,
    note: 'Reach below the top of the part against the widest endmill the feature allows. Long and thin means chatter, and a tool hanging out of the holder.',
    read: (datasheet, context) =>
      milled(datasheet) ? ratio(reachOf(datasheet, context), requiredCutter(datasheet)) : null,
    sources: (datasheet, context) =>
      milled(datasheet)
        ? [...reachSources(datasheet, context), ...requiredCutterSources(datasheet)]
        : [
            {
              path: 'facts.fullConeDeg',
              value: kindNumber(datasheet, 'Hole', 'fullConeDeg'),
              note: 'a hole bottomed by a point is drilled, not milled — the drilling ratio answers for it',
            },
          ],
  },
  {
    id: 'drillingLD',
    label: 'Drilling L/D',
    quantity: 'ratio',
    formula: (datasheet) => `part top − ${zPath(datasheet, 'min')} ÷ facts.diameter`,
    note: 'Reach down to the bottom of the hole over its diameter. Past about 4:1 a standard drill wants pecking or a longer series.',
    // The hole cannot admit a drill wider than itself, so its own diameter is
    // the largest tool allowed.
    read: (datasheet, context) => ratio(reachOf(datasheet, context), holeDiameter(datasheet)),
    sources: (datasheet, context) => [
      ...reachSources(datasheet, context),
      holeDiameterSource(datasheet),
    ],
  },
  {
    id: 'requiredCutter',
    // Named for the field. "Required cutter" said nothing about which number it
    // was, and there are six candidates on a `cd`.
    label: 'Tool diameter',
    field: 'facts.cd.ignore.min',
    quantity: 'length',
    formula: (datasheet) => {
      const { cd, path } = cdAt(datasheet)
      const band = cutterFromBand(cd, path)

      return band ? band.path : `${path}.terminalCornerRadius × 2`
    },
    note: 'The tool diameter the feature leaves room for. Under the range it is fragile and slow, over it the machine is pushing a tool it was not built for.',
    read: requiredCutter,
    sources: requiredCutterSources,
  },
  {
    id: 'minRadius',
    label: 'Minimum radius',
    field: 'facts.cd.ignore.min',
    quantity: 'length',
    formula: (datasheet) => {
      const { cd, path } = cdAt(datasheet)
      const band = cutterFromBand(cd, path)

      return `${band ? band.path : `${path}.terminalCornerRadius × 2`} ÷ 2`
    },
    note: 'The tightest internal radius the feature leaves room for. The `cd` bands are cutter *diameters*, so this is half of one — a rule about radii has to be given a radius.',
    read: (datasheet) => {
      const cutter = requiredCutter(datasheet)

      return cutter === null ? null : cutter / 2
    },
    sources: requiredCutterSources,
  },
  {
    id: 'depth',
    label: 'Depth',
    quantity: 'length',
    formula: (datasheet) => `${zPath(datasheet, 'max')} − ${zPath(datasheet, 'min')}`,
    note: 'How far the feature runs along the tool axis, top to bottom.',
    read: depthOf,
    sources: depthSources,
  },
  {
    id: 'depthBelowPartTop',
    label: 'Reach below top of part',
    quantity: 'length',
    formula: (datasheet) => `part top − ${zPath(datasheet, 'min')}`,
    note: "How far below the top of the part the tool has to reach before it cuts anything. Not the feature's own depth: a shallow floor at the bottom of a deep cavity is a long tool.",
    read: (datasheet, context) => reachOf(datasheet, context),
    sources: (datasheet, context) => reachSources(datasheet, context),
  },
  {
    id: 'holeDiameter',
    label: 'Hole diameter',
    field: 'facts.diameter',
    quantity: 'length',
    note: "Below the smallest drill on the shelf, a hole is somebody's special order.",
    read: holeDiameter,
    sources: (datasheet) => [holeDiameterSource(datasheet)],
  },
  {
    id: 'floorFilletRadius',
    label: 'Floor fillet radius',
    field: 'facts.filletRadius',
    quantity: 'length',
    /*
     * A blend, or nothing at all.
     *
     * Zero is not a small radius — it is a flat floor meeting a wall square,
     * which a flat endmill cuts in one pass. Reading it as a radius put it up
     * against the list of bull nose sizes a shop grinds for, found it on none
     * of them, and called an ordinary pocket floor `rats`. There is no blend to
     * judge, so the metric says nothing and the rule stands down.
     */
    note: 'Radius where the wall meets the floor. A stock bull nose covers some radii; anything else is a ball endmill crawling over the floor. A flat floor has none.',
    read: (datasheet) => {
      const radius = nestedNumber(datasheet, 'filletRadius')

      return radius === null || radius === 0 ? null : radius
    },
    sources: (datasheet) => {
      const radius = nestedNumber(datasheet, 'filletRadius')

      return [
        {
          path: nested(datasheet, 'filletRadius').path,
          value: radius,
          ...(radius === 0 ? { note: 'no blend: a flat floor, cut with a flat endmill' } : {}),
        },
      ]
    },
  },
  {
    id: 'chamferAngle',
    label: 'Chamfer angle',
    field: 'facts.bevel.angleDeg',
    quantity: 'angle',
    formula: (datasheet) => {
      const facts = factsOf(datasheet)
      return facts.kind === 'Chamfer' ? 'facts.bevel.angleDeg' : 'facts.bevel.angleDeg'
    },
    note: 'A chamfer at an angle the shop already grinds for is one pass with a chamfer mill.',
    read: (datasheet) => {
      const facts = factsOf(datasheet)

      return facts.kind === 'Chamfer' ? stated(facts.bevel.angleDeg) : null
    },
    sources: (datasheet) => {
      const facts = factsOf(datasheet)

      if (facts.kind !== 'Chamfer') {
        return [
          {
            path: 'facts.bevel.angleDeg',
            value: null,
            note: 'only a chamfer, sink or slanted face reports a bevel',
          },
        ]
      }

      return [
        {
          path: 'facts.bevel.angleDeg',
          value: stated(facts.bevel.angleDeg),
        },
      ]
    },
  },
  {
    id: 'drillConeAngle',
    label: 'Drill point angle',
    field: 'facts.fullConeDeg',
    quantity: 'angle',
    formula: 'facts.fullConeDeg',
    note: 'A blind hole bottomed by a jobber or split point drill, rather than a flat needing a second tool.',
    read: (datasheet) => kindNumber(datasheet, 'Hole', 'fullConeDeg'),
    sources: (datasheet) => [kindReading(datasheet, 'Hole', 'fullConeDeg')],
  },
  {
    id: 'surfaceArea',
    label: 'Surface area',
    quantity: 'area',
    formula: 'wallishArea + floorishArea',
    note: 'How much surface there is to drive a tool over. For 3D surfacing this is most of what decides the time.',
    read: (datasheet) => {
      const wall = stated(datasheet.wallishArea)
      const floor = stated(datasheet.floorishArea)

      return wall === null && floor === null ? null : (wall ?? 0) + (floor ?? 0)
    },
    sources: (datasheet) => [
      { path: 'wallishArea', value: stated(datasheet.wallishArea) },
      { path: 'floorishArea', value: stated(datasheet.floorishArea) },
    ],
  },
  {
    id: 'partOverMachine',
    label: 'Past the machine',
    field: 'mesh bounding box vs the machine',
    quantity: 'length',
    note: 'How far the part exceeds the biggest one the shop can hold, side for side. Zero means it fits.',
    formula: "the part's sides against the machine's, largest against largest",
    /*
     * Compared side for side, largest against largest.
     *
     * The part can be turned in the vice, so what matters is whether its three
     * dimensions can be matched up with the machine's — not how it happened to
     * be drawn. The worst overhang of the three is the answer, because that is
     * the one that stops it going in.
     */
    read: (_datasheet, context) => {
      const machine = context.machine
      const sides = context.partSides

      if (!machine || !sides) {
        return null
      }

      const envelope = [machine.x, machine.y, machine.z].sort((a: number, b: number) => b - a)

      return sides.reduce((worst, side, at) => Math.max(worst, side - (envelope[at] ?? 0)), 0)
    },
    sources: (_datasheet, context) => [
      {
        path: 'mesh bounding box',
        value: context.partSides?.[0] ?? null,
        note: context.machine
          ? `against a machine of ${String(context.machine.x)} × ${String(context.machine.y)} × ${String(context.machine.z)} mm`
          : 'no machine size has been set, so nothing to compare against',
      },
    ],
  },
  {
    id: 'partLongestSide',
    label: 'Part, longest side',
    field: 'mesh bounding box',
    quantity: 'length',
    note: 'How big the part is at its longest. Off the mesh, not the datasheet — the Engine describes features, not stock.',
    formula: "the longest side of the part's bounding box",
    read: (_datasheet, context) => context.partSides?.[0] ?? null,
    sources: (_datasheet, context) => [
      {
        path: 'mesh bounding box',
        value: context.partSides?.[0] ?? null,
        note: "measured from the mesh, since no report field carries the part's size",
      },
    ],
  },
  {
    id: 'partShortestSide',
    label: 'Part, shortest side',
    field: 'mesh bounding box',
    quantity: 'length',
    note: 'How thin the part is. A long thin part is a workholding problem before it is a cutting one.',
    formula: "the shortest side of the part's bounding box",
    read: (_datasheet, context) => context.partSides?.at(-1) ?? null,
    sources: (_datasheet, context) => [
      {
        path: 'mesh bounding box',
        value: context.partSides?.at(-1) ?? null,
        note: 'measured from the mesh',
      },
    ],
  },
  {
    id: 'minCutterDiameter',
    label: 'Widest cutter that fits',
    field: 'facts.cd.ignore.min',
    quantity: 'length',
    note: 'The widest cutter this feature admits, exactly as the Engine reports it. Zero means nothing fits — a corner drawn sharp, most often.',
    formula: 'facts.cd.ignore.min',
    /*
     * The band as reported, zero and all.
     *
     * Every other metric reading `cd` treats zero as a missing number and falls
     * through to the next band, because a zero-width cutter cannot be divided
     * by. This one does not: zero is the Engine's way of saying the feature
     * admits no tool at all, and a rule testing `= 0` needs to see it.
     *
     * `null` where the band is absent entirely, which is a different statement
     * — nobody measured, rather than nothing fits.
     */
    read: (datasheet) => {
      const { cd } = cdAt(datasheet)

      return stated(cd?.ignore?.min)
    },
    sources: (datasheet) => {
      const { cd, path } = cdAt(datasheet)
      const min = cd?.ignore?.min

      return [
        {
          path: `${path}.ignore.min`,
          value: stated(min),
          note:
            min === 0
              ? 'zero — nothing fits in this feature as drawn'
              : 'the widest cutter this feature admits',
        },
      ]
    },
  },
  {
    id: 'sharpCorners',
    label: 'Sharp internal corners',
    field: 'facts.hasSharpCorner',
    quantity: 'count',
    note: 'A cutter is round, so a corner drawn sharp cannot be milled. It wants a radius, a broach or an EDM.',
    formula: 'facts.hasSharpCorner',
    read: (datasheet) => {
      const sharp = sharpCorner(datasheet)

      return sharp === null ? null : sharp ? 1 : 0
    },
    sources: (datasheet) => {
      const found = nested(datasheet, 'hasSharpCorner')

      return [
        {
          path: found.path,
          value: typeof found.value === 'boolean' ? (found.value ? 1 : 0) : null,
          note:
            typeof found.value === 'boolean'
              ? `reported as ${String(found.value)}`
              : 'only fillet and contour features report this',
        },
      ]
    },
  },
  {
    id: 'footprintAcross',
    label: 'Narrowest cut',
    quantity: 'length',
    unavailable: true,
    note: 'The narrow way across a cavity, which is what decides the smallest cutter that can get into it.',
    read: () => null,
    sources: () => [{ path: '—', value: null, note: NOT_REPORTED }],
  },
  {
    id: 'wallHeightRatio',
    label: 'Wall height / thickness',
    quantity: 'ratio',
    unavailable: true,
    note: 'How tall a wall stands for its thickness. Four to one is safe standing alone, ten to one when something braces it.',
    read: () => null,
    sources: () => [
      {
        path: '—',
        value: null,
        // Wall thickness needs the face on the other side of the wall, which
        // means geometry — and the datasheet is deliberately non-geometric.
        note: `${NOT_REPORTED} It needs the opposite face, and so needs geometry.`,
      },
    ],
  },

  /* Engine-only measurements, for rules a shop writes itself. --------------- */

  {
    id: 'cornerRadius',
    label: 'Corner radius',
    field: 'facts.cd.terminalCornerRadius',
    quantity: 'length',
    note: 'The tightest internal corner the Engine reports for this feature.',
    read: (datasheet) => stated(cdAt(datasheet).cd?.terminalCornerRadius),
    sources: (datasheet) => {
      const { cd, path } = cdAt(datasheet)

      return [
        {
          path: `${path}.terminalCornerRadius`,
          value: stated(cd?.terminalCornerRadius),
        },
      ]
    },
  },
  {
    id: 'smallestCutter',
    label: 'Smallest cutter',
    field: 'facts.cd.effectiveAdaptive.min',
    quantity: 'length',
    note: 'The smallest cutter the adaptive band allows here.',
    read: (datasheet) => stated(cdAt(datasheet).cd?.effectiveAdaptive?.min),
    sources: (datasheet) => {
      const { cd, path } = cdAt(datasheet)

      return [
        {
          path: `${path}.effectiveAdaptive.min`,
          value: stated(cd?.effectiveAdaptive?.min),
        },
      ]
    },
  },
  {
    id: 'tolerance',
    label: 'Tolerance',
    field: 'toleranceBand.atolMax',
    quantity: 'length',
    note: 'The tightest band the Engine derived for this feature. Tighter is a finishing pass, and a machine that holds it.',
    read: (datasheet) => stated(datasheet.toleranceBand?.atolMax),
    sources: (datasheet) => [
      {
        path: 'toleranceBand.atolMax',
        value: stated(datasheet.toleranceBand?.atolMax),
      },
    ],
  },
  {
    id: 'wallArea',
    label: 'Wall area',
    field: 'wallishArea',
    quantity: 'area',
    note: "Area of the feature's walls — what a side mill has to cover.",
    read: (datasheet) => stated(datasheet.wallishArea),
    sources: (datasheet) => [{ path: 'wallishArea', value: stated(datasheet.wallishArea) }],
  },
  {
    id: 'floorArea',
    label: 'Floor area',
    field: 'floorishArea',
    quantity: 'area',
    note: "Area of the feature's floors — what a facing or clearing pass has to cover.",
    read: (datasheet) => stated(datasheet.floorishArea),
    sources: (datasheet) => [{ path: 'floorishArea', value: stated(datasheet.floorishArea) }],
  },
  {
    id: 'filletHeight',
    label: 'Fillet height',
    field: 'facts.filletHeight',
    quantity: 'length',
    note: 'How far up the wall the fillet runs.',
    read: (datasheet) => nestedNumber(datasheet, 'filletHeight'),
    sources: (datasheet) => [
      {
        path: nested(datasheet, 'filletHeight').path,
        value: nestedNumber(datasheet, 'filletHeight'),
      },
    ],
  },
  {
    id: 'maxBottomDiameter',
    label: 'Largest bottom cutter',
    field: 'facts.maxBottomDiameter',
    quantity: 'length',
    note: 'The biggest tool that fits the floor, which is often smaller than the one that fits the walls.',
    read: (datasheet) => nestedNumber(datasheet, 'maxBottomDiameter'),
    sources: (datasheet) => [
      {
        path: nested(datasheet, 'maxBottomDiameter').path,
        value: nestedNumber(datasheet, 'maxBottomDiameter'),
      },
    ],
  },
  {
    id: 'maxDrillDiameter',
    label: 'Largest drill',
    field: 'facts.maxDrillDiameter',
    quantity: 'length',
    note: 'The biggest drill that fits the hole as reported.',
    read: (datasheet) => kindNumber(datasheet, 'Hole', 'maxDrillDiameter'),
    sources: (datasheet) => [kindReading(datasheet, 'Hole', 'maxDrillDiameter')],
  },
  {
    id: 'maxEndmillDiameter',
    label: 'Largest endmill',
    field: 'facts.maxEndmillDiameter',
    quantity: 'length',
    note: 'The biggest endmill that can bore the hole, where it has to be bored rather than drilled.',
    read: (datasheet) => kindNumber(datasheet, 'Hole', 'maxEndmillDiameter'),
    sources: (datasheet) => [kindReading(datasheet, 'Hole', 'maxEndmillDiameter')],
  },
  {
    id: 'maxStepdown',
    label: 'Max stepdown',
    field: 'facts.maxStepdown',
    quantity: 'length',
    note: 'How much the tool can take per pass on a surfaced feature. Small stepdowns are many passes.',
    read: (datasheet) => kindNumber(datasheet, 'Three', 'maxStepdown'),
    sources: (datasheet) => [kindReading(datasheet, 'Three', 'maxStepdown')],
  },
  {
    id: 'cuspHeight',
    label: 'Cusp height',
    field: 'facts.surfaceFinishCuspHeight',
    quantity: 'length',
    note: 'The scallop a surfacing pass leaves. Getting it lower means stepping over less, which means more time.',
    read: (datasheet) => kindNumber(datasheet, 'Three', 'surfaceFinishCuspHeight'),
    sources: (datasheet) => [kindReading(datasheet, 'Three', 'surfaceFinishCuspHeight')],
  },
  {
    id: 'profileLength',
    label: 'Profile length',
    field: 'facts.length',
    quantity: 'length',
    note: 'How far around the profile runs — the length of cut, not a size.',
    read: (datasheet) => kindNumber(datasheet, 'Profile', 'length'),
    sources: (datasheet) => [kindReading(datasheet, 'Profile', 'length')],
  },
  {
    id: 'undercutDepth',
    label: 'Undercut depth',
    field: 'facts.undercutDepth',
    quantity: 'length',
    note: 'How far a T-slot reaches back under the opening — cut by a tool that goes in sideways and cannot be backed out.',
    read: (datasheet) => kindNumber(datasheet, 'Tslot', 'undercutDepth'),
    sources: (datasheet) => [kindReading(datasheet, 'Tslot', 'undercutDepth')],
  },
  {
    id: 'entryCutter',
    label: 'Entry cutter',
    field: 'facts.maxEntryCd',
    quantity: 'length',
    note: "The biggest cutter that gets through a T-slot's opening.",
    read: (datasheet) => kindNumber(datasheet, 'Tslot', 'maxEntryCd'),
    sources: (datasheet) => [kindReading(datasheet, 'Tslot', 'maxEntryCd')],
  },
  {
    id: 'openingWidth',
    label: 'Opening width',
    field: 'facts.topOpeningWidth',
    quantity: 'length',
    note: 'The narrow way in to an undercut. Whatever cuts the inside has to pass through this.',
    read: (datasheet) => kindNumber(datasheet, 'Dovetail', 'topOpeningWidth'),
    sources: (datasheet) => [kindReading(datasheet, 'Dovetail', 'topOpeningWidth')],
  },
  {
    id: 'taperAngle',
    label: 'Taper angle',
    field: 'facts.taperDeg',
    quantity: 'angle',
    formula: 'facts.taperDeg',
    note: "The dovetail's taper, which has to match a cutter ground for it.",
    read: (datasheet) => kindNumber(datasheet, 'Dovetail', 'taperDeg'),
    sources: (datasheet) => [kindReading(datasheet, 'Dovetail', 'taperDeg')],
  },
  {
    id: 'needsBallFinish',
    label: 'Ball tool only',
    field: 'facts.useOnlyBallToolsForFinish',
    quantity: 'count',
    note: 'Only a ball tool will finish this, which is surfacing time rather than milling time.',
    read: (datasheet) => kindFlag(datasheet, 'Three', 'useOnlyBallToolsForFinish'),
    sources: (datasheet) => [
      {
        path: 'facts.useOnlyBallToolsForFinish',
        value: kindFlag(datasheet, 'Three', 'useOnlyBallToolsForFinish'),
      },
    ],
  },
  {
    id: 'needsSidemill',
    label: 'Needs side milling',
    field: 'facts.needsSidemill',
    quantity: 'count',
    note: 'The face cannot be reached straight down and has to be cut with the side of the tool.',
    read: (datasheet) => kindFlag(datasheet, 'Face', 'needsSidemill'),
    sources: (datasheet) => [
      {
        path: 'facts.needsSidemill',
        value: kindFlag(datasheet, 'Face', 'needsSidemill'),
      },
    ],
  },
]

export const METRIC_BY_ID: ReadonlyMap<MetricId, MetricSpec> = new Map(
  METRICS.map((metric) => [metric.id, metric]),
)

export const metricLabel = (id: MetricId): string => METRIC_BY_ID.get(id)?.label ?? id

export const metricQuantity = (id: MetricId | undefined): Quantity | null =>
  id === undefined ? null : (METRIC_BY_ID.get(id)?.quantity ?? null)

/**
 * The arithmetic a metric actually performed on this feature.
 *
 * Resolved per feature rather than read off the spec, because for some metrics
 * the arithmetic itself depends on what the Engine reported.
 */
export const metricFormula = (
  id: MetricId,
  feature: PartFeature,
  part?: PartContext,
): string | undefined => {
  const spec = METRIC_BY_ID.get(id)

  if (!spec?.formula || !feature.datasheet) {
    return undefined
  }

  return typeof spec.formula === 'string'
    ? spec.formula
    : spec.formula(feature.datasheet, contextFor(feature, part ?? partContext([feature])))
}

/** What a metric read off this feature, for showing the working. */
export const metricSources = (
  id: MetricId,
  feature: PartFeature,
  part?: PartContext,
): Array<Reading> => {
  const context = contextFor(feature, part ?? partContext([feature]))

  const spec = METRIC_BY_ID.get(id)

  if (!spec) {
    return []
  }

  const datasheet = feature.datasheet

  return datasheet
    ? spec.sources(datasheet, context)
    : [{ path: 'datasheet', value: null, note: 'this feature has none' }]
}

/** Every measurement a feature has, keyed by metric; absent ones are `null`. */
export type FeatureMetrics = Record<MetricId, number | null>

/**
 * A feature measured in no way at all.
 *
 * Written out rather than derived from `METRICS`, so the compiler checks that
 * the catalogue and the type still list the same measurements — a metric added
 * to one and not the other fails here rather than reading as `undefined` at the
 * far end of a rule.
 */
/**
 * Metrics that describe the **part**, not a feature.
 *
 * A rule reading one of these says the same thing about every feature on the
 * part, because the answer has nothing to do with any of them: whether the
 * thing fits the machine is not a property of a pocket. They are judged
 * part-wide and kept out of a feature's own panel, where they would be a line
 * repeated forty times that no feature can act on.
 */
export const PART_METRICS: ReadonlySet<MetricId> = new Set<MetricId>([
  'partOverMachine',
  'partLongestSide',
  'partShortestSide',
])

export const NO_METRICS: FeatureMetrics = {
  chamferAngle: null,
  cornerRadius: null,
  minRadius: null,
  cuspHeight: null,
  depth: null,
  depthBelowPartTop: null,
  drillConeAngle: null,
  drillingLD: null,
  entryCutter: null,
  filletHeight: null,
  floorArea: null,
  floorFilletRadius: null,
  footprintAcross: null,
  holeDiameter: null,
  maxBottomDiameter: null,
  maxDrillDiameter: null,
  maxEndmillDiameter: null,
  maxStepdown: null,
  millingLD: null,
  needsBallFinish: null,
  needsSidemill: null,
  openingWidth: null,
  profileLength: null,
  requiredCutter: null,
  minCutterDiameter: null,
  partOverMachine: null,
  partLongestSide: null,
  partShortestSide: null,
  sharpCorners: null,
  smallestCutter: null,
  surfaceArea: null,
  taperAngle: null,
  tolerance: null,
  undercutDepth: null,
  wallArea: null,
  wallHeightRatio: null,
}

/**
 * Reads every metric off one feature.
 *
 * All of them at once rather than on demand, because a rule set is re-run on
 * every threshold drag and the whole catalogue is a few dozen property reads —
 * cheaper to compute once per feature than to thread laziness through the
 * evaluator.
 */
export const readMetrics = (feature: PartFeature, part?: PartContext): FeatureMetrics => {
  const context = contextFor(feature, part ?? partContext([feature]))
  const datasheet = feature.datasheet

  if (!datasheet) {
    return { ...NO_METRICS }
  }

  const values: FeatureMetrics = { ...NO_METRICS }

  for (const metric of METRICS) {
    values[metric.id] = metric.read(datasheet, context)
  }

  return values
}
