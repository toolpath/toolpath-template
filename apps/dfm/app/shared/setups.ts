import { DIRECTION_COLORS } from '@toolpath/viewer'
import type { Vec3 } from '@toolpath/api'

import type { PartFeature, PartReport } from './contracts'

/**
 * What the plan actually needs from a report: its faces, and nothing else.
 *
 * Narrower than `PartReport` on purpose. The app renders from
 * `PublicInspectionReport`, which strips the presigned mesh URLs at the
 * boundary — so a plan function demanding a whole `PartReport` cannot be called
 * from the page that needs it, while asking for what it reads can.
 */
export type PartFaces = Pick<PartReport, 'regions'>
import { directionLabel } from './report'
import type { Band, FeatureVerdict } from './rules'
import { bandRank, scoreFeature } from './rules'

/**
 * How the part is held, and what gets cut from each way up.
 *
 * A setup is a machining direction plus the work assigned to it. The Engine
 * has already done the hard half: it reports every feature it found *per
 * direction*, so the same physical surface appears as a `face` cut straight
 * down from one way and a `wall` reached sideways from another. Choosing a
 * setup is choosing which of those readings to actually run.
 *
 * That is the whole model here. This file does not invent orientations, detect
 * features or plan operations — it takes the Engine's own alternatives and
 * records which one a shop picked, for roughing and for finishing separately.
 *
 * ## Roughing and finishing
 *
 * Kept apart because they genuinely differ: a pocket can be hogged out from
 * above and finished from the side where the walls are square to the tool, and
 * a plan that forces both into one direction is a plan that leaves a shop
 * arguing with the app. Either can be unset — a feature roughed but not
 * finished is a real state to be in halfway through planning, and it shows as
 * one rather than being quietly completed.
 */

export interface Setup {
  id: string
  /**
   * Which of the part's candidate directions this setup holds.
   *
   * Also what picks its colour, so a setup on a direction the Engine never
   * offered still takes one from the same nine — see {@link Setup.direction}.
   */
  directionIndex: number
  /**
   * A way up somebody named themselves, when it is not one the Engine offered.
   *
   * Absent on an ordinary setup, where `directionIndex` says everything. Present
   * when a shop said "square to that bore" or "ten degrees off +Z": the vector
   * is then the truth and the index is only a colour.
   *
   * Such a setup **holds no readings**. The Engine reports features per
   * direction, so an orientation it never considered has nothing attributed to
   * it — the setup is a real plan for holding the part, with nothing the app can
   * assign to it until an analysis is run that way up. The panel says so rather
   * than showing an empty list as if something had gone wrong.
   */
  direction?: Vec3 | undefined
  /** What people call it: "+Z", "−Y", or whatever they rename it to. */
  name: string
  /**
   * Whether this setup is **settled**, and nothing may change what it cuts.
   *
   * A generator writes a whole arrangement in one press, and until now it did
   * so over the top of whatever somebody had spent ten minutes deciding, with
   * no warning. That is the one place the app's own rule — *generate composes,
   * the two modes correct* — broke down: an offer could quietly un-correct a
   * correction.
   *
   * A lock says "this part of the plan is a decision, not a suggestion". The
   * generators leave its readings alone, and anything that would move work off
   * it or on to it says so first.
   *
   * Absent means unlocked, which is every setup a generator has just written —
   * locking is somebody's act.
   */
  locked?: boolean | undefined
}

/**
 * The way up a setup holds, said or offered.
 *
 * One place, because "which direction is this setup" is asked from colouring,
 * coverage, inference and the panel, and each of them getting it slightly
 * differently is how a named direction ends up half-supported.
 */
export const directionOf = (setup: Setup, directions: ReadonlyArray<Vec3>): Vec3 | null =>
  setup.direction ?? directions[setup.directionIndex] ?? null

