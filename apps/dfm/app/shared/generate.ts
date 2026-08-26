import type { Vec3 } from '@toolpath/api'

import type { PartFeature } from './contracts'
import { directionKey } from './report'
import type { Assignment, PartFaces, Setup, SetupPlan } from './setups'
import { EMPTY_PLAN, PASSES, type Pass, claimedRegions, setupFor } from './setups'
import type { FeatureVerdict } from './rules'
import { DEFAULT_PLAN_LIMITS, byBestReading, type PlanLimits } from './best-reading'
import { scoreFeature } from './rules'

/**
 * Arrangements offered in one press.
 *
 * Every one of these is an **offer**. They write a whole plan and expect to be
 * argued with: a shop moves three features afterwards and the rest were never
 * worth its time. Nothing here is confirmed until somebody says so.
 *
 * What makes them possible is that the Engine already reports each feature per
 * direction — the same surface appears as a `face` from one way up and a `wall`
 * from another — so choosing an arrangement is choosing among readings that
 * already exist rather than inventing orientations.
 */

export type Generator =
  | 'fill from current'
  | 'from the rules'
  /**
   * Say which ways up you will hold, in the order you will run them.
   *
   * Not a generator at all in the sense the others are — it writes nothing. It
   * opens the same chooser `from the rules` opens, with nothing ticked, which
   * is the difference between the two: that one starts from the rules' opinion
   * and this one starts from none. It exists because choosing the fixturing is
   * the first thing many people want to do, and the only way to do it was to go
   * and map a feature from each way up and come back.
   */
  | 'pick directions'
  | 'from toolpath'
  | 'required only'
  | 'required, filled'

/**
 * The offers, in the order they answer two different questions.
 *
 * **`By hand` is gone.** It generated nothing and returned an empty plan — it
 * was a *mode*, sitting in a row of offers, and the way to work by hand is to
 * work by hand: press R, F or Both on a reading and the way up appears. A
 * button whose whole behaviour is "do nothing so you can do it yourself" is a
 * button explaining the app rather than doing something.
 *
 * The four that pick ways up are presets on one question, and `fill from
 * current` is the answer to the other — see {@link PICKS_WAYS_UP}.
 */
export type GeneratorIcon = 'pick' | 'rules' | 'required' | 'required-filled' | 'toolpath' | 'fill'

export const GENERATORS: ReadonlyArray<{
  how: Generator
  name: string
  note: string
  /** Which mark it wears. Named here so the panel keeps no second list. */
  icon: GeneratorIcon
}> = [
  {
    how: 'pick directions',
    icon: 'pick',
    name: 'Pick directions',
    note: 'choose the ways up yourself, in the order you will run them',
  },
  {
    how: 'from the rules',
    icon: 'rules',
    name: 'From the rules',
    note: 'the orientations your limits like best',
  },
  {
    how: 'required, filled',
    icon: 'required-filled',
    name: 'Required, filled',
    note: 'what the part forces, then the rest fitted in',
  },
  {
    how: 'required only',
    icon: 'required',
    name: 'Required only',
    note: 'the directions nothing else can reach',
  },
  {
    how: 'from toolpath',
    icon: 'toolpath',
    name: 'From Toolpath',
    note: 'the orientations its own analysis chose',
  },
  {
    how: 'fill from current',
    icon: 'fill',
    name: 'Fill all',
    /*
     * Named for how it differs from the `Fill` on a direction row, which is
     * the only other thing called fill.
     *
     * That one holds one way up and offers what it could take, one setup at a
     * time, and nothing moves until it is confirmed. This decides the whole
     * plan across every way up held, in one press — a different kind of act,
     * and the name has to say which.
     */
    note: 'every way up you hold, decided at once',
  },
]

/**
 * The offers that answer *which ways up do I hold*, as against what to do with
 * them.
 *
 * `fill from current` is the only one that takes the fixturing as given and
 * asks what it is worth. The rest are four ways of choosing it — which is why
 * they read as a row of alternatives and it does not.
 */
export const PICKS_WAYS_UP: ReadonlyArray<Generator> = [
  'pick directions',
  'from the rules',
  'required, filled',
  'required only',
  'from toolpath',
]

/** Which directions can reach a region at all, by the features that cover it. */
const directionsPerRegion = (features: ReadonlyArray<PartFeature>): Map<number, Set<string>> => {
  const reach = new Map<number, Set<string>>()

  for (const feature of features) {
    const key = directionKey(feature.machiningDirection)
    for (const idx of feature.regionIdxs) {
      const seen = reach.get(idx) ?? new Set<string>()
      seen.add(key)
      reach.set(idx, seen)
    }
  }

  return reach
}

