import type { FeatureType } from '@toolpath/viewer'

import type { PartFeature } from '@toolpath/part-contracts'
import { readExpression } from './expression'
import {
  type FeatureMetrics,
  type MetricId,
  type PartContext,
  partContext,
  readMetrics,
} from './metrics'

/**
 * DFM rules: how hard a feature is to cut, judged against thresholds a shop
 * sets for itself.
 *
 * A rule reads one measurement and places it in a band. Nothing here knows
 * about tooling — a rule says a 9:1 pocket is a pain, not which endmill to
 * reach for — and nothing here touches geometry: a rule runs on the numbers
 * `readMetrics` took off the Engine's datasheet, so dragging a threshold
 * recolours the part without going near the report again.
 *
 * Ported from the DFM prototype, where the same rule shapes ran on measurements
 * the app worked out from the mesh itself. The shapes and the scoring are
 * unchanged; what a rule can read is not — see `metrics.ts`.
 */

/**
 * How hard, worst last.
 *
 * `no go` is a hard limit rather than another step on the scale: a rule can
 * leave it unset and simply keep scaling.
 */
/**
 * Whether two names mean one feature type.
 *
 * There are two vocabularies for the same thing and they meet here. A report's
 * `features[].featureType` reads `filleted_pocket`; the SDK's `FeatureType`
 * enum — which the shipped audiences are written in — reads `FilletedPocket`.
 * Compared literally they never match, and a rule aimed at 33 types judges
 * none of them while saying it applies to all of them, which is the worst way
 * to be wrong: the panel says the rule is in force and the feature says the
 * rule is about something else.
 *
 * So the comparison is on the letters, ignoring case and separators. It costs
 * a `toLowerCase` per rule per feature and it survives the kernel changing its
 * mind about spelling again.
 */
const sameType = (a: string, b: string): boolean => plainType(a) === plainType(b)

export const plainType = (type: string): string =>
  type.replaceAll('_', '').replaceAll('-', '').toLowerCase()

export const BANDS = ['easy', 'alright', 'meh', 'rats', 'no go'] as const

export type Band = (typeof BANDS)[number]

export const bandRank = (band: Band): number => BANDS.indexOf(band)

/**
 * What a shop calls each band.
 *
 * A shop grading work "fine / watch it / call me" is not using a different
 * scale, it is using different words for the same five steps. So the rank stays
 * the model — every comparison, sort and score below runs on `bandRank` — and
 * the name is a label over it.
 *
 * Two things follow, and they are the reason it is done this way:
 *
 * - **A rename is never a data migration.** What is stored is the id, so a set
 *   renamed today still reads a rule written yesterday.
 * - **A rename cannot re-band anything.** Nothing here compares by name, so
 *   changing what `rats` is called moves no feature between bands.
 */
export type BandNames = Record<Band, string>

/** The shipped vocabulary, which is also the ids. */
export const DEFAULT_BAND_NAMES: BandNames = {
  easy: 'easy',
  alright: 'alright',
  meh: 'meh',
  rats: 'rats',
  'no go': 'no go',
}

/**
 * What to call a band here, taking the most local name that exists.
 *
 * A rule may carry its own words where one rule really does deserve them; past
 * that it is the set's vocabulary, and past that the shipped one. A blank name
 * is not a name — an empty text field left behind in the editor should read as
 * the band it is, not as nothing.
 */
export const bandName = (
  band: Band,
  names?: Partial<BandNames> | undefined,
  ruleNames?: Partial<BandNames> | undefined,
): string => {
  const chosen = ruleNames?.[band]?.trim() || names?.[band]?.trim()

  return chosen || DEFAULT_BAND_NAMES[band]
}

/** The worst of several bands, which is what a feature's own band is. */
export const worstBand = (bands: ReadonlyArray<Band>): Band | null =>
  bands.length === 0
    ? null
    : bands.reduce((worst, band) => (bandRank(band) > bandRank(worst) ? band : worst))

/**
 * Which way the numbers get worse.
 *
 * A deep pocket relative to its cutter is harder as the ratio climbs; a hole
 * gets harder as its diameter falls, since there is a size below which no drill
 * is stocked. One scale would need every threshold written backwards for half
 * the rules, so the direction is stated instead.
 */
export type RuleDirection = 'higher is harder' | 'lower is harder'