/** Which setup cuts a feature, and in which pass. */
export interface Assignment {
  rough?: string | undefined
  finish?: string | undefined
  /**
   * Faces this reading has **given up** to another, per pass.
   *
   * Absent on almost every assignment, and absent means "all of them" — a
   * reading normally cuts every face it covers. It fills in when a face is
   * claimed by a different reading: the claim takes that face and nothing else,
   * and this is where the rest of the reading survives.
   *
   * Stored as what was lost rather than what is kept, for two reasons. The
   * common case then carries no data at all, so a plan built by a generator is
   * shaped exactly as before. And it is the shortfall the panel has to show —
   * "cut on two of its three faces" is the thing somebody needs to see, and
   * deriving it from a kept-list means diffing on every render.
   */
  without?: Partial<Record<Pass, readonly number[]>>
  /**
   * Faces this reading has **taken on**, per pass — ones it does not cover.
   *
   * The mirror of {@link Assignment.without}, and the other half of arguing
   * with a reading. The Engine's answer to "what is cuttable from here" can be
   * short as well as long: a profile that stops one wall early is not wrong
   * about the eleven faces it did find, and the fix is to hand it the twelfth
   * rather than to draw a fresh reading over the top of it.
   *
   * Held on the assignment rather than by rewriting `regionIdxs`, for the same
   * reason `without` is: the reading is the Engine's, and the plan is ours. The
   * reported feature stays exactly as it was reported, so a re-run that says
   * something different is a change in one place and not a merge.
   */
  also?: Partial<Record<Pass, readonly number[]>>
}

export interface SetupPlan {
  setups: Array<Setup>
  /** Keyed by feature tag. */
  assigned: Record<string, Assignment>
}

export const EMPTY_PLAN: SetupPlan = { setups: [], assigned: {} }

export type Pass = 'finish' | 'rough'

export const PASSES: ReadonlyArray<Pass> = ['rough', 'finish']

/**
 * The area a feature covers, from the region table.
 *
 * Region area rather than a count: a plan that maps forty tiny fillets and
 * misses the face they sit on has mapped almost nothing, and only an area says
 * so.
 */
export const areaOf = (report: PartFaces, feature: PartFeature): number => {
  let total = 0
  for (const idx of feature.regionIdxs) {
    total += report.regions[idx]?.area ?? 0
  }
  return total
}

/**
 * The faces a reading actually cuts, in one pass.
 *
 * **The one function to ask.** A reading used to cut every face it covered, so
 * `feature.regionIdxs` was the answer everywhere and half a dozen places took
 * it directly. Now a reading can have given faces up — see
 * {@link Assignment.without} — and every one of those places has to ask here
 * instead, or the plan claims ground it is not cutting.
 *
 * Empty when the reading is not assigned in this pass: nothing is cut, which is
 * a different thing from cutting all of it.
 */
export const cutRegions = (
  plan: SetupPlan,
  feature: PartFeature,
  pass: Pass,
): ReadonlyArray<number> => {
  const held = plan.assigned[feature.featureTag]
  if (held?.[pass] === undefined) return []

  const gone = held.without?.[pass]
  const extra = held.also?.[pass]

  if ((gone === undefined || gone.length === 0) && (extra === undefined || extra.length === 0)) {
    return feature.regionIdxs
  }

  const lost = new Set(gone)
  return [...feature.regionIdxs.filter((idx) => !lost.has(idx)), ...(extra ?? [])]
}

/**
 * Every face this reading is about — its own, and any handed to it.
 *
 * What the editor lists and what the part paints, as against
 * {@link cutRegions}, which answers the narrower question of what is being cut
 * *in one pass*. A face taken on for finishing alone is still one of this
 * reading's faces while roughing is on screen; it is simply not roughed.
 *
 * Its own faces first, in the part's order, then the added ones — so a list
 * built from it does not reshuffle as faces are handed about.
 */