/**
 * The regions only one direction can reach.
 *
 * These are what force a setup. Everything else on the part is a choice between
 * directions, and a plan is entitled to argue about it.
 */
export const forcedRegions = (features: ReadonlyArray<PartFeature>): Set<number> => {
  const forced = new Set<number>()

  for (const [idx, canReach] of directionsPerRegion(features)) {
    if (canReach.size === 1) forced.add(idx)
  }

  return forced
}

/**
 * The directions the part forces: each one is the only way to reach something.
 *
 * A plan can argue about everything else. It cannot argue about these — drop one
 * and a surface has nobody to cut it — so they are the honest floor of any
 * arrangement, and what is left over afterwards is the real decision.
 */
export const requiredDirections = (
  directions: ReadonlyArray<Vec3>,
  features: ReadonlyArray<PartFeature>,
): Array<number> => {
  const forced = forcedRegions(features)
  const only = new Set<string>()

  for (const feature of features) {
    if (feature.regionIdxs.some((idx) => forced.has(idx))) {
      only.add(directionKey(feature.machiningDirection))
    }
  }

  return directions.flatMap((direction, index) =>
    only.has(directionKey(direction)) ? [index] : [],
  )
}

export const isUndercut = (feature: PartFeature): boolean =>
  feature.featureType.toLowerCase().includes('undercut')

/**
 * The faces that are undercuts or nothing.
 *
 * An undercut is not work to be swept into an arrangement because it happens to
 * be reachable — it wants a T-slot cutter or a lollipop, and a plan that fills
 * itself with them has promised a shop something no endmill will do. But some
 * faces have no other answer, and refusing those leaves a hole with no
 * explanation. So the rule is *only when it is the only option*.
 */
const undercutOnlyRegions = (features: ReadonlyArray<PartFeature>): Set<number> => {
  const ordinary = new Set<number>()
  const seen = new Set<number>()

  for (const feature of features) {
    for (const idx of feature.regionIdxs) {
      seen.add(idx)
      if (!isUndercut(feature)) ordinary.add(idx)
    }
  }

  return new Set([...seen].filter((idx) => !ordinary.has(idx)))
}

const skipUndercut = (feature: PartFeature, onlyUndercut: ReadonlySet<number>): boolean =>
  isUndercut(feature) && !feature.regionIdxs.some((idx) => onlyUndercut.has(idx))

const scoreIn = (feature: PartFeature, verdicts: Map<string, FeatureVerdict>): number | null => {
  const verdict = verdicts.get(feature.featureTag)
  return verdict ? scoreFeature(verdict) : null
}

/**
 * A plan with a setup per named direction, and the work each one actually does.
 *
 * Not everything the direction can reach. The Engine reports the same surface
 * from every way up that can see it, so assigning every reading of every face
 * would have the part profiled from four directions and the estimate paying for
 * all four. A face is cut **once**: the first setup to claim it in this order
 * gets it, and within a setup the best-scoring reading of a face wins.
 *
 * Order is therefore the whole argument. Whatever comes first gets first
 * refusal on the faces it can reach.
 */
const planFor = (
  report: PartFaces,
  directions: ReadonlyArray<Vec3>,
  features: ReadonlyArray<PartFeature>,
  wanted: ReadonlyArray<number>,
  keep: SetupPlan = EMPTY_PLAN,
  verdicts?: Map<string, FeatureVerdict>,
): SetupPlan => {
  const setups: Array<Setup> = [...keep.setups]
  const assigned: Record<string, Assignment> = { ...keep.assigned }
  // Seeded from what is already held, so filling never re-cuts a face an
  // existing setup is already down for.
  const claimed = claimedRegions(features, keep)
  const onlyUndercut = undercutOnlyRegions(features)

  for (const index of wanted) {
    const already = setups.find((setup) => setup.directionIndex === index)
    const setup = already ?? setupFor(directions, index, setups.length)
    if (!already) setups.push(setup)

    const direction = directions[index]
    if (!direction) continue

    const key = directionKey(direction)
    // Best reading first *within* the direction: two features of one setup can
    // cover the same face, and the better one should be the one that cuts it.
    const mine = [...features]
      .filter(
        (feature) =>
          directionKey(feature.machiningDirection) === key && !skipUndercut(feature, onlyUndercut),
      )
      .sort(
        (a, b) =>
          (verdicts ? (scoreIn(b, verdicts) ?? 0) : 0) -
          (verdicts ? (scoreIn(a, verdicts) ?? 0) : 0),
      )

    for (const feature of mine) {
      if (assigned[feature.featureTag]?.rough) continue

      // All of it or none of it. A feature is one operation over the faces it
      // covers — you cannot run half a profile — so a reading that overlaps
      // ground another setup already cuts is not a saving, it is the same wall
      // machined twice.
      if (feature.regionIdxs.some((idx) => claimed.has(idx))) continue

      for (const idx of feature.regionIdxs) claimed.add(idx)
      assigned[feature.featureTag] = { rough: setup.id, finish: setup.id }
    }
  }

  // A direction every one of whose faces was claimed by an earlier setup is not
  // a setup — it is a re-fixture that cuts nothing. Held setups stay whatever
  // happens: somebody chose those, and an empty one is theirs to fill.
  const held = new Set(keep.setups.map((setup) => setup.id))
  const working = new Set(
    Object.values(assigned).flatMap((assignment) =>
      [assignment.rough, assignment.finish].filter((id): id is string => id !== undefined),
    ),
  )

  return {
    setups: setups.filter((setup) => held.has(setup.id) || working.has(setup.id)),
    assigned,
  }
}

