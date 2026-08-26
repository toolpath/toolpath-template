import type { Vec3 } from '@toolpath/api'

import type { PartFeature } from './contracts'
import { directionKey } from './report'
import { isAxisAligned } from './directions'
import type { Pass, Setup, SetupPlan } from './setups'
import { PASSES, cutOnce, cutRegions, cutsFace, setupFor, withoutEmptied } from './setups'

/**
 * What settled setups are holding, gathered once.
 *
 * `disturbsLocked` answers for a single press by walking every feature on the
 * part. That is the right shape for a guard called on a click and the wrong one
 * for a list that must ask the same question of every row it draws, three times
 * over — so the walk happens once and the rows read the result.
 */
export type LockedClaims = {
  /** Readings a settled setup holds, and which setup holds each. */
  readonly readings: ReadonlyMap<string, Setup>
  /** Per pass, the regions a settled reading is cutting, and by whose lock. */
  readonly cutting: ReadonlyMap<Pass, ReadonlyMap<number, Setup>>
}

export const lockedClaims = (
  plan: SetupPlan,
  allFeatures: ReadonlyArray<PartFeature>,
): LockedClaims => {
  const readings = new Map<string, Setup>()
  const cutting = new Map<Pass, Map<number, Setup>>(PASSES.map((pass) => [pass, new Map()]))

  const locked = new Map(
    plan.setups.filter((setup) => setup.locked === true).map((setup) => [setup.id, setup]),
  )
  if (locked.size === 0) return { readings, cutting }

  for (const [tag, assignment] of Object.entries(plan.assigned)) {
    for (const pass of PASSES) {
      const setupId = assignment[pass]
      const setup = setupId === undefined ? undefined : locked.get(setupId)
      if (setup !== undefined) readings.set(tag, setup)
    }
  }

  /*
   * A settled reading's faces, per pass — read from `cutRegions` rather than
   * `regionIdxs`, because a reading is no longer cut whole and the question is
   * what it is *cutting*, not what it covers.
   */
  for (const feature of allFeatures) {
    const held = readings.get(feature.featureTag)
    if (held === undefined) continue
    for (const pass of PASSES) {
      const regions = cutting.get(pass)
      for (const idx of cutRegions(plan, feature, pass)) regions?.set(idx, held)
    }
  }

  return { readings, cutting }
}

/**
 * The settled setup that would refuse this press, if one would.
 *
 * The same two routes `disturbsLocked` describes, answered with the setup
 * instead of a boolean so that whatever goes inert can name the lock to open.
 *
 * Asking this *before* the press is the whole point. The refusal already works;
 * what did not was saying so, and a control that refuses in silence is exactly
 * the press that looks like it did what was asked.
 */
export const blockedBy = (
  claims: LockedClaims,
  features: ReadonlyArray<PartFeature>,
  /** Empty means "take it off both passes", which claims nothing. */
  passes: ReadonlyArray<Pass>,
): Setup | null => {
  if (claims.readings.size === 0) return null

  for (const feature of features) {
    const held = claims.readings.get(feature.featureTag)
    if (held !== undefined) return held
  }

  // Letting go claims no faces, so it cannot take one from anybody.
  if (passes.length === 0) return null

  for (const pass of passes) {
    const regions = claims.cutting.get(pass)
    if (regions === undefined) continue
    for (const feature of features) {
      for (const idx of feature.regionIdxs) {
        const cutter = regions.get(idx)
        if (cutter !== undefined) return cutter
      }
    }
  }

  return null
}