export const coveredRegions = (plan: SetupPlan, feature: PartFeature): ReadonlyArray<number> => {
  const held = plan.assigned[feature.featureTag]
  if (held === undefined) return feature.regionIdxs

  const mine = new Set(feature.regionIdxs)
  const extra: Array<number> = []

  for (const pass of PASSES) {
    for (const idx of held.also?.[pass] ?? []) {
      if (mine.has(idx)) continue
      mine.add(idx)
      extra.push(idx)
    }
  }

  if (extra.length === 0) return feature.regionIdxs
  return [...feature.regionIdxs, ...extra.sort((a, b) => a - b)]
}

/**
 * The faces a reading is cutting that are not its own, for the panel to say so.
 *
 * A reading cutting a face the Engine never gave it is a decision somebody
 * made, and the list marks it — an unmarked one would read as the Engine's own
 * answer, which is the one thing it is not.
 */
export const takenOn = (
  plan: SetupPlan,
  feature: PartFeature,
  pass: Pass,
): ReadonlyArray<number> => {
  if (plan.assigned[feature.featureTag]?.[pass] === undefined) return []
  return plan.assigned[feature.featureTag]?.also?.[pass] ?? []
}

/**
 * How much of a reading is in the plan, as the count every list shows.
 *
 * **One function, because four places show this number** — the mapping lists,
 * the confirmed directions, the datasheet and the face editor's own header —
 * and they had drifted into four formulas. On a reading holding two faces
 * handed to it and none of its own they read `12 regions`, `0 of 12`,
 * `2 of 12` and `2 of 14`: four answers, one of them right.
 *
 * The denominator is every face the reading is **about** — its own and any
 * added — because a face somebody handed it is one of its faces, and leaving it
 * out of the total makes the numerator look like a shortfall rather than a
 * count.
 *
 * The numerator counts a face cut in **either** pass, exactly as the tick in
 * the editor does. Per-pass state is the pass buttons' job and they say it
 * precisely — dashed for a part-cut claim — so this answers the question they
 * cannot: how much of this reading is in the plan at all. Counting one pass
 * meant a reading finished but not roughed read as untouched while its own
 * editor listed every face as cut.
 */
export const faceCounts = (
  plan: SetupPlan,
  feature: PartFeature,
): { faces: number; cut: number } => {
  const faces = coveredRegions(plan, feature)
  const cut = new Set(PASSES.flatMap((pass) => cutRegions(plan, feature, pass)))

  // Nothing claimed and nothing given up, so the count is about what the
  // reading covers: `0 of 12` on an unmapped row would say a decision had been
  // made about it.
  if (cut.size === 0) return { faces: faces.length, cut: faces.length }

  return { faces: faces.length, cut: faces.filter((idx) => cut.has(idx)).length }
}

/**
 * The faces a reading has given up, for the panel to say so.
 *
 * Only ever non-empty on a reading that is still cutting something: one that
 * gave up everything is not assigned at all, because a reading cutting no faces
 * is not a decision anybody made.
 */
export const givenUp = (
  plan: SetupPlan,
  feature: PartFeature,
  pass: Pass,
): ReadonlyArray<number> => {
  if (plan.assigned[feature.featureTag]?.[pass] === undefined) return []
  return plan.assigned[feature.featureTag]?.without?.[pass] ?? []
}

/** The area of a named set of faces, which is what a part-cut reading holds. */
export const areaOfRegions = (report: PartFaces, regions: Iterable<number>): number => {
  let total = 0
  for (const idx of regions) {
    total += report.regions[idx]?.area ?? 0
  }
  return total
}

/** Every region the part has, by area — the denominator for coverage. */
export const partArea = (report: PartFaces): number => {
  let total = 0
  for (const region of report.regions) {
    total += region.area
  }
  return total
}

export interface Coverage {
  /** Regions reached by this pass, as a fraction of the part's surface. */
  mapped: number
  /** The regions themselves, so the viewer can paint what is left. */
  regions: Set<number>
  area: number
}

/**
 * How much of the part a pass reaches.
 *
 * By region rather than by feature, and de-duplicated: two features covering
 * the same face have mapped one face, and counting both would let a plan claim
 * more than the part has.
 */