export interface GenerateOptions {
  report: PartFaces
  /** What the arrangement may spend on orientations. */
  limits?: PlanLimits
  directions: ReadonlyArray<Vec3>
  features: ReadonlyArray<PartFeature>
  /** The plan to build on, for the generators that keep what is held. */
  plan: SetupPlan
  /**
   * Whether that plan is a **starting point** rather than somebody's decision.
   *
   * True for a plan a generator made: it exists to get coverage on the board,
   * and freezing it would freeze its mistakes with it. False for one built by
   * hand, whose ground is not ours to improve on.
   */
  seeded?: boolean
  verdicts: ReadonlyArray<FeatureVerdict>
}

export const generate = (how: Generator, options: GenerateOptions): SetupPlan => {
  const { report, directions, features, verdicts } = options
  const byTag = new Map(verdicts.map((verdict) => [verdict.tag, verdict]))

  if (how === 'from the rules') {
    /*
     * Every face cut the way the rules like best, buying an orientation only
     * where something cannot be reached without one — see `byBestReading`.
     *
     * **Known incomplete, and deliberately left as it is.** On a part that
     * forces exactly three ways up and is fully cut by them, this reaches 95%
     * across five. Pressing **Required only** then **Fill from current** does it
     * in three at 100%, and that is the better answer today.
     *
     * Two attempts at closing that are recorded in the findings, because both
     * are plausible and both are worse:
     *
     * - **Sweep the forced directions first, then argue around them.** Reaches
     *   the whole part in three — and keeps every mistake the sweep made,
     *   because a swept reading is hard to displace once its neighbours depend
     *   on it. Faces cut far below their best went from four to twenty-six.
     * - **Argue first, then sweep the remainder.** Cannot help: the argument has
     *   already bought five directions by the time the sweep runs, so there is
     *   nothing left for it to fix.
     *
     * The gap is not a constant and not an ordering. Neither allocator covers a
     * part alone — 70% and 72% over the same three directions — and the one that
     * covers decides badly while the one that decides well leaves ground uncut.
     * Closing it means an allocator that does both, not a sequence of these two.
     */
    return byBestReading(report, directions, features, byTag, EMPTY_PLAN, options.limits)
  }

  if (how === 'fill from current') {
    /*
     * The best that can be done **from the ways up already held** — and no new
     * ones.
     *
     * A different question from "from the rules", not a weaker version of it:
     * the fixturing is already decided and this asks what it is worth. It will
     * leave ground uncut where nothing held can reach it, and that is the
     * answer rather than a shortfall — the remedy is to hold another way up,
     * which is a decision for somebody to make rather than for an offer to make
     * for them.
     *
     * With nothing held it therefore does nothing at all, which is the only
     * honest thing it could do.
     */
    return byBestReading(
      report,
      directions,
      features,
      byTag,
      options.plan,
      options.limits,
      false,
      /*
       * A plan **a generator made** is a starting point, not a decision.
       *
       * Unseeded, every claimed face is marked "held by somebody else, and not
       * ours to improve on" — so after `from the rules` had filled the part,
       * this had nothing left it was allowed to touch and appeared to do
       * nothing at all. That is right for a plan somebody built by hand and
       * wrong for one this same file wrote a moment ago.
       */
      options.seeded ?? false,
    )
  }

  if (how === 'required only') {
    /*
     * Only the work that forces the setup, not everything the direction can
     * reach.
     *
     * The point of this offer is to show what the part leaves open: a direction
     * exists because one face has nobody else to cut it, and sweeping in the
     * thirty other features it happens to reach answers the question it was
     * asked to pose. Those thirty are exactly the decision still to make.
     */
    const forced = forcedRegions(features)

    return planFor(
      report,
      directions,
      features.filter((feature) => feature.regionIdxs.some((idx) => forced.has(idx))),
      requiredDirections(directions, features),
      undefined,
      byTag,
    )
  }

  if (how === 'required, filled') {
    const required = requiredDirections(directions, features)

    return planFor(
      report,
      directions,
      features,
      [
        ...required,
        ...directions
          .map((_direction, index) => index)
          .filter((index) => !required.includes(index)),
      ],
      undefined,
      byTag,
    )
  }

  // Toolpath's own analysis: every direction it reported, in the order it
  // reported them.
  return planFor(
    report,
    directions,
    features,
    directions.map((_direction, index) => index),
    undefined,
    byTag,
  )
}

