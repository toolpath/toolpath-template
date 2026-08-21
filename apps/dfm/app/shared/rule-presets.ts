import { FeatureType as EngineFeatureType } from '@toolpath/api'
import type { FeatureType } from '@toolpath/viewer'
import type { Rule, RuleSet } from './rules'
import { DEFAULT_PLAN_LIMITS } from './rules'

/**
 * A tapped hole, which this app's Engine does not report yet.
 *
 * Kept in the baseline rule rather than dropped: a tapped hole needs a tap, a
 * chamfer and thread relief a drilled one does not, so a rule about them is a
 * rule about a different thing. Until the type is reported the rule simply
 * never fires, which is what a rule naming an unknown type is supposed to do.
 */
const THREADED_HOLE = EngineFeatureType.ThreadedBlindHole

/**
 * The rules the app ships with: the DFM prototype's own set, rule for rule.
 *
 * Same ids, same names, same thresholds, same weights, same two rules shipped
 * switched off. A shop that tuned these in the prototype should recognise every
 * row, because the numbers are the part somebody argued over — porting the
 * engine and quietly reinventing the defaults would have thrown away the only
 * part of it that was earned.
 *
 * What is translated is *who each rule applies to*. The prototype grouped
 * features into its own kinds — "pocket", "holes", "t-slot", "contour" — and
 * the Engine reports its own `featureType` values, so each rule's audience is
 * mapped below. That mapping is the one editorial decision in this file.
 */

/**
 * Cavities: what the prototype called pockets, slots and T-slots.
 *
 * Every variant the kernel emits, not just the plain ones. A rule's audience is
 * a list of exact type strings, and the kernel spells a filleted pocket
 * `filleted_open_pocket` — so a list naming only `open_pocket` skips it in
 * silence. That is what happened: an undercut filleted T-slot with a 0.100 in
 * floor blend was judged by the reach rule alone, because
 * `UndercutFilletedTslot` appeared in no list here.
 */
const CAVITIES: ReadonlyArray<FeatureType> = [
  EngineFeatureType.FilletedOpenPocket,
  // A closed pocket with a blended floor, which this list has now been missing
  // twice: it is a cavity by every reading, and without it five rules skip the
  // type — the narrowest cut, wall height, sharp corners, the milling radius
  // range and the standard floor radii it is reported against.
  EngineFeatureType.FilletedPocket,
  EngineFeatureType.OpenPocket,
  EngineFeatureType.Pocket,
  EngineFeatureType.ThroughPocket,
  EngineFeatureType.UndercutDovetail,
  EngineFeatureType.UndercutFilletedTslot,
  EngineFeatureType.UndercutTslot,
]

/**
 * Everything a milling cutter makes: every known feature type except holes.
 *
 * Reach over cutter diameter is a milling problem wherever there is a cutter —
 * a boss stood proud of a deep floor, a fillet at the bottom of a pocket and a
 * chamfer down a wall all want a tool long enough to get there. Naming a
 * handful of types instead meant a long thin boss was judged by nothing.
 *
 * Holes are excluded because they have their own ratio, taken against the
 * drill's diameter rather than the widest cutter the corners allow, and judging
 * one hole twice under two rules double-counts it.
 *
 * Derived from the kernel's own list, so a feature type added later is milled
 * by default rather than silently unjudged — which is the failure this file
 * already has a paragraph about.
 */
const HOLES: ReadonlyArray<FeatureType> = [
  EngineFeatureType.BlindHole,
  EngineFeatureType.FilletedBlindHole,
  EngineFeatureType.ThroughHole,
  EngineFeatureType.TaperedThroughHole,
  EngineFeatureType.ThreadedBlindHole,
  EngineFeatureType.ThreadedThroughHole,
]

const MILLED: ReadonlyArray<FeatureType> = Object.values(EngineFeatureType)
  .filter((type) => !HOLES.includes(type))
  .sort()

/** The prototype's "holes". */
/** The prototype's "chamfer" and "countersink". */
const BEVELLED: ReadonlyArray<FeatureType> = [
  EngineFeatureType.Chamfer,
  EngineFeatureType.Sink,
  EngineFeatureType.SlantedFace,
]