export const coverageOf = (
  report: PartFaces,
  features: ReadonlyArray<PartFeature>,
  plan: SetupPlan,
  pass: Pass,
  setupId?: string,
): Coverage => {
  const regions = new Set<number>()

  for (const feature of features) {
    const assignedTo = plan.assigned[feature.featureTag]?.[pass]
    if (assignedTo && (setupId === undefined || assignedTo === setupId)) {
      // What it cuts, not what it covers: a reading that gave a face up is not
      // reaching that face, and counting it would let coverage claim ground the
      // plan has handed to somebody else.
      for (const idx of cutRegions(plan, feature, pass)) {
        regions.add(idx)
      }
    }
  }

  let area = 0
  for (const idx of regions) {
    area += report.regions[idx]?.area ?? 0
  }

  const whole = partArea(report)

  return { mapped: whole === 0 ? 0 : area / whole, regions, area }
}

/**
 * The regions somebody has already said who cuts.
 *
 * A region cut twice is a region machined twice, and the Engine reports the
 * same surface from every direction that can reach it — so an arrangement that
 * takes every reading of every face is an arrangement that profiles the same
 * wall from four ways up. This is what stops that: once a face is claimed, no
 * other reading of it is assigned.
 */
export const claimedRegions = (
  features: ReadonlyArray<PartFeature>,
  plan: SetupPlan,
  pass: Pass = 'rough',
): Set<number> => {
  const claimed = new Set<number>()

  for (const feature of features) {
    for (const idx of cutRegions(plan, feature, pass)) {
      claimed.add(idx)
    }
  }

  return claimed
}

/**
 * A setup's own reading: how the work assigned to it scored.
 *
 * The same weighted average a part uses, over the features actually assigned —
 * so a setup holding one awkward pocket reads worse than one holding thirty
 * easy faces, which is the comparison somebody makes when deciding whether an
 * orientation earns its re-fixture.
 */
export interface SetupScore {
  setup: Setup
  score: number | null
  worst: Band | null
  features: number
  area: number
}

export const scoreSetups = (
  report: PartFaces,
  features: ReadonlyArray<PartFeature>,
  verdicts: ReadonlyArray<FeatureVerdict>,
  plan: SetupPlan,
  pass: Pass = 'rough',
): Array<SetupScore> => {
  const byTag = new Map(verdicts.map((verdict) => [verdict.tag, verdict]))

  return plan.setups.map((setup) => {
    const mine = features.filter(
      (feature) => plan.assigned[feature.featureTag]?.[pass] === setup.id,
    )
    const scored = mine
      .map((feature) => byTag.get(feature.featureTag))
      .filter((verdict): verdict is FeatureVerdict => verdict !== undefined)
    const values = scored
      .map((verdict) => scoreFeature(verdict))
      .filter((value): value is number => value !== null)
    const bands = scored.flatMap((verdict) => (verdict.band ? [verdict.band] : []))

    return {
      setup,
      score:
        values.length === 0
          ? null
          : values.reduce((total, value) => total + value, 0) / values.length,
      worst:
        bands.length === 0
          ? null
          : bands.reduce((worst, band) => (bandRank(band) > bandRank(worst) ? band : worst)),
      features: mine.length,
      area: mine.reduce((total, feature) => total + areaOf(report, feature), 0),
    }
  })
}

/**
 * The colour a setup is drawn in, by the direction it holds.
 *
 * The viewer's own direction cycle, so a setup, its arrow and its features are
 * one colour across the whole app rather than three palettes that have to be
 * learned separately.
 */
export const setupColor = (directionIndex: number): string => {
  const hex = DIRECTION_COLORS[directionIndex % DIRECTION_COLORS.length] ?? 0x64748b
  return `#${hex.toString(16).padStart(6, '0')}`
}