interface RuleBase {
  id: string
  name: string
  /**
   * Which measurement a rule reads, where it reads one.
   *
   * Absent on a baseline rule: what kind of feature it is *is* the input, and
   * there is no number to place on a scale.
   */
  metric?: MetricId
  /** How much this rule counts towards the part's score. */
  weight: number
  enabled: boolean
  /**
   * Feature types this rule applies to; empty means all of them.
   *
   * The Engine's `featureType` is an open set — the kernel adds values — so an
   * unrecognised type here is normal rather than an error, and a rule naming a
   * type this kernel never emits simply never fires.
   */
  featureTypes: ReadonlyArray<FeatureType>
  /**
   * A sum over the measurements, where the rule is a shop's own.
   *
   * The shipped rules each read one number because each of them *is* one
   * number. A rule somebody writes is usually a ratio nobody precomputed —
   * depth over cutter, area over depth — and adding a metric to the app for
   * every idea is a release for every idea. Where this is set it is read
   * instead of `metric`.
   */
  expression?: string
  /** What the rule is for, in a sentence. */
  note: string
  /**
   * This rule's own words for the bands, where it wants them.
   *
   * Partial and rare: a rule that names one band and leaves the rest falls back
   * to the set's vocabulary for the others. See {@link bandName}.
   */
  bandNames?: Partial<BandNames>
}

/** A measurement placed on a sliding scale. */
export interface ThresholdRule extends RuleBase {
  type: 'threshold'
  metric: MetricId
  direction: RuleDirection
  /**
   * Where each band ends, in the same order as `BANDS`.
   *
   * Four numbers: the limits of easy, alright, meh and rats. Past the last one
   * a feature is `no go` when `noGo` is set, and stays at `rats` otherwise —
   * a refusal is optional, and without one the scale simply keeps going.
   */
  thresholds: [number, number, number, number]
  /**
   * Where the shop stops taking the work, if it does.
   *
   * Sits above the rats limit rather than replacing it: "rats up to 12" is what
   * a hard job looks like, and "no go past 15" is where it stops being a job at
   * all. Anything between the two is still rats — bad, but bought.
   */
  noGo?: number
}

/**
 * A measurement checked against a list of sizes the shop actually holds.
 *
 * Some things do not scale: a 45° chamfer is one pass with a chamfer mill and a
 * 43° chamfer is a surfacing job, however close the two numbers look. Same for
 * a floor radius — 3 mm is a stock bull nose, 2.8 mm is a ball endmill crawling
 * over the floor. These are yes/no against a list, not a slope.
 */
export interface MatchRule extends RuleBase {
  type: 'match'
  metric: MetricId
  /** The sizes the shop holds, in millimetres, or angles in degrees. */
  standards: Array<number>
  /** How far off a value can be and still count as one of them. */
  tolerance: number
  /** Where a match lands, and where anything else does. */
  matched: Band
  unmatched: Band
}

/**
 * A measurement wanted inside a range, where either side of it is worse.
 *
 * Tooling is the case this exists for: a shop runs a band of cutter sizes well.
 * Below it a tool is fragile and slow, and above it the machine has to push a
 * cutter it was not built for — so unlike every other rule here, this one gets
 * worse in both directions at once, and a single scale cannot say that.
 *
 * Each band is a span, written outwards: whichever is the innermost span
 * holding the value is the band. They are meant to nest, and a gap between two
 * of them simply falls to the next one out.
 */
export interface RangeRule extends RuleBase {
  type: 'range'
  metric: MetricId
  /** Easy, alright, meh and rats, each as `[from, to]`. */
  spans: [Span, Span, Span, Span]
  /** Whether falling outside every span is a refusal. */
  refuseOutside: boolean
}

export type Span = [number, number]

/**
 * A rule with nothing to tune: the thing either is or it is not.
 *
 * A corner drawn sharp is the case this exists for. There is no scale to argue
 * about — a cutter is round, so it cannot be milled as drawn — and dressing
 * that up as four thresholds all sitting at zero says a rule is adjustable when
 * it is not. On or off, and what it lands on when it fires.
 *
 * The Engine reports several of these as booleans, which `readMetrics` gives as
 * 1 and 0 so a flag rule has a number to test.
 */
