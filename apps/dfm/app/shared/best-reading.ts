import type { Vec3 } from '@toolpath/api'

import type { PartFeature } from './contracts'
import { directionKey } from './report'
import { forcedRegions, isUndercut, requiredDirections } from './generate'
import type { Assignment, PartFaces, Setup, SetupPlan } from './setups'
import { EMPTY_PLAN, PASSES, type Pass, claimedRegions, coveredRegions, setupFor } from './setups'
import { lockedReadings } from './plan-actions'
import type { Band, FeatureVerdict } from './rules'
import {
  DEFAULT_PLAN_LIMITS,
  BAND_PRICE,
  SETUP_BASE,
  bandOnScale,
  scaleFor,
  bandRank,
  scoreFeature,
} from './rules'
import type { PlanLimits } from './rules'

/**
 * Every face cut the way the rules like best, without buying a setup for it.
 *
 * A face is reachable several ways — the Engine reports it as a `face` from one
 * direction and a `wall` from another — and the best-scoring of those readings
 * is the one to run. But a reading is only free if its direction is already
 * being held: an orientation costs a re-fixture, a re-probe and a tool change,
 * and no single face is worth one.
 *
 * So the order is: take the directions the part forces, since those exist
 * whatever anybody decides. Then work through the faces, and for each take the
 * best reading **among the setups already held**. Only a face no held setup can
 * reach earns a new direction, and then the best reading of that face chooses
 * which.
 *
 * The result reads as an argument rather than a list: every extra setup in it is
 * there because something could not be reached without it.
 *
 * **Every ordering rule below was a bug first.** They are spelled out where they
 * are used rather than summarised here, because each one looks like an
 * arbitrary tie-break until you know what it cost.
 */

export type { PlanLimits } from './rules'
export { DEFAULT_PLAN_LIMITS } from './rules'

/**
 * How bad a band is, with "nothing judged it" between good and bad.
 *
 * An unjudged reading is not a safe one — the datasheet was sparse, or no rule
 * was aimed at its type — so it should not outrank a reading somebody's limits
 * actually looked at and called easy. It sits just past `alright`: better than a
 * known problem, worse than a known-good answer.
 */
const rankOfBand = (band: Band | null, unjudged: number): number =>
  band === null ? unjudged : bandRank(band)

const scoreIn = (feature: PartFeature, verdicts: Map<string, FeatureVerdict>): number | null => {
  const verdict = verdicts.get(feature.featureTag)
  return verdict ? scoreFeature(verdict) : null
}