/**
 * Where a feature is cut, with roughing and finishing kept together.
 *
 * **For the generators only.** An offer that writes a whole arrangement in one
 * press may reasonably say "this direction does both", because the press asked
 * for a whole arrangement. Nothing a person clicks on one feature goes through
 * here: a button labelled "Rough" that also sets finishing is the app deciding
 * something nobody asked it to, which is exactly what people notice and
 * distrust. Those use `cutOnce`, one pass at a time.
 */
export const assign = (
  plan: SetupPlan,
  tag: string,
  pass: Pass,
  setupId: string | undefined,
): Record<string, Assignment> => {
  const current = plan.assigned[tag] ?? {}
  const together = current.finish === undefined || current.finish === current.rough

  return {
    ...plan.assigned,
    [tag]:
      pass === 'rough' && together
        ? { rough: setupId, finish: setupId }
        : { ...current, [pass]: setupId },
  }
}

/**
 * One pass, said explicitly.
 *
 * `assign` keeps roughing and finishing together because that is the right
 * default; this is what somebody uses to disagree with it. Pressing "finish" on
 * a feature already roughed from another way up is a deliberate split, and it
 * has to be possible to say so without the app quietly moving the other pass.
 */
export const setPass = (
  plan: SetupPlan,
  tag: string,
  pass: Pass,
  setupId: string | undefined,
): Record<string, Assignment> => ({
  ...plan.assigned,
  [tag]: { ...plan.assigned[tag], [pass]: setupId },
})

/**
 * Whether this setup cuts this feature, in this pass.
 *
 * Spelled out rather than compared inline because the inline version has a
 * trap in it: with no setup holding the direction, *both* sides of
 * `assigned[tag]?.[pass] === setup?.id` are `undefined`, so every button on the
 * part reads as already pressed before anything exists to press it against. A
 * missing setup cuts nothing, which is what this says.
 */
export const cutsFrom = (
  plan: SetupPlan,
  tag: string,
  pass: Pass,
  setup: Setup | null | undefined,
): boolean => setup !== null && setup !== undefined && plan.assigned[tag]?.[pass] === setup.id

/** Whether this reading cuts this **one face**, in this pass. */
export const cutsFace = (
  plan: SetupPlan,
  feature: PartFeature,
  pass: Pass,
  region: number,
): boolean => cutRegions(plan, feature, pass).includes(region)

/**
 * The same question, answered in three states rather than two.
 *
 * A reading can now be cut from a setup on **some** of its faces, having given
 * the rest up — so "is this cut here" stopped being a yes or no. A button that
 * reads fully pressed on a reading holding two of its three faces is the app
 * claiming more than the plan says.
 *
 * `'some'` is also what makes the next press mean something: pressing a pass a
 * reading only partly holds takes its faces back, and pressing again lets the
 * whole thing go. Two presses, each with a visible result, rather than one that
 * silently does the wrong one of the two.
 */
export const cutState = (
  plan: SetupPlan,
  feature: PartFeature,
  pass: Pass,
  setup: Setup | null | undefined,
): boolean | 'some' => {
  if (!cutsFrom(plan, feature.featureTag, pass, setup)) return false
  return givenUp(plan, feature, pass).length === 0 ? true : 'some'
}

/**
 * The same, across a group — a way up's whole list, or eight identical holes.
 *
 * Whole only when every one of them is whole, off only when none of them is
 * cut here, and `'some'` for every mixture: a group half of which has given
 * faces up is not a group that reads as done.
 */
export const groupCutState = (
  plan: SetupPlan,
  features: ReadonlyArray<PartFeature>,
  pass: Pass,
  setup: Setup | null | undefined,
): boolean | 'some' => {
  if (features.length === 0) return false

  const states = features.map((feature) => cutState(plan, feature, pass, setup))
  if (states.every((state) => state === true)) return true
  if (states.every((state) => state === false)) return false
  return 'some'
}