export interface FlagRule extends RuleBase {
  type: 'flag'
  metric: MetricId
  /**
   * Where a feature lands when the flag catches it.
   *
   * A feature it does not catch is not scored by it at all — see
   * `evaluateRule`.
   */
  raises: Band
  /**
   * What the measurement is tested against, when the test is not "is it set".
   *
   * A flag began as a yes/no read off a boolean the Engine reports, and most
   * still are — `hasSharpCorner` is either true or it is not. But the same
   * shape answers a much wider question once it can compare: *this measurement
   * equals that*. A cutter diameter of exactly zero is the Engine saying
   * nothing fits in the feature, and writing that as four identical thresholds
   * would be a scale that does not vary.
   *
   * Omitted keeps the original meaning — fires when the measurement is
   * anything other than zero — so every flag written before this reads the
   * same.
   *
   * `against` may be a number or a piece of arithmetic over other
   * measurements, the same as {@link RuleBase.expression}: "floor radius = the
   * radius the corner needs" is a comparison between two of them.
   */
  op?: FlagTest
  against?: number | string
}

/** How a flag compares its measurement with what it is testing against. */
export const FLAG_TESTS = ['=', '≠', '<', '≤', '>', '≥'] as const

export type FlagTest = (typeof FLAG_TESTS)[number]

/**
 * Where a kind of feature starts before anything is measured.
 *
 * Some things are hard because of what they are, not because of a number.
 * Surfacing a contoured face is hours where milling is minutes at any size; a
 * T-slot needs a cutter that goes in sideways and cannot be backed out, so a
 * shallow one in soft aluminium is still a T-slot. Writing those as thresholds
 * means inventing a measurement that does not vary and setting every band of it
 * to the same number, which reads as a scale somebody forgot to fill in.
 *
 * So: a floor, per feature type. Every other rule still runs, and the feature
 * lands on the worst of them — a baseline of `rats` is a starting point that
 * nothing can talk it out of, not a ceiling.
 */
export interface BaselineRule extends RuleBase {
  type: 'baseline'
  /**
   * The band each feature type starts at.
   *
   * A type left out is not judged by this rule at all, which is different from
   * being judged easy: most types have nothing inherently wrong with them and
   * should be left to the measured rules.
   */
  bands: Partial<Record<FeatureType, Band>>
}

export type Rule = BaselineRule | FlagRule | MatchRule | RangeRule | ThresholdRule

/** The five shapes a rule can take, in the order the rules panel lists them. */
export const RULE_TYPES = ['threshold', 'range', 'match', 'flag', 'baseline'] as const

export type RuleType = (typeof RULE_TYPES)[number]

/**
 * The same rule, in a different shape.
 *
 * A shop that wants "corner radius" as a list of the tools it holds rather than
 * as a sliding scale is not writing a new rule — it is saying the same limit
 * differently, and the name, the weight, the types it applies to and the
 * measurement it reads all carry over. Only the shape's own settings are new,
 * and those start from whatever the old shape can offer: a threshold's four
 * limits seed a range's four spans, and so on.
 *
 * A baseline reads no measurement at all, so converting to one drops the metric
 * and converting away from one has to invent it — `requiredCutter` is the least
 * surprising thing to land on, and it is a dropdown away from whatever was
 * meant.
 */
export const asType = (rule: Rule, type: RuleType): Rule => {
  if (rule.type === type) {
    return rule
  }

  const { id, name, weight, enabled, featureTypes, note } = rule
  const base = { enabled, featureTypes, id, name, note, weight }
  const metric: MetricId = rule.type === 'baseline' ? 'requiredCutter' : rule.metric
  // Whatever numbers the old shape had, so a converted rule is not four zeroes:
  // a threshold's limits, a range's outer edges, a list's first sizes.
  const numbers: [number, number, number, number] =
    rule.type === 'threshold'
      ? rule.thresholds
      : rule.type === 'range'
        ? [rule.spans[0][1], rule.spans[1][1], rule.spans[2][1], rule.spans[3][1]]
        : rule.type === 'match'
          ? [
              rule.standards[0] ?? 1,
              rule.standards[1] ?? 2,
              rule.standards[2] ?? 3,
              rule.standards[3] ?? 4,
            ]
          : [1, 2, 3, 4]

  switch (type) {
    case 'threshold': {
      return {
        ...base,
        direction: 'higher is harder',
        metric,
        thresholds: numbers,
        type,
      }
    }
    case 'range': {
      return {
        ...base,
        metric,
        refuseOutside: false,
        // Nested outwards, which is what a range means: each band contains the
        // one inside it.
        spans: [
          [0, numbers[0]],
          [numbers[0], numbers[1]],
          [numbers[1], numbers[2]],
          [numbers[2], numbers[3]],
        ],
        type,
      }
    }
    case 'match': {
      return {
        ...base,
        matched: 'easy',
        metric,
        standards: rule.type === 'match' ? rule.standards : [...numbers],
        tolerance: rule.type === 'match' ? rule.tolerance : 0.01,
        type,
        unmatched: 'meh',
      }
    }
    case 'flag': {
      return { ...base, metric, raises: 'no go', type }
    }
    case 'baseline': {
      return { ...base, bands: {}, type }
    }
  }

  // `RuleType` is closed and every member returns above, so this is only here
  // to give the function a final statement — keeping the switch exhaustive,
  // which is what catches a sixth rule shape being added without a conversion.
  return rule
}