/** The prototype's "contour": a surface driven at a stepover, not a width. */
const CONTOURED: ReadonlyArray<FeatureType> = [EngineFeatureType.ContourSurface]

/** Cavities and profiles, where a corner can be drawn sharp. */
const CORNERED: ReadonlyArray<FeatureType> = [...CAVITIES, EngineFeatureType.Profile]

export const DEFAULT_RULES: ReadonlyArray<Rule> = [
  {
    id: 'milling-ld',
    type: 'threshold',
    name: 'Milling L/D ratio',
    metric: 'millingLD',
    direction: 'higher is harder',
    thresholds: [3, 5, 6, 8],
    noGo: 12,
    weight: 14,
    enabled: true,
    // Everything an endmill makes, and the holes one makes too: a bore
    // bottomed at 180° is flat, and a flat bottom is not something a drill
    // leaves. The metric stands down on a hole bottomed by a point, so a
    // drilled hole in this audience is judged by the drilling ratio and says
    // nothing here rather than being judged twice.
    featureTypes: [...MILLED, ...HOLES],
    note: 'Reach against the widest endmill the corners allow. Long and thin means chatter, and a tool hanging out of the holder.',
  },
  {
    id: 'drilling-ld',
    type: 'threshold',
    name: 'Drilling L/D ratio',
    metric: 'drillingLD',
    direction: 'higher is harder',
    thresholds: [3, 5, 8, 12],
    weight: 14,
    enabled: true,
    featureTypes: HOLES,
    note: 'Reach down to the bottom of the hole over its diameter. Past about 4:1 a standard drill wants pecking or a longer series.',
  },
  {
    id: 'min-hole-diameter',
    type: 'threshold',
    name: 'Smallest drilled hole',
    metric: 'holeDiameter',
    direction: 'lower is harder',
    // Two standard sizes up from the smallest drill in the cabinet: 5/32,
    // 7/64, 3/32 and 1/16. A shop that has to sharpen a 3 mm drill twice a
    // shift does not call a 3 mm hole easy.
    thresholds: [3.969, 2.778, 2.381, 1.5875],
    weight: 2,
    enabled: true,
    featureTypes: HOLES,
    note: "Below the smallest drill on the shelf, a hole is somebody's special order.",
  },
  {
    id: 'min-cutout-width',
    type: 'threshold',
    name: 'Narrowest cut',
    metric: 'footprintAcross',
    direction: 'lower is harder',
    // A cavity is only as narrow as the tool that clears it, and a tool that
    // small is fragile before it is unavailable. Eighth, sixteenth, and down.
    thresholds: [6.35, 4.7625, 3.175, 2],
    weight: 2,
    // Off in the prototype because the footprint it read was not trustworthy on
    // every shape; off here for a harder reason — the Engine does not report a
    // footprint at all. Kept because a rule set is a shop's document.
    enabled: false,
    featureTypes: CAVITIES,
    note: 'The narrow way across a cavity, which is what decides the smallest cutter that can get into it.',
  },
  {
    id: 'wall-height-ratio',
    type: 'threshold',
    name: 'Wall height against its thickness',
    metric: 'wallHeightRatio',
    direction: 'higher is harder',
    // A wall four times its thickness stands on its own; ten times wants
    // something bracing it. Past that it rings, pushes away from the cutter,
    // and eventually will not stand up to being cut at all.
    thresholds: [2, 4, 6, 8],
    weight: 2,
    // Off for the same reason: wall thickness needs the face on the other side
    // of the wall, and the datasheet is deliberately non-geometric.
    enabled: false,
    featureTypes: [...CAVITIES, 'wall'],
    note: 'How tall a wall stands for its thickness. Four to one is safe standing alone, ten to one when something braces it.',
  },
  {
    id: 'sharp-corners',
    type: 'flag',
    name: 'Sharp internal corners',
    /*
     * Asked of the cutter diameter, not of a boolean.
     *
     * `facts.hasSharpCorner` is the obvious field and the app read it for
     * months — but the Engine only reports it on fillets and contours, so a
     * sharp corner in a pocket or against a wall went unremarked. The widest
     * cutter a feature admits is reported on nearly every type, and where that
     * is **zero** the Engine is saying the same thing in a way it says
     * everywhere: no round tool goes in there.
     *
     * Nothing to tune either way: a cutter is round, so a corner drawn sharp
     * cannot be milled at all. How small a radius is worth *having* is the
     * preferred milling radius rule's question.
     */
    metric: 'minCutterDiameter',
    op: '=',
    against: 0,
    raises: 'no go',
    weight: 10,
    enabled: true,
    featureTypes: CORNERED,
    note: 'A cutter is round, so a corner drawn sharp cannot be milled. It wants a radius, a broach or an EDM.',
  },
  {
    id: 'cutter-diameter',
    type: 'threshold',
    name: 'Preferred milling radius size range',
    // A radius rule, given a radius. The `cd` bands are cutter diameters, so
    // this reads half of one: a 1/8 in cutter is a 0.0625 in internal radius,
    // and comparing that band against a diameter judged every corner as twice
    // the size it is.
    metric: 'minRadius',
    direction: 'lower is harder',
    /*
     * A quarter inch of radius down to fifty thou, in the sizes a cabinet
     * actually holds: 1/4, 1/8, 1/16, and then whatever is left.
     *
     * It was a range — fragile below, straining the machine above — which is
     * true of a *cutter* and not of a corner. Nothing about a generous internal
     * radius is hard: it is cut with whatever is in the holder. Only the
     * tightening end costs anything, so only the tightening end is scored.
     */
    thresholds: [6.35, 3.175, 1.6002, 1.27],
    weight: 2,
    enabled: true,
    featureTypes: CAVITIES,
    note: 'The tightest internal radius the feature leaves room for — half the cutter diameter the Engine reports. The smaller it gets, the more slowly it has to be cut and the more fragile the tool.',
  },
  {
    id: 'standard-drill-sizes',
    type: 'match',
    name: 'Standard drill sizes',
    metric: 'holeDiameter',
    // Fractional drills from a sixteenth to half an inch: the sizes almost any
    // shop has in the cabinet without ordering.
    standards: [1.5875, 3.175, 4.7625, 6.35, 7.9375, 9.525, 11.1125, 12.7],
    tolerance: 0.0254,
    matched: 'easy',
    unmatched: 'meh',
    weight: 2,
    enabled: true,
    featureTypes: HOLES,
    note: 'A hole on a stocked drill size is one pass with a tool already in the cabinet. Anything else is a reamer, an interpolated bore, or an order.',
  },
  {
    id: 'standard-floor-radius',
    type: 'match',
    name: 'Standard floor radii',
    metric: 'floorFilletRadius',
    // A tenth, thirty and sixty thou: the bull nose radii a shop grinds for.
    standards: [0.254, 0.762, 1.524],
    tolerance: 0.0508,
    matched: 'easy',
    unmatched: 'rats',
    weight: 2,
    enabled: true,
    featureTypes: CAVITIES,
    note: 'A floor blend on a stock bull nose radius is one pass. Anything else has to be surfaced with a ball.',
  },
  {
    id: 'standard-chamfer-angle',
    type: 'match',
    name: 'Standard chamfer angles',
    metric: 'chamferAngle',
    standards: [30, 45, 60],
    tolerance: 1,
    matched: 'easy',
    unmatched: 'meh',
    weight: 2,
    enabled: true,
    featureTypes: BEVELLED,
    note: 'A chamfer at an angle the shop already grinds for is one pass with a chamfer mill.',
  },
  {
    id: 'standard-drill-point',
    type: 'match',
    name: 'Standard drill point angle',
    metric: 'drillConeAngle',
    standards: [118, 135],
    tolerance: 1,
    matched: 'easy',
    unmatched: 'meh',
    weight: 2,
    enabled: true,
    featureTypes: HOLES,
    note: 'A blind hole bottomed by a jobber or split point drill, rather than a flat needing a second tool.',
  },
  {
    id: 'surfacing-area',
    type: 'threshold',
    name: '3D surfacing area',
    metric: 'surfaceArea',
    direction: 'higher is harder',
    // Two square inches to eight, in millimetres. Surfacing is slow per unit
    // area but a small patch of it is not a problem — the scale starts where it
    // begins to cost real time rather than at the first square inch.
    thresholds: [1290.32, 2580.64, 3870.96, 5161.28],
    // No hard limit. Surfacing is expensive, never impossible: a big surfaced
    // area is a quote nobody likes, not a part that cannot be made, and calling
    // it a no go put parts past a limit the shop had not actually set.
    weight: 4,
    enabled: true,
    // Only the kinds that need a ball or bull nose driven over the whole
    // surface. A flat floor of the same area is one facing pass.
    featureTypes: CONTOURED,
    note: 'How much 3D surfacing there is, from two square inches to eight. That any at all is rats is set by the feature type baseline; this is how much of it there is.',
  },
  {
    id: 'part-size',
    type: 'threshold',
    name: 'Part size against the machine',
    metric: 'partOverMachine',
    direction: 'higher is harder',
    /*
     * How far past the machine, not how big.
     *
     * The machine is three numbers and is set beside the rules — a shop says
     * "30 × 16 × 20", and a single longest-side limit throws away the fact that
     * a long thin part fits a machine a cube of the same length does not. This
     * reads the overhang: zero fits, and each threshold is how far past you are
     * willing to be before it stops being a job for this shop.
     *
     * A quarter inch of overhang might be re-fixturing; four inches is a
     * different machine. Refused past that.
     */
    thresholds: [0, 6.35, 25.4, 101.6],
    noGo: 101.6,
    weight: 3,
    enabled: true,
    featureTypes: [],
    note: 'How far the part exceeds the machine, side for side. Set the machine beside the rules; zero means it fits.',
  },
  {
    id: 'kind-baseline',
    type: 'baseline',
    name: 'Feature type baseline',
    // Heavier than any measured rule, and on purpose: a kind of work that is
    // hard by nature is not a number to be averaged down by five rules that
    // happen to be content.
    weight: 15,
    enabled: true,
    // The types are named in `bands`; leaving this empty keeps the rule looking
    // at every feature and saying nothing about most of them.
    featureTypes: [],
    bands: {
      // Driven at a stepover rather than a tool width. There is no size of it
      // that is quick.
      contour_surface: 'rats',
      // A cutter that enters sideways, cannot be plunged and cannot be backed
      // out of a jam. Shallow or deep, it is the same awkward operation — and
      // a filleted one is the same operation again.
      undercut_tslot: 'rats',
      undercut_filleted_tslot: 'rats',
      undercut_dovetail: 'rats',
      // A concave blend between two surfaces. Whatever its radius, it is a ball
      // or a bull nose walked along it at a stepover — the same surfacing job
      // as a contour, and priced the same way.
      inner_fillet: 'rats',
      // A face at an angle to every axis. It is either surfaced, or the part is
      // tipped to get square to it and that is another setup; both are the
      // expensive answer to a face that would have been one pass if it were
      // flat.
      slanted_face: 'rats',
      // Tapping is a second operation on a hole that is already drilled: a
      // tool change, a different feed regime, and a tap that breaks off in a
      // finished part scraps it. Not hard the way an undercut is hard, but
      // never free.
      [THREADED_HOLE]: 'meh',
    },
    note: 'Where each kind of feature starts before anything is measured, for the ones that are hard by nature rather than by size.',
  },
  {
    id: 'reach',
    type: 'threshold',
    name: 'Reach below top of part',
    metric: 'depthBelowPartTop',
    direction: 'higher is harder',
    // 0.75, 1.25, 1.75 and 3 inches, in the millimetres everything is measured
    // in.
    thresholds: [19.05, 31.75, 44.45, 76.2],
    /*
     * Six inches down, and the shop stops.
     *
     * Every other cost on this list is paid once — a tool change, a slower
     * feed, an extra pass. Reach is paid on every cut the tool makes: at that
     * depth the holder is in the part, the tool is three or four diameters of
     * unsupported steel, and chatter decides the finish rather than the
     * program. There is a real point where the answer is "not on a 3-axis
     * machine", and it was missing.
     */
    noGo: 152.4,
    /*
     * Heavy, because it is upstream of the others.
     *
     * A pocket that is awkward at the top of a part is a different job at the
     * bottom of a deep one, and at weight 2 this rule was a rounding error
     * against a milling ratio at 14 — a feature 100 mm down scored barely
     * worse than the same feature on the face.
     */
    weight: 10,
    enabled: true,
    featureTypes: [],
    note: 'How far below the top of the part the tool has to reach before it cuts anything, the way the Engine reports it.',
  },
]