/**
 * Cut this here, for this pass — and nowhere else.
 *
 * Every face belongs to several readings at once, so assigning one without
 * looking at the others is how a face ends up roughed twice: once as a `face`
 * from −Z and again inside a profile from −Y. Whatever else was cutting these
 * faces in this pass gives them up, which is also how somebody *changes their
 * mind* — pressing R on the reading you want is the whole gesture, rather than
 * hunting down whichever one had it first.
 *
 * Per pass, because roughing and finishing are separate claims on a face: the
 * same surface roughed from above and finished from the side is one plan, not
 * a conflict.
 *
 * ## A claim takes faces, not readings
 *
 * This used to unassign the other reading outright, and on a real part that is
 * far too much: moving one wall of a twelve-face profile to the way up that
 * squares it threw the other eleven faces out of the plan, and nothing said so
 * — they simply reappeared in "not cut yet". A claim now takes **the faces it
 * asked for and no more**. The reading it took them from keeps the rest and
 * stays where it was, carrying a note of what it lost.
 *
 * Two rules follow from that:
 *
 * - **A reading left cutting nothing is unassigned**, note and all. A reading
 *   that cuts no faces is not a decision anybody made, and leaving it in the
 *   plan would show a way up holding work it does not do.
 * - **Claiming gives a reading all of its own faces back.** Pressing a pass on
 *   a part-cut reading is how somebody takes back what it lost, so the gesture
 *   stays the one this file already documents: press the pass on the reading
 *   you want.
 *
 * What it deliberately does *not* do is hand faces back when a claim is undone.
 * Unassigning the wall leaves its face uncut rather than guessing which of the
 * readings that once covered it should have it — several may have given it up
 * over time, and picking one would be the app deciding. The face shows as uncut
 * and one press puts it wherever it belongs.
 */
export const cutOnce = (
  plan: SetupPlan,
  features: ReadonlyArray<PartFeature>,
  feature: PartFeature,
  pass: Pass,
  setupId: string | undefined,
  /**
   * The faces being claimed. All of the reading's, unless said otherwise.
   *
   * A press on a *row* claims the whole reading, and that is the default. A
   * press on a **face** claims one face and must leave every other alone — and
   * claiming the whole reading there would take faces off other readings that
   * the press had nothing to do with. That was a real bug: claiming one face of
   * a profile unassigned a wall holding a different face of it.
   */
  only?: ReadonlyArray<number>,
): Record<string, Assignment> => {
  const assigned: Record<string, Assignment> = { ...plan.assigned }

  // Nothing is claimed by letting go, so nothing else is disturbed.
  if (setupId !== undefined) {
    const faces = new Set(only ?? cutRegions(plan, feature, pass))
    if (only === undefined) for (const idx of feature.regionIdxs) faces.add(idx)

    for (const other of features) {
      if (other.featureTag === feature.featureTag) continue
      if (assigned[other.featureTag]?.[pass] === undefined) continue

      /*
       * What it is *cutting*, not what it covers.
       *
       * A face it was handed is a face it can lose, and one it already gave up
       * is not lost twice — so the claim is taken off the cut set and the note
       * written back from what is left, rather than accumulated on top of the
       * old note.
       */
      const kept = cutRegions(plan, other, pass).filter((idx) => !faces.has(idx))
      if (kept.length === cutRegions(plan, other, pass).length) continue

      if (kept.length === 0) {
        // It cuts nothing now. Unassigned outright, and its note goes with it.
        assigned[other.featureTag] = without(assigned[other.featureTag], pass)
        continue
      }

      assigned[other.featureTag] = noting(assigned[other.featureTag], other, kept, pass)
    }
  }

  assigned[feature.featureTag] =
    setupId === undefined
      ? without(assigned[feature.featureTag], pass)
      : // Claiming takes back everything this reading covers.
        { ...without(assigned[feature.featureTag], pass), [pass]: setupId }

  return assigned
}