/**
 * Whether a press would move work off a setup somebody has settled.
 *
 * The lock's own promise is that *anything* which would move work off it says
 * so first, and until now nothing did: `lockedReadings` was read by the
 * generators and by nothing else, so every manual gesture walked straight
 * through a lock that the panel drew, the face list explained, and the plan
 * recorded.
 *
 * Two ways a press reaches settled work, and the second is the one that hurts:
 *
 * - **Moving the reading itself** — pressing R, F or Both on a reading a locked
 *   setup holds, whether that assigns it elsewhere or takes it off. Both are
 *   changes to what the settled setup cuts.
 * - **Taking its faces** — cut-once means claiming a face removes it from
 *   whoever held it, and that can be a locked reading nobody named in the
 *   press. A profile claimed from +Z quietly stripping a wall a settled setup
 *   was holding is precisely the silent change the lock exists to stop, and it
 *   is invisible: the press looks like it did what was asked.
 *
 * The answer is to refuse the **whole** press rather than apply the safe half
 * of it. Skipping only the locked reading would leave two setups cutting one
 * face, which breaks cut-once — a worse state than the one being prevented, and
 * one nothing else in the app is written to expect.
 *
 * Delegates to `blockedBy` rather than deciding for itself, because the rows
 * that go inert have to reach the same verdict and reaching it twice is how
 * they came apart the first time: this refused correctly while the buttons
 * stayed lit, so the press looked live and did nothing.
 */
export const disturbsLocked = (
  plan: SetupPlan,
  allFeatures: ReadonlyArray<PartFeature>,
  features: ReadonlyArray<PartFeature>,
  /** Empty means "take it off both passes", which claims nothing. */
  passes: ReadonlyArray<Pass>,
): boolean => blockedBy(lockedClaims(plan, allFeatures), features, passes) !== null

/**
 * Assigning readings to the way up they are read from.
 *
 * The one action the mapping page is made of. A reading already names a
 * direction — the Engine reported it from one — so pressing R on it does not
 * ask which setup to use: it uses the setup for that reading's own direction,
 * making one if the plan has none yet.
 *
 * Ported from `feature-picker.tsx` `setPassFor`, kept pure so the rules below
 * can be tested without a page.
 */
export const setPassFor = (
  plan: SetupPlan,
  directions: ReadonlyArray<Vec3>,
  allFeatures: ReadonlyArray<PartFeature>,
  features: ReadonlyArray<PartFeature>,
  /** Empty means "take it off both passes" — see below. */
  passes: ReadonlyArray<Pass>,
): SetupPlan => {
  const first = features[0]
  if (!first) return plan

  // Settled work does not move, and does not lose faces to work that does.
  if (disturbsLocked(plan, allFeatures, features, passes)) return plan

  const index = directions.findIndex(
    (direction) => directionKey(direction) === directionKey(first.machiningDirection),
  )
  if (index < 0) return plan

  const held = plan.setups.find((entry) => entry.directionIndex === index)
  const setup = held ?? setupFor(directions, index, plan.setups.length)

  // Empty means "take it off both": pressing the pass it is already cut in is
  // how somebody unsays it.
  const wanted = passes.length === 0 ? PASSES : passes
  const off = passes.length === 0

  let assigned = plan.assigned

  /*
   * "Already there" is a property of the whole press — every reading, and every
   * pass the press asked for.
   *
   * **Across the group**, because pressing Rough all where every reading is
   * already roughed there takes them all off, while a group only half done gets
   * the rest put on. Deciding it feature by feature would make one press both
   * assign and unassign.
   *
   * **And across the passes**, which is the half this got wrong. Judged per
   * pass, Both on a reading already roughed read "rough is already there" and
   * took roughing *off* while putting finishing on — one press that assigned one
   * pass and unassigned the other, which is not a thing anybody asked for. Both
   * means both: it lets go only when both are already held.
   *
   * **And wholly there.** A reading that gave faces up is cut here on some of
   * itself, and a press on it takes the rest back rather than letting go —
   * otherwise the only gesture that repairs a split claim is the one that
   * destroys it.
   */
  const already = features.every((entry) =>
    wanted.every(
      (pass) =>
        plan.assigned[entry.featureTag]?.[pass] === setup.id &&
        (plan.assigned[entry.featureTag]?.without?.[pass] ?? []).length === 0,
    ),
  )

  for (const feature of features) {
    for (const pass of wanted) {
      assigned = cutOnce(
        { ...plan, assigned },
        allFeatures,
        feature,
        pass,
        off || already ? undefined : setup.id,
      )
    }
  }

  /*
   * One plan, one update.
   *
   * `wanted` is a list rather than two calls, because two `setState` calls from
   * one snapshot lose the first — "Both" fired twice and only finishing landed.
   */
  return withoutEmptied(
    plan,
    {
      setups: held ? plan.setups : [...plan.setups, setup],
      assigned,
    },
    allFeatures,
  )
}