/**
 * What a plan is allowed to spend on orientations.
 *
 * Not a per-feature rule — it is about the arrangement as a whole, which is why
 * it sits beside the rules rather than among them. It travels with the preset
 * because "how readily this shop re-fixtures" belongs with its thresholds: a
 * shop with a pallet changer buys a setup far more cheaply than one with a vice.
 */
/**
 * The machine the part has to fit in, in millimetres.
 *
 * Three numbers rather than one, because a machine is three numbers: 30 × 16 ×
 * 20 is what a shop says, and "the longest side" throws away the fact that a
 * long thin part fits a machine a cube of the same length does not.
 *
 * Compared side for side, largest against largest: the part can be turned in
 * the vice, so what matters is whether its three dimensions can be matched up
 * with the machine's, not how it happened to be drawn.
 */
export interface MachineEnvelope {
  x: number
  y: number
  z: number
}

/** Whether the part's box fits, however it is turned. */
export const fitsMachine = (sides: ReadonlyArray<number>, machine: MachineEnvelope): boolean => {
  const part = [...sides].sort((a: number, b: number) => b - a)
  const envelope = [machine.x, machine.y, machine.z].sort((a: number, b: number) => b - a)

  return part.every((side, at) => side <= (envelope[at] ?? 0))
}

export interface PlanLimits {
  /**
   * How much a new way up has to improve the plan before it is worth buying,
   * as a share of the part's whole score-weighted area.
   *
   * Zero buys an orientation for any improvement at all; a tenth means "worth
   * at least a tenth of the part". The counterweight the arrangement never had.
   */
  newDirectionGain: number
  /** A hard ceiling on orientations, where a shop has one. */
  maxDirections?: number
  /**
   * The biggest part the shop can hold.
   *
   * Part-wide rather than per-feature: nothing about a pocket is wrong when the
   * part does not fit the machine.
   */
  machine?: MachineEnvelope
}

export const DEFAULT_PLAN_LIMITS: PlanLimits = {
  // Two percent: enough that a single small face cannot buy a re-fixture, low
  // enough that swapping four bad readings for one good one always clears it.
  newDirectionGain: 0.02,
}

export interface RuleSet {
  id: string
  /** A human-readable label for this preset. */
  name: string
  rules: Array<Rule>
  /**
   * What this preset calls the five bands, where it does not use the shipped
   * words. See {@link bandName}.
   */
  bandNames?: Partial<BandNames>
  /** Where the numbers came from, when they were read off somebody's page. */
  source?: string
  /** What the arrangement may spend on orientations. */
  plan?: PlanLimits
}

export interface BandRange {
  band: Band
  /** Inclusive lower bound, or null for "anything below". */
  from: number | null
  /** Inclusive upper bound, or null for "anything above". */
  to: number | null
  /** Whether a value in this range is possible at all under this rule. */
  reachable: boolean
}

/**
 * Where refusal actually starts.
 *
 * Never below the rats limit: a no go under it would leave values past every
 * band and refused at the same time, which is a rule half-edited rather than a
 * scale.
 */
/**
 * Where the scale stops being a scale.
 *
 * The fourth threshold is the rats limit, so it is where a refusal starts when
 * a rule does not name one of its own. It used to be ignored unless a refusal
 * sat below it, which left the box labelled "rats to" doing nothing at all and
 * the rats band running off to infinity past a number somebody had typed.
 *
 * An explicit refusal can only push that boundary further out, never pull it
 * in: "rats up to 12" is what a hard job looks like and "no go past 15" is
 * where it stops being a job, and anything between the two is still rats.
 */
export const hardStop = (rule: ThresholdRule): number | null =>
  rule.noGo === undefined
    ? null
    : rule.direction === 'higher is harder'
      ? Math.max(rule.noGo, rule.thresholds[3])
      : Math.min(rule.noGo, rule.thresholds[3])