/**
 * The note a reading carries about what it is cutting, from the faces it keeps.
 *
 * Written as a diff against the reading's own faces rather than accumulated: a
 * kept-set is the thing every caller actually has, and stating it once here
 * means no caller has to get `without` and `also` consistent by hand. Both
 * notes are dropped when they say nothing, so the common case — a reading
 * cutting exactly what it covers — carries no data at all.
 */
export const noting = (
  held: Assignment | undefined,
  feature: PartFeature,
  kept: ReadonlyArray<number>,
  pass: Pass,
): Assignment => {
  const keeping = new Set(kept)
  const mine = new Set(feature.regionIdxs)

  // In the part's own face order, so a panel reading it back does not reshuffle
  // as faces are taken one at a time.
  const gone = feature.regionIdxs.filter((idx) => !keeping.has(idx))
  const extra = kept.filter((idx) => !mine.has(idx)).sort((a, b) => a - b)

  const note: Assignment = { ...held }

  if (gone.length === 0) note.without = dropping(held?.without, pass)
  else note.without = { ...held?.without, [pass]: gone }

  if (extra.length === 0) note.also = dropping(held?.also, pass)
  else note.also = { ...held?.also, [pass]: extra }

  if (note.without === undefined) delete note.without
  if (note.also === undefined) delete note.also

  return note
}

/** One pass's note taken out, or the whole note gone when it was the last. */
const dropping = (
  note: Partial<Record<Pass, readonly number[]>> | undefined,
  pass: Pass,
): Partial<Record<Pass, readonly number[]>> | undefined => {
  const { [pass]: gone, ...rest } = note ?? {}
  if (Object.keys(rest).length === 0) return undefined
  return rest
}

/** One pass let go of, note and all, leaving the other pass untouched. */
const without = (held: Assignment | undefined, pass: Pass): Assignment => {
  const kept: Assignment = { ...held, [pass]: undefined }

  // Both notes, because both only describe a pass that is being cut. A reading
  // let go of has given nothing up and been handed nothing — it is simply out.
  const gone = dropping(held?.without, pass)
  const extra = dropping(held?.also, pass)

  if (gone === undefined) delete kept.without
  else kept.without = gone

  if (extra === undefined) delete kept.also
  else kept.also = extra

  return kept
}

/**
 * Drops setups that this change emptied out.
 *
 * Claiming a face takes it off whatever was cutting it, and the reading it was
 * taken from can be the only work its setup had — leaving an orientation in the
 * list that cuts nothing, which reads as the app having invented a setup.
 *
 * Only the ones *this* change emptied. A setup somebody just made and has not
 * filled yet is theirs to fill, and deleting it under them would be the same
 * fault in the other direction.
 */
export const withoutEmptied = (
  before: SetupPlan,
  after: SetupPlan,
  features: ReadonlyArray<PartFeature>,
): SetupPlan => {
  const working = (plan: SetupPlan, id: string) =>
    features.some((feature) =>
      PASSES.some((pass) => plan.assigned[feature.featureTag]?.[pass] === id),
    )

  return {
    ...after,
    setups: after.setups.filter((setup) => working(after, setup.id) || !working(before, setup.id)),
  }
}

/** A setup for one of the part's candidate directions. */
export const setupFor = (
  directions: ReadonlyArray<Vec3>,
  directionIndex: number,
  /** How many setups are already held, so this one can say where it came. */
  order = 0,
  /** A way up somebody named, when it is not one the Engine offered. */
  said?: Vec3,
): Setup => ({
  id: globalThis.crypto?.randomUUID?.() ?? `setup-${String(directionIndex)}`,
  directionIndex,
  ...(said ? { direction: said } : {}),
  // Order and direction, because both are how people refer to a setup: "op 2"
  // is the sequence, "−Z" is the way up, and a name carrying one without the
  // other has to be cross-referenced against the list to be understood.
  name: `Direction ${String(order + 1)}, ${directionLabel(
    said ?? directions[directionIndex] ?? { x: 0, y: 0, z: 0 },
  )}`,
})