/**
 * A rule set's own copy of the defaults.
 *
 * Copied rather than shared because the rules panel edits in place, and two
 * sets pointing at the same rule object would drag each other's thresholds.
 */
const copyOfDefaults = (
  overrides: ReadonlyArray<{ id: string } & Partial<Rule>> = [],
): Array<Rule> => {
  const byId = new Map(overrides.map((rule) => [rule.id, rule]))
  const rules: Array<Rule> = []

  for (const rule of DEFAULT_RULES) {
    const override = byId.get(rule.id)

    if (!override) {
      rules.push({ ...rule })

      continue
    }

    // An override names a rule by id and changes only fields that rule already
    // has — a threshold's limits, a range's spans — so the shape survives the
    // merge. What the compiler sees is a union member merged with a partial of
    // the whole union, which it cannot check; the tests read every preset back
    // through the evaluator, which can.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see above
    rules.push({ ...rule, ...override } as Rule)
  }

  return rules
}

export const DEFAULT_RULE_SET: RuleSet = {
  id: 'default',
  name: 'Toolpath defaults',
  rules: copyOfDefaults(),
  plan: { ...DEFAULT_PLAN_LIMITS },
}

/**
 * Justin Grey Labs.
 *
 * The numbers below started from SendCutSend's published CNC machining
 * guidelines — https://sendcutsend.com/guidelines/cnc-machining/, read
 * 2026-08-01 — which is recorded here rather than on the set, because a
 * citation on screen is a claim about whose limits these are and this set is
 * shipped as somebody else's.
 *
 * The `id` stays `preset-sendcutsend`: it is what a shop's saved copy points
 * back at, and renaming it would orphan every set copied from this one. What a
 * set is called is a label; what it is remains its id.
 *
 * Their thread sizes, their ±0.005 in cut and position tolerance, and their
 * note that enclosed hollows and undercuts may not be producible have no rule
 * to hang on yet.
 */