/** Which setup, if any, holds the direction a reading is read from. */
export const setupForReading = (
  plan: SetupPlan,
  directions: ReadonlyArray<Vec3>,
  feature: PartFeature,
) => {
  const index = directions.findIndex(
    (direction) => directionKey(direction) === directionKey(feature.machiningDirection),
  )
  if (index < 0) return null
  return plan.setups.find((entry) => entry.directionIndex === index) ?? null
}

/** Whether any setup cuts this reading, in either pass. */
export const isMapped = (plan: SetupPlan, featureTag: string): boolean =>
  PASSES.some((pass) => plan.assigned[featureTag]?.[pass] !== undefined)

/**
 * The readings of a face, with the ones already being cut first.
 *
 * Clicking a face that is already being cut is nearly always a question about
 * **that** cut — "what did I put here", not "what else could go here". Ranking
 * the plan's own readings above the alternatives is what makes the answer the
 * thing somebody was asking about; otherwise a face lands on whichever unmapped
 * candidate the geometry happened to rank first.
 *
 * Stable within each half, so the ranking a click arrived with is kept among
 * equals rather than replaced by a second opinion.
 */
export const mappedFirst = <T extends { featureTag: string }>(
  readings: ReadonlyArray<T>,
  plan: SetupPlan,
): Array<T> => {
  const mine: Array<T> = []
  const rest: Array<T> = []

  for (const reading of readings) {
    if (isMapped(plan, reading.featureTag)) mine.push(reading)
    else rest.push(reading)
  }

  return [...mine, ...rest]
}

/**
 * The readings of a face, in the order a click should offer them.
 *
 * Three bands, and stable within each so the ranking a click arrived with
 * survives among equals:
 *
 * 1. **What the plan already cuts.** Clicking a face being cut is nearly always
 *    a question about that cut.
 * 2. **Ordinary ways up** — ±X, ±Y, ±Z. A part square in the vice is what a
 *    three-axis machine does and what most shops reach for first.
 * 3. **Everything else.** Off-axis is a real answer and a more expensive one:
 *    it wants a fifth axis or a fixture built for it, so it is not what a click
 *    lands on before anybody has asked for it.
 */
export const readingOrder = (
  readings: ReadonlyArray<PartFeature>,
  plan: SetupPlan,
): Array<PartFeature> => {
  const mapped: Array<PartFeature> = []
  const square: Array<PartFeature> = []
  const askew: Array<PartFeature> = []

  for (const reading of readings) {
    if (isMapped(plan, reading.featureTag)) mapped.push(reading)
    else if (isAxisAligned(reading.machiningDirection)) square.push(reading)
    else askew.push(reading)
  }

  return [...mapped, ...square, ...askew]
}

/**
 * The easiest of a face's readings, by what the rules made of each.
 *
 * The score is 0–100 with 100 meaning every rule sitting in `easy`, so the
 * highest is the one a shop has least trouble with — which is the one a first
 * click should open. An unjudged reading loses to any judged one: "nobody
 * looked" is not a recommendation.
 *
 * Ties keep the order they arrived in, which is the order the click ranked
 * them, so two equally easy readings still resolve the way the geometry said.
 */