/**
 * The interval each band covers, in the order the numbers run.
 *
 * Thresholds are stored as four limits, which is compact but says nothing about
 * what a band actually spans — 5 in the "meh" box means "up to 5", and where
 * that band starts depends on the box before it. Working the intervals out here
 * is what lets the panel show "3 – 5" instead of a bare number, and it is the
 * same derivation for a rule that gets harder downwards, just read the other
 * way.
 */
export const bandRanges = (rule: ThresholdRule): Array<BandRange> => {
  const [easy, alright, meh] = rule.thresholds
  const rising = rule.direction === 'higher is harder'
  const rats = rule.thresholds[3]
  const stop = hardStop(rule)
  const last: BandRange = {
    band: 'no go',
    from: rising ? (stop ?? rats) : null,
    to: rising ? null : (stop ?? rats),
    reachable: stop !== null,
  }

  const bounded = (band: Band, lower: number | null, upper: number | null): BandRange =>
    rising
      ? { band, from: lower, to: upper, reachable: true }
      : { band, from: upper, to: lower, reachable: true }

  return [
    bounded('easy', null, easy),
    bounded('alright', easy, alright),
    bounded('meh', alright, meh),
    // Rats runs from the meh limit to its own, and on to the refusal where
    // there is one: a shop that refuses past 15 still buys the work at 13.
    bounded('rats', meh, stop ?? rats),
    last,
  ]
}

/**
 * A range rule's scale, laid out low to high.
 *
 * Nine segments rather than five, because the bands come back down the other
 * side: refused, rats, meh, alright, the range the shop wants, and out again.
 * Read left to right it is the shape of the rule — worst at both ends, best in
 * the middle.
 */
export const rangeSpectrum = (rule: RangeRule): Array<BandRange> => {
  const [easy, alright, meh, rats] = rule.spans

  return [
    { band: 'no go', from: null, to: rats[0], reachable: rule.refuseOutside },
    { band: 'rats', from: rats[0], to: meh[0], reachable: true },
    { band: 'meh', from: meh[0], to: alright[0], reachable: true },
    { band: 'alright', from: alright[0], to: easy[0], reachable: true },
    { band: 'easy', from: easy[0], to: easy[1], reachable: true },
    { band: 'alright', from: easy[1], to: alright[1], reachable: true },
    { band: 'meh', from: alright[1], to: meh[1], reachable: true },
    { band: 'rats', from: meh[1], to: rats[1], reachable: true },
    { band: 'no go', from: rats[1], to: null, reachable: rule.refuseOutside },
  ]
}

/**
 * The number a rule reads off one feature.
 *
 * A shop's own arithmetic where there is any, and the named measurement
 * otherwise. Parsed on the spot: the sums are three or four tokens long, and a
 * rule that is being dragged is re-read a few hundred times, not a few hundred
 * thousand.
 */
export const readValue = (rule: Rule, metrics: FeatureMetrics): number | null => {
  if (rule.expression) {
    return readExpression(rule.expression)?.(metrics) ?? null
  }

  return rule.type === 'baseline' ? null : metrics[rule.metric]
}

/**
 * Where one measurement lands.
 *
 * `null` when the rule does not apply — the feature is the wrong type, or the
 * Engine reported no such measurement for it. Not applying is different from
 * passing, and is kept separate rather than being scored as easy. This matters
 * more here than it did in the prototype: the datasheet is sparse, and a rule
 * silently scoring every feature the Engine said nothing about would put the
 * whole part in `easy`.
 */
/**
 * Whether a flag's test is met.
 *
 * Without one, the original meaning: anything other than zero. A boolean the
 * Engine reports arrives here as 1 or 0, so "is it set" and "is it non-zero"
 * are the same question.
 */
export const flagCatches = (rule: FlagRule, value: number, metrics: FeatureMetrics): boolean => {
  if (rule.op === undefined || rule.against === undefined) {
    return value > 0
  }

  const against =
    typeof rule.against === 'number'
      ? rule.against
      : (readExpression(rule.against)?.(metrics) ?? null)

  if (against === null || !Number.isFinite(against)) {
    return false
  }

  const compare: Record<FlagTest, (a: number, b: number) => boolean> = {
    '=': (a, b) => a === b,
    '≠': (a, b) => a !== b,
    '<': (a, b) => a < b,
    '≤': (a, b) => a <= b,
    '>': (a, b) => a > b,
    '≥': (a, b) => a >= b,
  }

  return compare[rule.op](value, against)
}