const undercutOnly = (features: ReadonlyArray<PartFeature>): Set<number> => {
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

/**
 * What each limit actually decided, on the run that just happened.
 *
 * **The answer to "which of these is doing anything".** Six prices, a band
 * floor and a scale, all of them plausible and none of them visible: a shop
 * moves a number, presses generate, and the plan comes back the same — with no
 * way to tell whether the number is wrong, is right and irrelevant on this
 * part, or was never reached at all. Those are three very different situations
 * and they looked identical.
 *
 * A count is the honest form of the answer. Not a sensitivity sweep — that
 * means running the whole arrangement again per knob, and it answers "would a
 * different value change things" when the question is "did **this** value do
 * anything". A limit that never bit is a limit this part does not care about,
 * whatever it is set to.
 *
 * Every field counts **decisions the limit changed** — a swap it stopped, a
 * direction it refused — never times it was consulted. A price that was checked
 * four hundred times and blocked nothing is a price that did nothing.
 */
export interface WhatBit {
  /** Swaps refused because the reading was not enough better, in points. */
  gainToMove: number
  /** Readings that handed their faces back for holding too little. */
  worthAnOperation: number
  /** Ways up not bought: the improvement was worth less than their price. */
  newDirectionGain: number
  /** Patches left uncut because no way up was worth buying to reach them. */
  sliverFloor: number
  /** Swaps refused for leaving more operations running than they found. */
  operationCost: number
  /** Faces a reading below the band floor was not allowed to take. */
  worstBand: number
  /** Times another way up was refused outright — the scale's `no go`. */
  waysUp: number
  /**
   * Setups the geometry **forces past** the shop's wall.
   *
   * A refusal past three ways up is a statement about *choices*, and a forced
   * direction is not one: it is the only way anything reaches an undercut, and
   * dropping it would leave the part uncut rather than cheaply arranged. So
   * geometry wins — and the plan then quietly runs more setups than the shop
   * said it would, which is the part that was wrong.
   *
   * Counted so it can be said out loud. It was filed as "maxDirections: 2
   * yields three directions" for months, which reads as an arrangement that
   * cannot count.
   */
  waysUpForced: number
  /** Readings ranked by the unjudged default, because no rule reached them. */
  unjudgedRank: number
  /** Rounds used, and whether the cap was reached rather than settling. */
  rounds: { used: number; capped: boolean }
}

const nothingBit = (): WhatBit => ({
  gainToMove: 0,
  worthAnOperation: 0,
  newDirectionGain: 0,
  sliverFloor: 0,
  operationCost: 0,
  worstBand: 0,
  waysUp: 0,
  waysUpForced: 0,
  unjudgedRank: 0,
  rounds: { used: 0, capped: false },
})

/*
 * The ledger of the run that just happened.
 *
 * Module state rather than a second return value, which would have to be
 * threaded through `planForChosen`, both passes of a split, the merge and the
 * three components that call them — six signatures widened so one panel can
 * read a counter. Reset at the top of every run, so it is never a mixture of
 * two.
 *
 * The page is one arrangement at a time; if that ever stops being true this
 * becomes a returned value and the six signatures get widened after all.
 */
let bit = nothingBit()

/** What the limits decided, on the last arrangement built. */
export const whatBit = (): WhatBit => bit

export const byBestReading = (
  report: PartFaces,
  directions: ReadonlyArray<Vec3>,
  features: ReadonlyArray<PartFeature>,
  verdicts: Map<string, FeatureVerdict>,
  /**
   * Setups somebody is already holding, which this fills around.
   *
   * They count as bought: a face one of them cuts well is a face it should cut,
   * exactly like a forced direction, because the re-fixture has already been
   * paid for.
   */
  keep: SetupPlan = EMPTY_PLAN,
  limits: PlanLimits = DEFAULT_PLAN_LIMITS,
  /**
   * Whether a way up may be **bought** that nobody is holding.
   *
   * False is "make the best of what I have already decided to hold". It is not a
   * weaker version of true: an arrangement that may not buy is answering a
   * different question — *given this fixturing, what is the best I can do* —
   * and it will leave ground uncut where the held setups genuinely cannot reach
   * it. That is the honest answer, not a shortfall.
   */
  mayBuy = true,
  /**
   * Whether `keep` is a **starting point** rather than a decision.
   *
   * A plan somebody made by hand is a decision: its ground is not ours to
   * improve on, and re-cutting it would overwrite a choice with a preference.
   * A plan this function was *handed to start from* is the opposite — it exists
   * only to get coverage on the board, and freezing it would freeze its
   * mistakes with it.
   */
  seeded = false,
  /**
   * Which passes this run decides. Both, unless they are being decided apart.
   *
   * Every assignment used to be written `{ rough, finish }` from one run, so the
   * arrangement could never produce a plan where a face is roughed one way up
   * and finished another — a thing the plan has modelled from the start and the
   * generator had no way to say.
   */
  passes: ReadonlyArray<Pass> = PASSES,
  /**
   * Whether a reading may cut **part** of what it covers.
   *
   * Off, a reading is taken whole or not at all — one contested face and it
   * takes none of them, so a twelve-face reading loses all twelve to a
   * thirteenth something else holds, and those faces go to whatever smaller
   * readings come after it. That is how a wall scoring 5 ends up holding a face
   * a pocket scores 77 on, from a way up already held.
   *
   * That rule was right when a reading was genuinely all-or-nothing. It stopped
   * being right when the face editor gave the plan `Assignment.without`: a
   * reading can cut nine of its ten faces and say so, and the allocator is the
   * last thing that still cannot.
   *
   * On, each face goes to the best-scoring reading of it among the ways up
   * held, and every reading keeps whatever it won — noted as what it gave up.
   * The trade is **fragmentation**: per-face allocation can hand one face to a
   * one-face reading and leave an operation running for it, which is what
   * `operationCost` exists to argue against. The swap pass still does that
   * **Undefined means "whatever the rules say."** This is a shop-level answer
   * now — *May the plan split a feature?*, in the rules beside everything else
   * — so every generator honours it without each of them having to remember to
   * pass it along. A generator press that wants the other way says so
   * explicitly, and that override lasts one run.
   */
  partial: boolean | undefined = undefined,
): SetupPlan => {
  const mayPart = partial ?? limits.splitFeatures !== false

  /*
   * Readings held by a setup somebody has **settled**.
   *
   * A lock says "this part of the plan is a decision, not a suggestion", and
   * this is where it is honoured: their faces are taken as given before
   * anything is allocated, and nothing below may take one. Without it a
   * generator wrote a whole arrangement over the top of ten minutes of
   * correcting, with no warning — the one place *generate composes, the two
   * modes correct* broke down.
   */
  const settled = lockedReadings(keep)

  // Forced directions exist whatever anybody decides — but only where the
  // arrangement is allowed to bring one into being.
  const forced = mayBuy ? requiredDirections(directions, features) : []
  const bought = [...new Set([...keep.setups.map((setup) => setup.directionIndex), ...forced])]
  const held: Array<number> = [...bought]
  const onlyUndercut = undercutOnly(features)
  const areaOfRegion = new Map(report.regions.map((region) => [region.idx, region.area]))

  /**
   * How much of the part a reading decides.
   *
   * Area, not count. A reading scoring 0.90 on a 2 mm² fillet and one scoring
   * 0.85 on a 3,000 mm² floor are not close, and ranking them by score alone let
   * a part be arranged around its smallest features — which is exactly what "it
   * picks bad solutions" looks like from the outside.
   */
  const spreadOf = (feature: PartFeature): number =>
    feature.regionIdxs.reduce((total, idx) => total + (areaOfRegion.get(idx) ?? 0), 0)

  const indexOf = new Map(directions.map((direction, index) => [directionKey(direction), index]))

  /*
   * Best score first, then band, then size.
   *
   * **Score before band, which is the opposite of what the picker does.** Its
   * order put the band first, on the reasoning that a score is a weighted
   * average over every rule while a band is the *worst* of them — so a reading
   * one rule refuses can still average well, and band-first stops the plan
   * cutting a face a way the shop's own limits refuse.
   *
   * Paul's call, and the trade is explicit: a band is five buckets and a score
   * is continuous, so band-first throws away every distinction inside a bucket
   * and lets a reading that is mediocre everywhere beat one that is excellent
   * apart from a single rule. What it buys back is that a refusal can now win a
   * face — see the test named for it, which asserts the consequence rather than
   * hiding it.
   */
  // A fresh ledger per run, so it is never a mixture of two arrangements.
  bit = nothingBit()

  const unjudged = limits.unjudgedRank ?? DEFAULT_PLAN_LIMITS.unjudgedRank ?? 1.5
  const rankOf = (band: Band | null) => rankOfBand(band, unjudged)

  /**
   * Where the shop's refusal sits, if it set one.
   *
   * A reading past it is offered **last** and may never take a face from one
   * above it — but it may still cut a face nothing else reaches, because
   * leaving ground uncut is not an improvement on cutting it badly.
   */
  const floorRank = limits.worstBand === undefined ? null : bandRank(limits.worstBand)

  const readings = features
    .map((feature) => ({
      feature,
      direction: indexOf.get(directionKey(feature.machiningDirection)) ?? -1,
      score: scoreIn(feature, verdicts) ?? 0,
      band: verdicts.get(feature.featureTag)?.band ?? null,
    }))
    .map((reading) => {
      // No rule reached it, so the unjudged default is what ranks it — worth
      // counting, because a part where that is most of the readings is a part
      // whose plan rests on a number nobody set deliberately.
      if (reading.band === null) bit.unjudgedRank += 1

      return {
        ...reading,
        refused: floorRank !== null && rankOfBand(reading.band, unjudged) > floorRank,
      }
    })
    .filter((reading) => reading.direction >= 0)
    .sort((a, b) => {
      // Refused readings last, whatever they score — that is what a floor is.
      const byRefusal = Number(a.refused) - Number(b.refused)
      if (byRefusal !== 0) return byRefusal

      const byScore = b.score - a.score
      const byBand = rankOf(a.band) - rankOf(b.band)

      // Which of the two leads is shop policy, not arithmetic — see
      // `PlanLimits.bandFirst`.
      const first = limits.bandFirst ? byBand : byScore
      const second = limits.bandFirst ? byScore : byBand

      return first || second || spreadOf(b.feature) - spreadOf(a.feature)
    })

  /*
   * Who cuts each face, and how well.
   *
   * A set of covered faces was enough while a face could only ever be claimed
   * once. It is not enough to *improve* one: deciding whether another way up is
   * worth buying means knowing what the face is currently getting, so the
   * question can be "how much better", not just "is it taken".
   */
  const cutBy = new Map<number, { feature: PartFeature; score: number; band: number }>()

  /*
   * The same thing read backwards: which faces each reading is holding.
   *
   * Kept in step with `cutBy` because a swap needs "everything this reading
   * holds", and finding that by scanning every face of the part turned each
   * decision into a walk over the whole model — which is how a real part froze.
   */
  const holds = new Map<PartFeature, Set<number>>()

  /*
   * Locked ground first, and it never moves.
   *
   * Before the seed and before anything is filled: a settled setup is the one
   * thing in the plan an offer may not argue with, so it is put down first and
   * `settled` keeps every later pass off it.
   */
  for (const feature of features) {
    if (!settled.has(feature.featureTag)) continue

    const held = new Set<number>()
    for (const idx of coveredRegions(keep, feature)) {
      cutBy.set(idx, {
        feature,
        score: scoreIn(feature, verdicts) ?? 0,
        band: rankOf(verdicts.get(feature.featureTag)?.band ?? null),
      })
      held.add(idx)
    }
    holds.set(feature, held)
  }

  if (seeded) {
    /*
     * A starting point, at its real worth — so every face in it can still be
     * argued out of the reading that swept it up.
     */
    for (const feature of features) {
      if (settled.has(feature.featureTag)) continue
      if (passes.every((pass) => keep.assigned[feature.featureTag]?.[pass] === undefined)) continue
      const held = new Set<number>()
      for (const idx of feature.regionIdxs) {
        cutBy.set(idx, {
          feature,
          score: scoreIn(feature, verdicts) ?? 0,
          band: rankOf(verdicts.get(feature.featureTag)?.band ?? null),
        })
        held.add(idx)
      }
      holds.set(feature, held)
    }
  } else {
    for (const idx of claimedRegions(features, keep)) {
      // Held by somebody else's decision, and not ours to improve on.
      cutBy.set(idx, { feature: features[0]!, score: Number.POSITIVE_INFINITY, band: -1 })
    }
  }

  const scoreAt = (idx: number): number => cutBy.get(idx)?.score ?? -1

  /**
   * Every reading that could cut a face, best first.
   *
   * `readings` is already sorted, so each list here is too — the first entry
   * from a held direction is that face's best available answer.
   */
  const readingsPerFace = new Map<number, Array<(typeof readings)[number]>>()
  for (const reading of readings) {
    for (const idx of reading.feature.regionIdxs) {
      const list = readingsPerFace.get(idx)
      if (list) list.push(reading)
      else readingsPerFace.set(idx, [reading])
    }
  }

  /**
   * What a face would fall back to if the reading holding it went away.
   *
   * Stranded ground is **not** lost ground. `assignHeld` runs to a fixed point,
   * so a face freed by a swap is offered to everything else on the next pass —
   * and valuing it at zero is what made a big mediocre reading unassailable. A
   * thirteen-face contour scoring 22 could not be displaced by a one-face
   * reading scoring 100, because dropping it looked like losing twelve faces
   * when eleven of them had a better answer waiting.
   */
  const fallbackFor = (
    idx: number,
    without: ReadonlySet<PartFeature>,
  ): (typeof readings)[number] | null => {
    for (const reading of readingsPerFace.get(idx) ?? []) {
      if (!held.includes(reading.direction)) continue
      if (without.has(reading.feature)) continue
      if (skipUndercut(reading.feature, onlyUndercut)) continue
      return reading
    }
    return null
  }

  /** What a face is currently worth: its holder's score over its area. */
  const worthNow = (idx: number): number => {
    const holder = cutBy.get(idx)
    if (!holder) return 0
    if (holder.score === Number.POSITIVE_INFINITY) return Number.POSITIVE_INFINITY
    return holder.score * (areaOfRegion.get(idx) ?? 0)
  }

  /**
   * Whether this reading is worth taking, and what it would displace.
   *
   * Two rules, and which applies depends on whether anything is in the way —
   * that split is what makes the answer right in both directions.
   *
   * **Free ground is taken on sight.** A reading covering faces nobody holds
   * costs nothing to run, whatever it scores, and a face cut badly is worth
   * more than a face nobody cuts. This is also what keeps the arrangement
   * working on an unjudged part, where every score is zero.
   *
   * **Occupied ground has to pay for itself**, on the score-weighted area of the
   * whole swap: what this reading would contribute over its own ground against
   * what everything it displaces is contributing over theirs. Whole readings —
   * each is one operation, so losing one face loses the operation.
   *
   * The order in `assignHeld` is what makes the second rule fair. Free ground is
   * filled *first*, so by the time a swap is judged the alternatives have
   * already been placed and the comparison is against what the part actually
   * has — not against a gap that something better was about to fill. Judging
   * both at once let a 26-face reading scoring 58 displace a 14-face reading
   * scoring 80, purely because it also reached twelve faces nobody held yet.
   */
  const wouldTake = (
    reading: (typeof readings)[number],
    /** False while free ground is being filled, so nothing is disturbed yet. */
    mayDisplace: boolean,
  ): Set<PartFeature> | null => {
    if (
      reading.feature.regionIdxs.length === 0 ||
      skipUndercut(reading.feature, onlyUndercut) ||
      cutBy.get(reading.feature.regionIdxs[0]!)?.feature === reading.feature
    ) {
      return null
    }

    const displaced = new Set<PartFeature>()
    let free = false
    let gained = 0

    for (const idx of reading.feature.regionIdxs) {
      const holder = cutBy.get(idx)
      // Ground another setup already cuts is never ours to take.
      if (holder?.score === Number.POSITIVE_INFINITY) return null

      if (holder) displaced.add(holder.feature)
      else free = true

      gained += reading.score * (areaOfRegion.get(idx) ?? 0)
    }

    if (displaced.size === 0) return free ? displaced : null
    if (!mayDisplace) return null

    /*
     * What the swap is worth, valuing stranded ground at what would pick it up.
     *
     * Each displaced reading is one operation, so losing one face loses all of
     * its faces — but those faces are then free, and the next pass offers them
     * to everything else. So they are worth their **best remaining answer**,
     * not nothing. Valuing them at nothing is what let a thirteen-face contour
     * scoring 22 hold a face a one-face reading scored 100 on.
     */
    const mine = new Set(reading.feature.regionIdxs)
    const gone = new Set([...displaced, reading.feature])
    let lost = 0
    let coverageLoss = 0

    // The distinct readings that would pick up the stranded ground — one
    // operation each, and the reason a swap can be a bad idea even when every
    // face ends up better cut.
    const pickedUpBy = new Set<PartFeature>()

    for (const feature of displaced) {
      for (const idx of holds.get(feature) ?? []) {
        lost += worthNow(idx)
        if (mine.has(idx)) continue

        const area = areaOfRegion.get(idx) ?? 0
        const fallback = fallbackFor(idx, gone)
        gained += (fallback?.score ?? 0) * area
        if (fallback) pickedUpBy.add(fallback.feature)
        else coverageLoss += area
      }
    }

    let coverageGain = 0
    for (const idx of reading.feature.regionIdxs) {
      if (!cutBy.has(idx)) coverageGain += areaOfRegion.get(idx) ?? 0
    }

    /*
     * Coverage decides, but only once free ground is exhausted.
     *
     * By the time a swap is judged, `assignHeld` has already let every reading
     * take whatever it could without disturbing anything. So a face still
     * uncovered here is one **nothing else can reach without a swap of its own**
     * — there is no alternative waiting, and a face cut moderately is worth more
     * than a face cut by nobody.
     *
     * Judged before free ground was filled, this same rule let a 26-face reading
     * scoring 58 displace a 14-face reading scoring 80 for twelve faces that
     * something better was about to take. The ordering is what makes it safe;
     * the rule on its own is not.
     */
    /*
     * How many operations the swap leaves the shop running.
     *
     * Before: one per displaced reading. After: this one, **plus one for every
     * distinct reading that has to pick up the ground this strands**. That
     * second term is the whole point. Counting only the readings displaced made
     * consolidation look free and fragmentation look free too, because the
     * common case is one reading displacing one — an eleven-face profile losing
     * a single face to a one-face wall scores as a wash, and ten of those in a
     * row quietly turn one operation into eleven.
     *
     * So an eleven-face profile taking ground from eleven single-face readings
     * is credited ten operations, and each of the ten swaps that would undo it
     * is charged for the fragmentation it causes.
     */

    if (coverageGain !== coverageLoss) return coverageGain > coverageLoss ? displaced : null

    return gained > lost ? displaced : null
  }

  const take = (reading: (typeof readings)[number], displaced: ReadonlySet<PartFeature>) => {
    // Everything it displaces gives up all of its ground, not just the faces
    // that were contested — see `wouldTake`.
    for (const feature of displaced) {
      for (const idx of holds.get(feature) ?? []) cutBy.delete(idx)
      holds.delete(feature)
    }

    const mine = new Set<number>()
    for (const idx of reading.feature.regionIdxs) {
      cutBy.set(idx, {
        feature: reading.feature,
        score: reading.score,
        band: rankOf(reading.band),
      })
      mine.add(idx)
    }
    holds.set(reading.feature, mine)
  }

  /**
   * What a way up would be worth, counting improvement as well as coverage.
   *
   * The old measure counted only ground nothing had claimed — so a direction
   * that would cut a face far better than the way it is currently being cut was
   * worth exactly zero, and never bought. On a real part that left a face
   * scoring 100 from −Y being cut as a 25-scoring wall from −X, because −X
   * happened to be bought first and the face was then "covered".
   */
  const worthOf = (index: number): number => {
    const taken = new Set<number>()
    let worth = 0

    for (const reading of readings) {
      if (reading.direction !== index) continue
      if (reading.feature.regionIdxs.some((idx) => taken.has(idx))) continue

      const displaced = wouldTake(reading, true)
      if (!displaced) continue

      const gain = reading.feature.regionIdxs.reduce((total, idx) => {
        const area = areaOfRegion.get(idx) ?? 0
        const now = scoreAt(idx)
        return total + area * (reading.score - (now < 0 ? 0 : now))
      }, 0)

      if (gain <= 0) continue
      for (const idx of reading.feature.regionIdxs) taken.add(idx)
      worth += gain
    }

    return worth
  }

  const wholePart = [...areaOfRegion.values()].reduce((total, area) => total + area, 0)
  /*
   * What one operation is worth avoiding, in the same units as everything else.
   *
   * Scaled off the average face so it means the same on a bracket and on a
   * manifold — a part whose faces are ten times bigger should not make an
   * operation ten times cheaper.
   */
  const meanFace = areaOfRegion.size === 0 ? 0 : wholePart / areaOfRegion.size
  /*
   * What one operation is worth avoiding inside a swap, in the same units as
   * everything else here — score-weighted area.
   *
   * Priced off the work-per-operation scale rather than its own number: the
   * question "is one more operation worth it" has one answer, and it had three.
   * Scaled by the average face so it means the same on a bracket and on a
   * manifold.
   *
   * **Both terms are in the 0–1 score scale**, which is where the swap's
   * arithmetic lives. `priceOfAnOperation` is already a fraction of it; the
   * hundred that turns it into points belongs in the panel, not here. A band on
   * this scale is 0.25, so an operation at `easy` costs a fifth of one.
   */

  /**
   * The smallest patch worth buying a whole way up to reach.
   *
   * Half a per cent of the part, and deliberately **not** `newDirectionGain`.
   * That one prices an *improvement* — how much better a re-fixture must make
   * the plan — and a shop raising it to consolidate would otherwise also stop
   * the arrangement buying the directions it needs to cut the part at all,
   * trading five setups for a third of the part uncut.
   *
   * This is the other question: is there enough here to be worth holding the
   * part again? On a part whose faces run from 0.004 to 3,339, there is always
   * some sliver left, and without a floor the arrangement buys direction after
   * direction to chase them.
   */
  /*
   * The smallest patch worth buying a whole way up to reach.
   *
   * The setup price again, read as plain area rather than score-weighted: this
   * is ground **nothing cuts at all**, so there is no improvement to weigh —
   * the question is only whether there is enough here to be worth holding the
   * part again.
   *
   * It used to be its own number, on the reasoning that a shop raising the
   * price of an *improvement* should not thereby stop the plan cutting the
   * part. That reasoning survives: the two still ask different questions of
   * different quantities. What has gone is the second knob — both now cost
   * whatever a setup costs at the band this plan is in, which is the one place
   * a shop says how it feels about setups.
   */
  const worthHolding = () => {
    if (waysUp === null || waysUp.free === true) return 0

    return SETUP_BASE * wholePart * BAND_PRICE[bandOnScale(waysUp, held.length + 1)]
  }
  /**
   * What another way up must earn, at the band this plan would land in.
   *
   * The shop's ways-up scale, priced. Buying the third setup on a scale that
   * calls three `alright` costs twice what the second did; the fifth, at
   * `rats`, costs eight times — so the arrangement has to argue harder for each
   * one, in the same vocabulary the shop wrote the rest of its rules in.
   *
   * Infinite at `no go`, which is the one hard edge and what the old ceiling
   * was: a way up past it is not for sale whatever it would save.
   */
  const waysUp = scaleFor(limits, 'setups')
  const priceOfAnother = (): number => {
    if (waysUp === null || waysUp.free === true) return 0

    return SETUP_BASE * wholePart * BAND_PRICE[bandOnScale(waysUp, held.length + 1)]
  }

  /**
   * Whether one more way up may be bought at all.
   *
   * Separate from the price because the uncut-ground loop below does not ask
   * the price — ground nothing reaches is not an *improvement* to be weighed —
   * but a refusal binds it just the same.
   */
  /*
   * Setups the geometry forced past the shop's wall.
   *
   * Counted here rather than guarded against: a forced direction is the only
   * way anything reaches an undercut, so refusing it would leave the part
   * uncut. Geometry wins and the plan says so, which is the half that was
   * missing — it read as an arrangement that could not count.
   */
  if (waysUp !== null) {
    for (let at = 1; at <= held.length; at += 1) {
      if (bandOnScale(waysUp, at) === 'no go') bit.waysUpForced += 1
    }
  }

  const mayHoldAnother = (): boolean => {
    if (waysUp === null || bandOnScale(waysUp, held.length + 1) !== 'no go') return true
    bit.waysUp += 1
    return false
  }

  /**
   * Everything the held setups can do, best reading first — but the **required**
   * ones first of all.
   *
   * A required setup exists whatever anybody decides, so a face it can cut well
   * is a face it should cut: letting an optional direction claim it first buys a
   * re-fixture to do work that was already paid for.
   */
  /**
   * How many times the whole thing is allowed to reconsider itself.
   *
   * Filling free ground is monotone — every take covers ground nothing held —
   * so that part settles on its own. **Swapping is not.** A swap is accepted on
   * an *estimate* of what would pick up the ground it strands, and an estimate
   * can be wrong, so two readings can each look like an improvement on the
   * other and trade a face back and forth for ever. That is not a hypothetical:
   * it is what froze the page on a real part.
   *
   * A bound makes the answer deterministic and the page responsive. Passes
   * after the first few change almost nothing — the first pass does the work
   * and the rest settle edges.
   */
  const ROUNDS = limits.rounds ?? DEFAULT_PLAN_LIMITS.rounds ?? 8

  /**
   * The free faces of a reading, taken without disturbing anything.
   *
   * The partial half of `fillFree`. Readings are walked best-first, so a face
   * goes to the highest-scoring reading of it among the ways up held — and a
   * reading blocked on one face keeps the rest instead of losing everything.
   */
  const takeFree = (reading: (typeof readings)[number]): boolean => {
    if (skipUndercut(reading.feature, onlyUndercut)) return false

    const free = reading.feature.regionIdxs.filter((idx) => !cutBy.has(idx))
    if (free.length === 0) return false

    const mine = holds.get(reading.feature) ?? new Set<number>()
    for (const idx of free) {
      cutBy.set(idx, {
        feature: reading.feature,
        score: reading.score,
        band: rankOf(reading.band),
      })
      mine.add(idx)
    }
    holds.set(reading.feature, mine)
    return true
  }

  /** Everything the held setups can take without disturbing anything. */
  const fillFree = () => {
    for (let working = true; working; ) {
      working = false
      for (const onlyForced of [true, false]) {
        for (const reading of readings) {
          if (onlyForced && !bought.includes(reading.direction)) continue
          if (!held.includes(reading.direction)) continue

          if (mayPart) {
            if (takeFree(reading)) working = true
            continue
          }

          const displaced = wouldTake(reading, false)
          if (displaced) {
            take(reading, displaced)
            working = true
          }
        }
      }
    }
  }

  /** One pass of swaps, best-scoring reading first. */
  const swapOnce = (): boolean => {
    let changed = false
    for (const onlyForced of [true, false]) {
      for (const reading of readings) {
        if (onlyForced && !bought.includes(reading.direction)) continue
        if (!held.includes(reading.direction)) continue

        if (mayPart) {
          if (takeBetter(reading)) changed = true
          continue
        }

        const displaced = wouldTake(reading, true)
        if (displaced) {
          take(reading, displaced)
          changed = true
        }
      }
    }
    return changed
  }

  /*
   * Free ground first, then swaps — and only then free ground again, because a
   * swap strands the ground it displaced and something else should pick it up
   * before the next round of swaps judges what is missing.
   */
  /**
   * Readings holding too little to be worth running, handed back.
   *
   * The price of splitting a feature between ways up. Per-face allocation gives
   * every face to whatever cuts it best, which is right until the winner is a
   * one-face reading scoring 95 on a sliver that a twenty-face reading scoring
   * 70 was going to cut anyway — a marginally better cut that costs a whole
   * separate operation.
   *
   * **It can never cost coverage.** A reading gives its faces up only if
   * *every* one of them has a home: another reading covering it, from a way up
   * held, that is already cutting something else and so is already an operation.
   * One homeless face and the sliver keeps the lot, because a face cut badly is
   * worth more than a face cut by nobody.
   *
   * To a fixed point, because handing one sliver's ground away can leave the
   * reading that took it below the floor in turn.
   */
  /*
   * The threshold is given in the **points somebody sees** — 0 to 100, as the
   * panel and the score badges show them — and `scoreFeature` works in 0 to 1.
   *
   * Said here rather than at the boundary because getting it wrong is silent
   * and total: a threshold of 15 against scores that never exceed 1 refuses
   * every split there is, and the arrangement quietly goes back to whole
   * readings with nothing to say it had.
   */
  /*
   * How much better a reading must be to be worth its own operation, as a
   * fraction of the score scale.
   *
   * `priceOfAnOperation` answers in points on a hundred-point scale; scores
   * here run 0 to 1. The old number was compared in the wrong one of the two
   * for a while, and every split was swept back for it.
   */

  /**
   * A better reading taking **one face** from a worse one.
   *
   * The other half of splitting a feature. Partial acquisition only ever takes
   * *free* ground, so a face claimed early — by a reading from a direction
   * bought first, before anything better was held — was never revisited: the
   * only thing that could move it was the whole-reading swap, which has to
   * displace everything the holder cuts and is priced accordingly.
   *
   * That is how a wall scoring 23 keeps a face a `face` reading scores 100 on,
   * with both ways up held.
   *
   * Gated on `gainToMove`, because taking a face is not free — it may leave the
   * taker running an operation of its own. Six points is not worth a setup;
   * seventy-seven plainly is.
   */
  const takeBetter = (reading: (typeof readings)[number]): boolean => {
    if (skipUndercut(reading.feature, onlyUndercut)) return false
    // Settled ground is not for sale. A lock is the one thing in a plan an
    // offer may not argue with.
    if (settled.has(reading.feature.featureTag)) return false

    // A refused reading may pick up ground nobody wants; it may never take any.
    if (reading.refused) {
      bit.worstBand += 1
      return false
    }

    let changed = false
    for (const idx of reading.feature.regionIdxs) {
      const holder = cutBy.get(idx)
      if (!holder || holder.feature === reading.feature) continue
      // Ground another setup already cuts is never ours to take.
      if (holder.score === Number.POSITIVE_INFINITY) continue
      /*
       * The price is for **starting an operation**, not for moving a face.
       *
       * A reading already cutting something is already an operation: handing it
       * one more face costs nothing extra, so any improvement at all is worth
       * taking. The threshold is what stops a *new* operation being opened to
       * buy six points — it was never about the face.
       */
      /*
       * It has to be **better**, always. The threshold is a second question on
       * top of that, and skipping it for a reading already running let a *worse*
       * reading take the face back — so the two traded it every round until the
       * round cap stopped them, and the loser of that trade was whichever the
       * cap happened to leave holding it.
       */
      if (settled.has(holder.feature.featureTag)) continue

      const gain = reading.score - holder.score
      if (gain <= 0) continue

      const running = (holds.get(reading.feature)?.size ?? 0) > 0
      /*
       * Any improvement will do.
       *
       * There was a price here, in points, that a reading had to beat before it
       * could take a face and start an operation for it. It priced the same
       * question three different ways and the question underneath was always
       * *may a feature come apart?* — which is now a yes or no the shop
       * answers, and this whole branch is what "yes" means.
       */

      holds.get(holder.feature)?.delete(idx)
      cutBy.set(idx, {
        feature: reading.feature,
        score: reading.score,
        band: rankOf(reading.band),
      })

      const mine = holds.get(reading.feature) ?? new Set<number>()
      mine.add(idx)
      holds.set(reading.feature, mine)
      changed = true
    }
    return changed
  }

  const assignHeld = () => {
    for (let round = 0; round < ROUNDS; round++) {
      // Capped means it was still moving when it ran out of rounds — the plan
      // is the best found rather than one that settled, which is a thing to
      // know about it.
      bit.rounds = { used: round + 1, capped: round + 1 === ROUNDS }
      fillFree()
      if (!swapOnce()) break
    }
    fillFree()
  }

  for (;;) {
    assignHeld()
    if (!mayBuy || !mayHoldAnother()) break

    /*
     * Only now is a new direction worth its re-fixture — and which one is
     * decided by everything it would cut *or cut better*, weighted by area.
     *
     * One at a time, because what a new direction unlocks may be reachable from
     * what is already held once it lands.
     */
    const offers = directions
      .map((_direction, index) =>
        held.includes(index) ? { index, worth: 0 } : { index, worth: worthOf(index) },
      )
      .filter((offer) => {
        if (offer.worth > priceOfAnother()) return true
        // Worth something, but not its price — which is the price doing its
        // job. A direction reaching nothing at all is not the limit's doing.
        if (offer.worth > 0) bit.newDirectionGain += 1
        return false
      })
      .sort((a, b) => b.worth - a.worth)

    const next = offers[0]
    if (!next) break
    held.push(next.index)
  }

  /*
   * And then whatever is still not cut at all.
   *
   * The threshold above answers "is a *better* reading worth a re-fixture",
   * which is the right question about ground somebody is already cutting and the
   * wrong one about ground nobody is. A patch worth less than two per cent of
   * the part was left uncut by an arrangement claiming to fill it — the
   * generator stopped buying while faces still had no setup at all, and the
   * coverage bar quietly read 94%.
   */
  for (;;) {
    if (!mayBuy || !mayHoldAnother()) break

    const missing = new Set<number>()
    for (const reading of readings) {
      for (const idx of reading.feature.regionIdxs) {
        if (!cutBy.has(idx)) missing.add(idx)
      }
    }
    if (missing.size === 0) break

    const offers = directions
      .map((_direction, index) => {
        if (held.includes(index)) return { index, area: 0 }

        const reached = new Set<number>()
        for (const reading of readings) {
          if (reading.direction !== index || skipUndercut(reading.feature, onlyUndercut)) continue
          for (const idx of reading.feature.regionIdxs) {
            if (missing.has(idx)) reached.add(idx)
          }
        }

        return {
          index,
          area: [...reached].reduce((total, idx) => total + (areaOfRegion.get(idx) ?? 0), 0),
        }
      })
      /*
       * A patch has to be worth a way up, even when nobody is cutting it.
       *
       * This loop used to buy for **any** unclaimed ground at all. On a part
       * whose faces run from 0.004 to 3,339 — a hundred and fifty of its two
       * hundred and sixty faces under a tenth of the average — there is always
       * some sliver left, so it bought direction after direction to chase
       * scraps, and an arrangement that one way up could do most of ended up
       * spread across five.
       *
       * See `worthHolding`: a separate floor from the improvement price, so
       * raising one to consolidate does not stop the arrangement buying the
       * directions it needs to cut the part at all. What falls below it shows
       * in "not cut yet", which is the honest place for it — a shop that wants
       * those slivers can hold the way up by hand.
       */
      .filter((offer) => {
        if (offer.area > worthHolding()) return true
        if (offer.area > 0) bit.sliverFloor += 1
        return false
      })
      .sort((a, b) => b.area - a.area)

    const next = offers[0]
    // Nothing left worth a way up — the rest is slivers, or ground the Engine
    // reported no reading for from any direction.
    if (!next) break

    held.push(next.index)

    /*
     * Ground bought for coverage stays bought for coverage.
     *
     * `fillFree`, not `assignHeld`: a way up bought to reach a patch nobody
     * cuts may take that patch and anything else going spare, and **may not
     * displace**. Re-settling everything here is what made an arrangement come
     * apart — the directions the part *forces* settle first and take the work
     * they are best at, then a direction bought for one patch helped itself to
     * their ground on a score it never had to justify.
     *
     * Measured on a part that forces exactly three ways up and is fully cut by
     * them: it was arranged across five, with the way up that should hold 72%
     * of the part left holding 24%.
     *
     * Taking work off another direction is the *other* loop's question, and it
     * has a price — `newDirectionGain`. This one has no business answering it.
     */
    fillFree()
  }

  const chosen = [...new Set([...cutBy.values()].map((entry) => entry.feature))]
    // The seeded placeholders for ground somebody else already cut are not ours
    // to hand back.
    .filter((feature) => features.includes(feature))
    /*
     * A reading holding **some** of its faces is a real answer once splitting
     * claims are allowed — that is the whole point of them. Without that, every
     * such reading was dropped from the plan and its faces left cut by nobody.
     */
    .filter(
      (feature) =>
        mayPart || feature.regionIdxs.every((idx) => cutBy.get(idx)?.feature === feature),
    )

  /*
   * Written straight out of `cutBy`, not re-derived.
   *
   * This used to hand `chosen` to the direction-by-direction builder, which
   * skips any reading overlapping ground an earlier direction claimed. That is
   * the right rule when a plan is built direction by direction and the wrong one
   * here: the work above already decided, face by face, which reading cuts what,
   * and re-deciding it in a different order dropped readings whose ground had
   * been settled — leaving their faces cut by nobody, which is the few per cent
   * that never turned green.
   */
  const setups: Array<Setup> = [...keep.setups]
  const assigned: Record<string, Assignment> = { ...keep.assigned }

  for (const index of held) {
    if (!setups.some((setup) => setup.directionIndex === index)) {
      setups.push(setupFor(directions, index, setups.length))
    }
  }

  const byIndex = new Map(setups.map((setup) => [setup.directionIndex, setup] as const))

  for (const feature of chosen) {
    const index = indexOf.get(directionKey(feature.machiningDirection))
    const setup = index === undefined ? undefined : byIndex.get(index)
    if (!setup) continue

    const held = assigned[feature.featureTag] ?? {}
    if (passes.every((pass) => held[pass] !== undefined)) continue

    /*
     * What it did not win, per pass — the note the plan has carried since the
     * face editor and the allocator has never written.
     */
    const mine = holds.get(feature) ?? new Set(feature.regionIdxs)
    const gone = feature.regionIdxs.filter((idx) => !mine.has(idx))

    assigned[feature.featureTag] = {
      ...held,
      ...Object.fromEntries(passes.map((pass) => [pass, setup.id])),
      ...(gone.length === 0
        ? {}
        : { without: { ...held.without, ...Object.fromEntries(passes.map((p) => [p, gone])) } }),
    }
  }

  // A direction cutting nothing is not a setup, it is a re-fixture that cuts
  // nothing. Held setups stay whatever happens: somebody chose those.
  const kept = new Set(keep.setups.map((setup) => setup.id))
  const working = new Set(
    Object.values(assigned).flatMap((assignment) =>
      [assignment.rough, assignment.finish].filter((id): id is string => id !== undefined),
    ),
  )

  const surviving = setups.filter((setup) => kept.has(setup.id) || working.has(setup.id))

  /*
   * Biggest first, by the surface each way up actually cuts.
   *
   * The order they were bought in is the order the algorithm happened to need
   * them, which means nothing to anybody reading the list. Area does: the first
   * direction is where most of the part gets made, and the last is the one
   * worth arguing about dropping. Numbering follows, so "Direction 1" is the
   * one that earns its re-fixture most.
   */
  const areaCut = new Map(
    surviving.map((setup) => [
      setup.id,
      features
        .filter((feature) =>
          passes.some((pass) => assigned[feature.featureTag]?.[pass] === setup.id),
        )
        .reduce(
          (total, feature) =>
            total + feature.regionIdxs.reduce((sum, idx) => sum + (areaOfRegion.get(idx) ?? 0), 0),
          0,
        ),
    ]),
  )

  const ordered = [...surviving].sort((a, b) => (areaCut.get(b.id) ?? 0) - (areaCut.get(a.id) ?? 0))

  return {
    // Only the ones made here are renumbered. A setup somebody was already
    // holding keeps the name it had — reordering the list is a presentation
    // choice, renaming somebody's setup is not.
    setups: ordered.map((setup, at) =>
      kept.has(setup.id)
        ? setup
        : { ...setup, name: setupFor(directions, setup.directionIndex, at).name },
    ),
    assigned,
  }
}

/** Kept for the `only here` scope, which asks the same question of one direction. */
export { forcedRegions }