export const easiestReading = (
  tags: readonly string[],
  scores: ReadonlyMap<string, { score: number | null }>,
): string | null => {
  let best: string | null = null
  let bestScore = -1

  for (const tag of tags) {
    const score = scores.get(tag)?.score ?? -1
    if (score > bestScore) {
      best = tag
      bestScore = score
    }
  }

  return best ?? tags[0] ?? null
}

/**
 * The reading a first click on a face should open.
 *
 * Two answers, and which one depends on whether the plan has anything to say
 * about this face yet:
 *
 * - **Something cuts it** — that reading, whatever its score. A click on a face
 *   already being cut is nearly always a question about that cut: where it is
 *   machined from, whether it is roughed as well as finished, what else it came
 *   with. Opening a different reading of the same face answers a question
 *   nobody asked and hides the one that matters.
 * - **Nothing cuts it** — the **easiest**, by what the rules made of each. The
 *   score is 0–100 with 100 meaning every rule sitting in `easy`, so the
 *   highest is the one a shop has least trouble with, and an unjudged reading
 *   loses to any judged one because "nobody looked" is not a recommendation.
 *
 * The order the readings arrive in decides ties, and it is the order the click
 * ranked them — so two equally easy readings still resolve the way the geometry
 * said.
 *
 * "Cuts it" means in **either** pass, like everything else that asks whether a
 * face is in a reading: a face this reading finishes is one it is machining,
 * even while roughing is the pass on screen.
 */
export const readingForFace = (
  readings: ReadonlyArray<PartFeature>,
  plan: SetupPlan,
  region: number,
  scores: ReadonlyMap<string, { score: number | null }>,
): string | null => {
  const cutting = readings.find((reading) =>
    PASSES.some((pass) => cutsFace(plan, reading, pass, region)),
  )
  if (cutting) return cutting.featureTag

  return easiestReading(
    readings.map((reading) => reading.featureTag),
    scores,
  )
}

/**
 * Settle a setup, or unsettle it.
 *
 * A lock says *this part of the plan is a decision, not a suggestion*. It is
 * the answer to the one place the app's own rule broke down: **generate
 * composes, the two modes correct** — except that a generator wrote a whole
 * arrangement over the top of ten minutes of correcting, with no warning.
 */
export const lockSetup = (plan: SetupPlan, setupId: string, locked: boolean): SetupPlan => ({
  ...plan,
  setups: plan.setups.map((setup) => (setup.id === setupId ? { ...setup, locked } : setup)),
})

/**
 * The readings a locked setup is holding, which nothing may quietly move.
 *
 * Whole readings rather than faces: a lock is about a *setup* — "this is how I
 * am holding the part and this is what it cuts" — and half of a locked reading
 * moving elsewhere is exactly the silent change it exists to prevent.
 */
export const lockedReadings = (plan: SetupPlan): ReadonlySet<string> => {
  const settled = new Set(plan.setups.filter((setup) => setup.locked === true).map((s) => s.id))
  if (settled.size === 0) return new Set()

  const held = new Set<string>()
  for (const [tag, assignment] of Object.entries(plan.assigned)) {
    for (const pass of PASSES) {
      const setupId = assignment[pass]
      if (setupId !== undefined && settled.has(setupId)) held.add(tag)
    }
  }

  return held
}

/**
 * The settled setup holding a reading, if one is.
 *
 * Returns the setup rather than a boolean because every caller needs its name:
 * "this is settled" is an unhelpful thing to tell somebody who then has to go
 * and find out *which* setup, and the offer to unlock has to name what it would
 * unlock.
 */
export const settledSetup = (plan: SetupPlan, featureTag: string): Setup | null =>
  plan.setups.find(
    (setup) =>
      setup.locked === true &&
      PASSES.some((pass) => plan.assigned[featureTag]?.[pass] === setup.id),
  ) ?? null

/** Whether a reading is held by a setup somebody has settled. */
export const isLocked = (plan: SetupPlan, featureTag: string): boolean =>
  lockedReadings(plan).has(featureTag)