export const evaluateRule = (
  rule: Rule,
  featureType: FeatureType,
  metrics: FeatureMetrics,
): Band | null => {
  if (!rule.enabled) {
    return null
  }

  if (
    rule.featureTypes.length > 0 &&
    !rule.featureTypes.some((each) => sameType(each, featureType))
  ) {
    return null
  }

  // What it is, before what it measures. Nothing to look up and nothing that
  // can be missing: a feature either is one of the types this rule has an
  // opinion about or it is not.
  if (rule.type === 'baseline') {
    return (
      rule.bands[featureType] ??
      Object.entries(rule.bands).find(([type]) => sameType(type, featureType))?.[1] ??
      null
    )
  }

  const value = readValue(rule, metrics)

  if (value === null || !Number.isFinite(value)) {
    return null
  }

  if (rule.type === 'flag') {
    /*
     * Silent when it finds nothing.
     *
     * A flag is not a scale, so "no sharp corner" is not a mark in a feature's
     * favour — it is the ordinary case, and scoring it as easy quietly lifted
     * every feature that simply had nothing wrong with it.
     */
    return flagCatches(rule, value, metrics) ? rule.raises : null
  }

  if (rule.type === 'range') {
    for (const [index, span] of rule.spans.entries()) {
      if (value >= span[0] && value <= span[1]) {
        return BANDS[index]!
      }
    }

    return rule.refuseOutside ? 'no go' : 'rats'
  }

  if (rule.type === 'match') {
    // An empty list would call everything non-standard, which is a rule that
    // has not been filled in rather than a verdict about the part.
    if (rule.standards.length === 0) {
      return null
    }

    return rule.standards.some((standard) => Math.abs(standard - value) <= rule.tolerance)
      ? rule.matched
      : rule.unmatched
  }

  const past = (limit: number): boolean =>
    rule.direction === 'higher is harder' ? value > limit : value < limit

  for (const [index, limit] of rule.thresholds.entries()) {
    if (!past(limit)) {
      return BANDS[index]!
    }
  }

  // Past every threshold. A no go value says where the shop stops; without one
  // the scale tops out at the worst band that is not a refusal, and between the
  // rats limit and the no go it is still rats.
  const stop = hardStop(rule)

  // Inclusive where lower is harder: a shop that stops at a thousandth means a
  // thousandth is already too tight, not that 0.0009 is.
  const refused =
    stop !== null && (rule.direction === 'higher is harder' ? value > stop : value <= stop)

  return refused ? 'no go' : 'rats'
}

/**
 * Why a rule said nothing about a feature.
 *
 * Not applying is four different situations, and they are worth telling apart:
 * a rule somebody switched off is a decision, a rule aimed at other feature
 * types is a rule doing its job, and a rule whose measurement the Engine never
 * reported is a gap in the data. Only the last is a surprise, and it is the one
 * that used to be invisible.
 */
export type Silence = 'no measurement' | 'other feature types' | 'switched off' | 'nothing to flag'

export interface RuleReading {
  rule: Rule
  /** Where it landed, or null where it said nothing. */
  band: Band | null
  /** What it read, whether or not it had anything to say about it. */
  value: number | null
  /** Why it said nothing, when it said nothing. */
  silence?: Silence | undefined
}

/**
 * Every rule against one feature, including the ones that stood down.
 *
 * The verdict lists what spoke; this lists what was asked. A shop looking at a
 * feature that scored well wants to know whether the rules it cares about
 * agreed or simply never ran, and those read identically until the difference
 * is shown.
 */
export const readEveryRule = (
  rules: ReadonlyArray<Rule>,
  featureType: FeatureType,
  metrics: FeatureMetrics,
): Array<RuleReading> =>
  rules.map((rule) => {
    const value = readValue(rule, metrics)
    const band = evaluateRule(rule, featureType, metrics)

    if (band) {
      return { rule, band, value }
    }

    if (!rule.enabled) {
      return { rule, band: null, value, silence: 'switched off' }
    }

    if (rule.featureTypes.length > 0 && !rule.featureTypes.includes(featureType)) {
      return { rule, band: null, value, silence: 'other feature types' }
    }

    /*
     * A flag that looked and found nothing — the ordinary case rather than a
     * gap, since "no sharp corner" is not a measurement the Engine failed to
     * report.
     *
     * With a test of its own that means the comparison was not met; without
     * one it means the measurement was zero, which is the boolean case saying
     * no. Either way the flag needs a number to have looked at, so a missing
     * measurement falls through to the line below.
     */
    if (rule.type === 'flag' && value !== null && !flagCatches(rule, value, metrics)) {
      return { rule, band: null, value, silence: 'nothing to flag' }
    }

    return { rule, band: null, value, silence: 'no measurement' }
  })