export const SENDCUTSEND: RuleSet = {
  id: 'preset-sendcutsend',
  name: 'Justin Grey Labs',
  rules: copyOfDefaults([
    {
      id: 'milling-ld',
      // "at least the radius of the cutter being used, or at least one fifth
      // the height of the wall — whichever is greater": a fillet a fifth of the
      // depth is a reach of 2.5 times the cutter's diameter.
      thresholds: [1, 1.5, 2, 2.5],
      noGo: 2.5,
      note: 'Their corner fillets must be at least a fifth of the wall height, which is a reach of 2.5 times the cutter diameter.',
    },
    {
      id: 'drilling-ld',
      // 8× diameter up to 0.500 in, 4× above it. The tighter of the two is the
      // one a rule can state.
      thresholds: [2, 4, 6, 8],
      noGo: 8,
      note: 'Holes up to 0.500 in go 8 diameters deep; bigger than that, 4.',
    },
    {
      id: 'min-hole-diameter',
      // They publish one number: 0.0629 in, the smallest they drill. Anything
      // above it they take, so the bands sit just above the refusal rather than
      // inventing a scale they never stated.
      thresholds: [2.5, 2, 1.8, 1.598],
      noGo: 1.598,
      note: 'Their smallest drilled hole is 0.0629 in. Above that they do not say, so the bands sit close to the limit.',
    },
    {
      id: 'cutter-diameter',
      // Their floor is a 0.0625 in internal radius, so a 0.125 in cutter, and
      // they publish nothing above it — a corner too big for any cutter they
      // hold is cut with a smaller one and a bit more time. So the bands run
      // down to their floor and stop there, and below it is a refusal because
      // it is a limit they have stated rather than one we have inferred.
      thresholds: [6.35, 3.175, 2, 1.5875] as [number, number, number, number],
      noGo: 1.5875,
      note: 'Their smallest machined internal radius is 0.0625 in, which is a 0.125 in cutter. They publish no upper limit.',
    },
  ]),
}

export const PRESET_SETS: ReadonlyArray<RuleSet> = [DEFAULT_RULE_SET, SENDCUTSEND]