/**
 * A plan over the ways up somebody chose, with the rules deciding the rest.
 *
 * The sequence `generate.ts` already recommends in prose, made into one
 * gesture: **Required only** then **Fill from current** reaches a part in three
 * setups at 100% where `from the rules` reaches 95% across five. The buying
 * loop was the part that was wrong; the allocator was not, so this hands it a
 * decided fixturing and lets it do what it is good at.
 *
 * `mayBuy` is false throughout. A way up nobody chose is not one this may add —
 * that is the whole point of having been asked.
 */
export const planForChosen = (
  options: GenerateOptions & {
    /**
     * The ways up to hold, **in the order they will be run**.
     *
     * An order rather than a set: a plan is a sequence of setups a shop works
     * through, and the order was the direction index — the Engine's own, which
     * means nothing to anybody holding the part. Roughing from the top before
     * the fixture is cut away is a decision, and it is made here.
     */
    chosen: ReadonlyArray<number>
    /**
     * Whether roughing and finishing may come from **different** ways up.
     *
     * Off, they are decided together, as everything before this always did.
     *
     * On, they are decided **twice, with different economics** — because they
     * are different jobs. Roughing wants the fewest operations it can get away
     * with, so it runs with the operation cost turned up and consolidates.
     * Finishing wants the best reading of each face whatever it costs to get
     * there, so it runs with the operation cost at zero. Same rules, same
     * scores, same held setups; a different question asked of them.
     *
     * Running it twice with *identical* economics would be pointless — a score
     * is not per-pass, so both runs would answer the same.
     */
    splitPasses: boolean
    /**
     * Whether a reading may cut **part** of what it covers.
     *
     * The fix for cutting a face worse than a held way up could: without it a
     * reading is taken whole or not at all, so one contested face costs it
     * every face it covers and they go to whatever smaller readings follow.
     */
    partial: boolean
  },
): SetupPlan => {
  const { report, directions, features, verdicts, chosen, splitPasses, partial, limits } = options
  const byTag = new Map(verdicts.map((verdict) => [verdict.tag, verdict]))

  // In the order given. Duplicates would each buy a setup, so they go.
  const setups = [...new Set(chosen)].map((index, at) => setupFor(directions, index, at))
  const held: SetupPlan = { setups, assigned: {} }

  if (!splitPasses) {
    return byBestReading(
      report,
      directions,
      features,
      byTag,
      held,
      limits,
      false,
      false,
      PASSES,
      partial,
    )
  }

  /*
   * Each pass decided **on its own**, and both on the best reading.
   *
   * Not chained: handing the roughing plan to the finishing run as `keep` marks
   * every face it claimed as somebody else's decision — untouchable — so the
   * finishing run had nothing left to decide and wrote nothing at all.
   *
   * Both runs get the same economics, because the best reading of a face is the
   * best reading of it whichever pass is cutting. Roughing was briefly given a
   * raised operation cost so that it would consolidate while finishing chased
   * quality, and that is a real distinction — but it is not the one the rules
   * make, and inventing it here would be the app having an opinion the shop
   * never expressed.
   *
   * **So today the two runs agree**, and this option changes the *shape* of the
   * plan rather than its content: the passes are decided separately, so they
   * can be edited and re-run separately, and they will diverge the moment
   * anything distinguishes them — a per-pass rule, or a band floor that only
   * finishing has to clear.
   */
  const decide = (pass: Pass) =>
    byBestReading(report, directions, features, byTag, held, limits, false, false, [pass], partial)

  const roughed = decide('rough')
  const finished = decide('finish')

  return {
    setups: roughed.setups,
    assigned: Object.fromEntries(
      [...new Set([...Object.keys(roughed.assigned), ...Object.keys(finished.assigned)])].map(
        (tag) => [tag, { ...roughed.assigned[tag], finish: finished.assigned[tag]?.finish }],
      ),
    ),
  }
}