export interface RuleResult {
  rule: Rule
  band: Band
  /** The number behind the verdict, or null for a baseline. */
  value: number | null
}

export interface FeatureVerdict {
  tag: string
  featureType: FeatureType
  /** The worst band any rule put this feature in, or null if none applied. */
  band: Band | null
  /** Every rule that had something to say, worst first. */
  results: Array<RuleResult>
  metrics: FeatureMetrics
}

export const evaluateFeature = (
  rules: ReadonlyArray<Rule>,
  feature: PartFeature,
  part?: PartContext,
): FeatureVerdict => {
  const metrics = readMetrics(feature, part)
  const results: Array<RuleResult> = []

  for (const rule of rules) {
    const band = evaluateRule(rule, feature.featureType, metrics)

    if (band) {
      results.push({
        rule,
        band,
        // A baseline has no measurement behind it — the type is the input — and
        // shows as the band alone wherever results are listed.
        value: readValue(rule, metrics),
      })
    }
  }

  results.sort((a, b) => bandRank(b.band) - bandRank(a.band) || b.rule.weight - a.rule.weight)

  return {
    tag: feature.featureTag,
    featureType: feature.featureType,
    band: worstBand(results.map((result) => result.band)),
    results,
    metrics,
  }
}

/**
 * The same reading for a rule that is worse in both directions.
 *
 * Measured outwards from the middle of the range the shop wants, along the
 * spectrum the rule already lays out: a cutter a whisker under the easy span
 * scores nearly what the easy span scores, and one at the far edge of `meh`
 * scores nearly what `rats` does — which is the point of reading inside a band
 * at all.
 */
const rangePosition = (rule: RangeRule, band: Band, value: number): number => {
  const spectrum = rangeSpectrum(rule)
  const middle = spectrum.findIndex((segment) => segment.band === 'easy')

  for (const [index, segment] of spectrum.entries()) {
    const { from, to } = segment
    const holds = (from === null || value >= from) && (to === null || value <= to)

    // Bands touch, so a value sitting exactly on a limit is inside two of them.
    // The caller has already decided which band this is; the segment to read is
    // the one that agrees with it.
    if (!holds || segment.band !== band) {
      continue
    }

    // Past the last span in either direction there is nowhere further to go.
    if (from === null || to === null || to === from) {
      return segment.band === 'no go' ? 1 : 0
    }

    const at = (value - from) / (to - from)

    if (index === middle) {
      // The wanted range is worst at its edges and best in its middle, which is
      // the one segment where both ends are the good direction.
      return Math.min(1, Math.abs(at - 0.5) * 2)
    }

    // Below the wanted range the low end is the bad one; above it, the high.
    return Math.min(1, Math.max(0, index < middle ? 1 - at : at))
  }

  return 1
}

/**
 * How far through its band a measurement sits, 0 at the good end and 1 at the
 * bad one.
 *
 * Bands are five decisions a shop made, and the colours stay five — but a score
 * built from bands alone cannot tell 0.4 from 1.1 on a rule whose easy band runs
 * to 3. Two readings of the same T-slot, one needing nearly three times the
 * reach of the other, both came back "rats · scores 64", and there was no way to
 * prefer the shallower one because nothing in the number knew they differed.
 *
 * So the band still says how hard, and this says whereabouts — which makes the
 * score a continuous measure without inventing a sixth colour. A value at the
 * very top of `easy` scores exactly what one at the bottom of `alright` scores,
 * so the scale runs smoothly across the whole range rather than in five steps.
 *
 * Not flags, matches or baselines. A flag has nothing between on and off, a
 * baseline reads no measurement at all, and a match either is a stocked size or
 * is not — for those the band is the whole answer.
 */
export const bandPosition = (rule: Rule, band: Band, value: number | null): number => {
  if (value === null) {
    return 0
  }

  if (rule.type === 'range') {
    return rangePosition(rule, band, value)
  }

  if (rule.type !== 'threshold') {
    return 0
  }

  const span = bandRanges(rule).find((entry) => entry.band === band)

  if (!span) {
    return 0
  }

  const rising = rule.direction === 'higher is harder'
  // The open end of the scale: the good side runs to zero, because every
  // measurement a rule reads — a length, a ratio, a count — bottoms out there.
  // The bad side runs off to infinity, and something already past the last
  // threshold cannot get any worse in band terms, so it sits at the far end.
  const from = span.from ?? (rising ? 0 : null)
  const to = span.to ?? (rising ? null : 0)

  if (from === null || to === null || to === from) {
    return span.band === 'no go' ? 1 : 0
  }

  const at = (value - from) / (to - from)

  return Math.min(1, Math.max(0, rising ? at : 1 - at))
}

/**
 * What one rule's verdict is worth, 0 to 1.
 *
 * The band decides which fifth of the scale, and where the measurement sits
 * inside its band decides where in that fifth — so a rule is a smooth reading
 * rather than one of five values.
 */
const ruleScore = (result: RuleResult): number => {
  const step =
    (bandRank(result.band) + bandPosition(result.rule, result.band, result.value)) /
    (BANDS.length - 1)

  // Clamped, because the worst band has nothing below it. A refusal is the
  // floor of the scale, and its interior position would otherwise carry a
  // feature past it to −0.25 — dragging a part's average under the range this
  // number is documented to have, and making "worse than the worst" a thing a
  // rule can say.
  return Math.min(1, Math.max(0, 1 - step))
}

/**
 * How one feature scores, 0 to 1, by the same weighting the part uses.
 *
 * `null` when no rule applied to it: a feature nothing measured has no score,
 * which is a different statement from full marks. The band says how hard the
 * worst of it is; the score says how it did across everything that looked at
 * it, so a feature failing one rule of five reads differently from one failing
 * all five.
 */
export const scoreFeature = (verdict: FeatureVerdict): number | null => {
  if (verdict.results.length === 0) {
    return null
  }

  let weighted = 0
  let weight = 0

  for (const result of verdict.results) {
    weighted += ruleScore(result) * result.rule.weight
    weight += result.rule.weight
  }

  return weight === 0 ? 1 : weighted / weight
}

export interface PartScore {
  /** 0 to 1, where 1 is every rule sitting in `easy`. */
  score: number
  /** How many features landed in each band. */
  counts: Record<Band, number>
  /**
   * How many features went past a limit some rule was told to treat as hard.
   *
   * A count of the shop's own policy being breached, not a claim that the
   * geometry cannot be cut.
   */
  pastHardLimit: number
  /**
   * Features no rule had anything to say about.
   *
   * Worth showing rather than burying: the Engine's datasheet is uneven between
   * feature types, and a part reading "0.94, and 200 features unjudged" is a
   * different thing from a part that scored 0.94.
   */
  unjudged: number
}

/**
 * A part's score: the weighted average of how every rule landed.
 *
 * Weighted by rule rather than by feature, so a rule a shop cares about counts
 * for more wherever it applies. A hard limit is reported alongside rather than
 * folded into the number — "this part scores 0.72" and "one feature cannot be
 * cut at all" are different things to know.
 */
export const scorePart = (verdicts: ReadonlyArray<FeatureVerdict>): PartScore => {
  const counts: Record<Band, number> = {
    easy: 0,
    alright: 0,
    meh: 0,
    rats: 0,
    'no go': 0,
  }

  let weighted = 0
  let weight = 0
  let pastHardLimit = 0
  let unjudged = 0

  for (const verdict of verdicts) {
    if (verdict.band) {
      counts[verdict.band] += 1
    } else {
      unjudged += 1
    }

    for (const result of verdict.results) {
      // Best band scores 1, worst scores 0, and where a measurement sits inside
      // its own band moves it smoothly between the two.
      weighted += ruleScore(result) * result.rule.weight
      weight += result.rule.weight

      if (result.band === 'no go') {
        pastHardLimit += 1
      }
    }
  }

  return {
    score: weight === 0 ? 1 : weighted / weight,
    counts,
    pastHardLimit,
    unjudged,
  }
}

/**
 * Every feature judged, in report order.
 *
 * The part-level context — where the top of the part is, in each machining
 * direction — is worked out once here and handed to every feature. Reach is the
 * only measurement that needs it, and it cannot be answered from one feature's
 * datasheet.
 */
export const evaluatePart = (
  rules: ReadonlyArray<Rule>,
  features: ReadonlyArray<PartFeature>,
  /** The part's bounding box, for the rules that judge the part itself. */
  boundingBox?: ReadonlyArray<number>,
  /** The machine the part has to fit, from the rule set. */
  machine?: MachineEnvelope,
): Array<FeatureVerdict> => {
  const context = partContext(features, boundingBox, machine)

  return features.map((feature) => evaluateFeature(rules, feature, context))
}
