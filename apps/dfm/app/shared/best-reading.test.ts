import { describe, expect, it } from 'vitest'

import { byBestReading, DEFAULT_PLAN_LIMITS, whatBit } from './best-reading'
import { BAND_PRICE, bandOnScale, scaleFor, scoreFeature } from './rules'
import { EMPTY_PLAN, PASSES, coverageOf, cutRegions, setupFor } from './setups'
import { TEST_DIRECTIONS, testFeature, testPart } from './test-part'
import type { FeatureVerdict, RuleResult } from './rules'
import type { PartFaces } from './setups'
import { bandRank } from './rules'
import type { PartFeature } from './contracts'
import type { PlanLimits, Rule } from './rules'

/**
 * Every ordering rule here was a bug in the picker first, and each looks like an
 * arbitrary tie-break until you know what it cost.
 */

const UP = TEST_DIRECTIONS[0]!
const DOWN = TEST_DIRECTIONS[1]!
const part = testPart()

/**
 * A verdict whose **band and score disagree**.
 *
 * A score cannot be set independently — it is averaged from the rules that
 * looked at the feature, while the band is the *worst* of them. So a reading
 * that nine rules like and one refuses outright averages well and still carries
 * a refusal, which is the case the ordering exists for.
 */
const rule = () => ({ weight: 1 }) as unknown as RuleResult['rule']
const results = (bands: ReadonlyArray<FeatureVerdict['band']>) =>
  bands.map((band) => ({ rule: rule(), band, value: null }) as unknown as RuleResult)

const verdictsFor = (
  entries: ReadonlyArray<readonly [string, ReadonlyArray<FeatureVerdict['band']>]>,
) => {
  const map = new Map<string, FeatureVerdict>()
  for (const [tag, bands] of entries) {
    const worst = [...bands].sort((a, b) => bandRank(b!) - bandRank(a!))[0] ?? null
    map.set(tag, {
      tag,
      featureType: 'wall',
      band: worst,
      results: results(bands),
      metrics: {},
    } as unknown as FeatureVerdict)
  }
  return map
}

/**
 * The two rules that judge the arrangement, as an allocator would be handed
 * them.
 *
 * A shop writes these in the rules list beside everything else; the allocator
 * takes them in `planRules` because it is given limits rather than a rule set.
 * Absent or switched off means the shop does not care, and nothing is charged —
 * which is how a test says "this price is not what I am measuring".
 */
const planRule = (
  id: string,
  thresholds: [number, number, number, number],
  direction: 'higher is harder' | 'lower is harder',
  noGo?: number,
): Rule =>
  ({
    id,
    type: 'threshold',
    scope: 'part',
    name: id,
    metric: 'surfaceArea',
    direction,
    thresholds,
    ...(noGo === undefined ? {} : { noGo }),
    weight: 20,
    enabled: true,
    featureTypes: [],
    note: '',
  }) as Rule

/** How many setups the plan may run, and what each costs. */
const setups = (thresholds: [number, number, number, number], noGo?: number): Rule =>
  planRule('plan-setups', thresholds, 'higher is harder', noGo)

/** How much work an operation should do — the scale that runs the other way. */
const perOperation = (thresholds: [number, number, number, number], noGo?: number): Rule =>
  planRule('plan-faces-per-operation', thresholds, 'lower is harder', noGo)

/** Setups free, operations free: only what the test names is priced. */
const NOTHING_CHARGED: PlanLimits = { ...DEFAULT_PLAN_LIMITS, planRules: [] }

const run = (
  features: ReadonlyArray<PartFeature>,
  verdicts = new Map<string, FeatureVerdict>(),
  keep = EMPTY_PLAN,
) => byBestReading({ regions: part.regions }, TEST_DIRECTIONS, features, verdicts, keep)

describe('an arrangement the rules chose', () => {
  it('cuts every face exactly once', () => {
    // The invariant everything else serves.
    const plan = run(part.features)
    const seen = new Set<number>()

    for (const feature of part.features) {
      if (!plan.assigned[feature.featureTag]?.rough) continue
      for (const idx of feature.regionIdxs) {
        expect(seen.has(idx)).toBe(false)
        seen.add(idx)
      }
    }
  })

  it('reaches the whole part', () => {
    // The threshold that decides whether a *better* reading is worth a
    // re-fixture is the wrong question about ground nobody cuts at all — a
    // patch worth less than two per cent used to be left, and the coverage bar
    // quietly read 94%.
    expect(coverageOf(part, part.features, run(part.features), 'rough').mapped).toBeCloseTo(1, 6)
  })

  it('takes the directions the part forces whatever else it decides', () => {
    // Drop one and a surface has nobody to cut it.
    const plan = run(part.features)

    expect(plan.setups.map((setup) => setup.directionIndex)).toContain(1)
  })

  it('never volunteers an undercut that something else can reach', () => {
    const ordinary = testFeature('wall', 'wall', UP, [0])
    const awkward = testFeature('slot', 'undercut_tslot', DOWN, [0])
    const plan = run([ordinary, awkward])

    expect(plan.assigned['slot']?.rough).toBeUndefined()
    expect(plan.assigned['wall']?.rough).toBeDefined()
  })
})

describe('score decides which reading cuts a face', () => {
  const refused = testFeature('refused', 'wall', UP, [0])
  const alright = testFeature('alright', 'wall', DOWN, [0])
  // Nine rules like the first and one refuses it, so it averages *better* than
  // the reading that merely scrapes through — and still carries a refusal.
  const verdicts = verdictsFor([
    ['refused', ['easy', 'easy', 'easy', 'easy', 'easy', 'easy', 'easy', 'easy', 'no go']],
    ['alright', ['alright']],
  ])

  const held = {
    setups: [setupFor(TEST_DIRECTIONS, 0, 0), setupFor(TEST_DIRECTIONS, 1, 1)],
    assigned: {},
  }

  it('has the two genuinely disagreeing', () => {
    // Without this the test below proves nothing.
    expect(scoreFeature(verdicts.get('refused')!)!).toBeGreaterThan(
      scoreFeature(verdicts.get('alright')!)!,
    )
    expect(verdicts.get('refused')!.band).toBe('no go')
  })

  it('takes the better average, both ways up being held', () => {
    /*
     * Score before band — the opposite of the picker, and deliberate. A band is
     * five buckets and a score is continuous, so band-first throws away every
     * distinction inside a bucket.
     */
    const plan = run([refused, alright], verdicts, held)

    expect(plan.assigned['refused']?.rough).toBeDefined()
    expect(plan.assigned['alright']?.rough).toBeUndefined()
  })

  it('so a reading a rule refuses can win a face — the cost of the trade', () => {
    /*
     * Named rather than hidden. The picker ordered band-first exactly to stop
     * this: the plan can now propose cutting a face a way one of the shop's own
     * limits refuses, because the rest of them like it. If that turns out to
     * bite, this is the test that describes what to put back.
     */
    const plan = run([refused, alright], verdicts, held)
    const winner = Object.keys(plan.assigned).find((tag) => plan.assigned[tag]?.rough)

    expect(verdicts.get(winner!)?.band).toBe('no go')
  })

  it('still buys the orientation the numbers favour, which is a different question', () => {
    // Whether a way up is worth a re-fixture is score-weighted area; which
    // reading cuts a face once it is held is the comparison above. Two
    // questions — and they now happen to agree, where before they did not.
    expect(run([refused, alright], verdicts).setups).toHaveLength(1)
  })
})

describe('what is already held has been paid for', () => {
  it('fills around the setups somebody chose rather than replacing them', () => {
    const wall = testFeature('wall', 'wall', UP, [0])
    const other = testFeature('other', 'wall', DOWN, [1])
    const setup = setupFor(TEST_DIRECTIONS, 0)
    const keep = { setups: [setup], assigned: { wall: { rough: setup.id, finish: setup.id } } }

    const plan = run([wall, other], new Map(), keep)

    // The held setup survives and keeps its work.
    expect(plan.setups.map((s) => s.id)).toContain(setup.id)
    expect(plan.assigned['wall']?.rough).toBe(setup.id)
  })

  it('leaves ground another setup already cuts alone', () => {
    // Work somebody has placed has been decided; an arrangement that quietly
    // re-cuts it overwrites a decision with a suggestion.
    const mine = testFeature('mine', 'wall', UP, [0])
    const alternative = testFeature('alternative', 'wall', DOWN, [0])
    const setup = setupFor(TEST_DIRECTIONS, 0)
    const keep = { setups: [setup], assigned: { mine: { rough: setup.id, finish: setup.id } } }

    const plan = run([mine, alternative], new Map(), keep)

    expect(plan.assigned['alternative']?.rough).toBeUndefined()
  })
})

describe('what a new orientation has to be worth', () => {
  it('does not buy one for a single small face', () => {
    /*
     * An orientation costs a re-fixture, a re-probe and a tool change. Without a
     * threshold any improvement at all justified one.
     */
    // The crumb is an *alternative* reading of ground already cut, not ground
    // nobody reaches — the threshold governs improvement, and a face nothing
    // cuts is bought whatever it is worth.
    const everything = testFeature('everything', 'profile', UP, [0, 1, 2, 3, 4, 5])
    const crumb = testFeature('crumb', 'wall', DOWN, [5])
    const plan = byBestReading(
      { regions: part.regions },
      TEST_DIRECTIONS,
      [everything, crumb],
      new Map(),
      EMPTY_PLAN,
      { ...NOTHING_CHARGED, planRules: [setups([1, 1, 1, 1])] },
    )

    expect(plan.setups).toHaveLength(1)
  })

  it('obeys a ceiling a shop has set', () => {
    const plan = byBestReading(
      { regions: part.regions },
      TEST_DIRECTIONS,
      part.features,
      new Map(),
      EMPTY_PLAN,
      { ...DEFAULT_PLAN_LIMITS, maxDirections: 1 },
    )

    expect(plan.setups.length).toBeLessThanOrEqual(1)
  })
})

describe('a direction that cuts nothing is not a setup', () => {
  it('leaves it out rather than listing a re-fixture that cuts nothing', () => {
    const plan = run(part.features)

    for (const setup of plan.setups) {
      const cuts = part.features.some(
        (feature) => plan.assigned[feature.featureTag]?.rough === setup.id,
      )
      expect(cuts).toBe(true)
    }
  })
})

describe('a reading is judged over its whole ground, not face by face', () => {
  /*
   * The bug Paul found: a slanted face scoring 40 cut a face that a wall
   * scoring 74 was plainly the better answer for.
   *
   * The rule this replaces asked a reading to beat the current holder of
   * *every* face it covers and refused it outright otherwise. So a three-face
   * wall whose other two faces were already better served was refused entirely
   * — and the face it *was* best for fell to the only reading left.
   */
  const regions = Array.from({ length: 3 }, (_, idx) => ({
    idx,
    splitOrigin: 0,
    shapeKind: 'Plane',
    area: 100,
    triangleStart: idx,
    triangleEnd: idx + 1,
  }))
  const part = { regions } as unknown as PartFaces

  const slanted = testFeature('slanted', 'slanted_face', TEST_DIRECTIONS[2]!, [2])
  const wall = testFeature('wall', 'wall', TEST_DIRECTIONS[3]!, [0, 1, 2])
  const best0 = testFeature('best0', 'face', UP, [0])
  const best1 = testFeature('best1', 'face', UP, [1])
  const all = [slanted, wall, best0, best1]

  const verdicts = verdictsFor([
    ['slanted', ['rats']],
    ['wall', ['easy', 'easy', 'alright']],
    ['best0', ['easy']],
    ['best1', ['easy']],
  ])

  const cutter = (
    plan: ReturnType<typeof byBestReading>,
    face: number,
    among: ReadonlyArray<PartFeature> = all,
  ) =>
    among.find((f) => f.regionIdxs.includes(face) && plan.assigned[f.featureTag]?.rough)?.featureTag

  it('lets the better reading take a face its other ground had blocked', () => {
    const plan = byBestReading(part, TEST_DIRECTIONS, all, verdicts, {
      setups: TEST_DIRECTIONS.map((_d, index) => setupFor(TEST_DIRECTIONS, index, index)),
      assigned: {},
    })

    expect(cutter(plan, 2)).toBe('wall')
  })

  it('never trades coverage away for a better score', () => {
    /*
     * A face cut badly is worth more than a face nobody cuts, so a swap that
     * would leave ground uncovered is refused however well it scores. Without
     * this the arrangement improves its average by cutting less of the part.
     */
    const wide = testFeature('wide', 'profile', UP, [0, 1, 2])
    const narrow = testFeature('narrow', 'face', TEST_DIRECTIONS[1]!, [0])
    const scores = verdictsFor([
      ['wide', ['meh']],
      ['narrow', ['easy']],
    ])

    const plan = byBestReading(part, TEST_DIRECTIONS, [wide, narrow], scores, {
      setups: TEST_DIRECTIONS.map((_d, index) => setupFor(TEST_DIRECTIONS, index, index)),
      assigned: {},
    })

    // `narrow` scores better but reaches one face; taking it would leave two
    // cut by nobody.
    expect(cutter(plan, 1, [wide, narrow])).toBe('wide')
    expect(cutter(plan, 2, [wide, narrow])).toBe('wide')
  })
})

describe('filling from what is already held', () => {
  const held = (index: number) => ({
    setups: [setupFor(TEST_DIRECTIONS, index, 0)],
    assigned: {},
  })

  it('buys nothing, however much a way up would be worth', () => {
    // The fixturing is already decided; this asks what it is worth, not what a
    // different fixturing would be worth.
    const mine = testFeature('mine', 'wall', UP, [0])
    const elsewhere = testFeature('elsewhere', 'wall', DOWN, [1])

    const plan = byBestReading(
      { regions: part.regions },
      TEST_DIRECTIONS,
      [mine, elsewhere],
      new Map(),
      held(0),
      DEFAULT_PLAN_LIMITS,
      false,
    )

    expect(plan.setups.map((setup) => setup.directionIndex)).toEqual([0])
    expect(plan.assigned['elsewhere']?.rough).toBeUndefined()
  })

  it('leaves ground uncut rather than bringing a forced direction into being', () => {
    // A face only one way up can reach is still not this arrangement's to buy.
    // The remedy is to hold that way up, which is somebody's decision to make.
    const onlyThere = testFeature('only-there', 'wall', DOWN, [4])

    const plan = byBestReading(
      { regions: part.regions },
      TEST_DIRECTIONS,
      [onlyThere],
      new Map(),
      held(0),
      DEFAULT_PLAN_LIMITS,
      false,
    )

    expect(plan.assigned['only-there']?.rough).toBeUndefined()
  })

  it('still makes the best of the ways up it does hold', () => {
    const poor = testFeature('poor', 'wall', UP, [0])
    const better = testFeature('better', 'face', UP, [0, 1])

    const plan = byBestReading(
      { regions: part.regions },
      TEST_DIRECTIONS,
      [poor, better],
      verdictsFor([
        ['poor', ['rats']],
        ['better', ['easy']],
      ]),
      held(0),
      DEFAULT_PLAN_LIMITS,
      false,
    )

    expect(plan.assigned['better']?.rough).toBeDefined()
    expect(plan.assigned['poor']?.rough).toBeUndefined()
  })

  it('does nothing at all with nothing held, which is the only honest answer', () => {
    const plan = byBestReading(
      { regions: part.regions },
      TEST_DIRECTIONS,
      part.features,
      new Map(),
      EMPTY_PLAN,
      DEFAULT_PLAN_LIMITS,
      false,
    )

    expect(plan.setups).toEqual([])
    expect(Object.keys(plan.assigned)).toEqual([])
  })
})

describe('a bigger reading does not win on size alone', () => {
  /*
   * The second bug Paul found: a 26-face contour scoring 58 displaced a 14-face
   * wall scoring 80, because it also reached twelve faces nobody held yet.
   *
   * Greedy pairwise comparison cannot see that those twelve could be covered by
   * something *else* without giving up the 80 — so free ground is filled first,
   * and by the time the swap is judged the alternative is already on the part.
   */
  const regions = Array.from({ length: 26 }, (_, idx) => ({
    idx,
    splitOrigin: 0,
    shapeKind: 'Plane',
    area: 100,
    triangleStart: idx,
    triangleEnd: idx + 1,
  }))
  const part26 = { regions } as unknown as PartFaces

  const fourteen = Array.from({ length: 14 }, (_, i) => i)
  const twelve = Array.from({ length: 12 }, (_, i) => i + 14)

  const wall = testFeature('wall', 'wall', UP, fourteen)
  const contour = testFeature('contour', 'contour_surface', DOWN, [...fourteen, ...twelve])
  const other = testFeature('other', 'contour_surface', TEST_DIRECTIONS[2]!, twelve)
  const all = [wall, contour, other]

  const verdicts = verdictsFor([
    ['wall', ['easy']],
    ['contour', ['meh']],
    ['other', ['alright']],
  ])

  const held = {
    setups: TEST_DIRECTIONS.map((_d, index) => setupFor(TEST_DIRECTIONS, index, index)),
    assigned: {},
  }

  it('keeps the better reading and covers the rest from somewhere else', () => {
    const plan = byBestReading(part26, TEST_DIRECTIONS, all, verdicts, held)

    expect(plan.assigned['wall']?.rough).toBeDefined()
    expect(plan.assigned['other']?.rough).toBeDefined()
    expect(plan.assigned['contour']?.rough).toBeUndefined()
  })

  it('still takes the bigger reading when nothing else reaches that ground', () => {
    // Without `other`, the twelve faces have no second answer — and a face cut
    // at 58 is worth more than a face cut by nobody.
    const plan = byBestReading(part26, TEST_DIRECTIONS, [wall, contour], verdicts, held)

    expect(plan.assigned['contour']?.rough).toBeDefined()
  })
})

describe('the order the directions are listed in', () => {
  it('puts the way up that cuts most of the part first', () => {
    /*
     * The order they were bought in is the order the algorithm happened to need
     * them, which means nothing to anybody reading the list. Area does: the
     * first direction is where most of the part gets made, and the last is the
     * one worth arguing about dropping.
     */
    const small = testFeature('small', 'wall', UP, [0])
    const large = testFeature('large', 'profile', DOWN, [1, 2, 3, 4])
    const plan = run([small, large])

    const first = plan.setups[0]!
    expect(plan.assigned['large']?.rough).toBe(first.id)
    expect(first.name).toMatch(/^Direction 1, /)
    expect(plan.setups[1]?.name).toMatch(/^Direction 2, /)
  })
})

describe('a big mediocre reading is not unassailable', () => {
  /*
   * The case from the screenshots: a thirteen-face contour scoring 22 held a
   * face that a one-face reading scored 100 on, and a nearby wall scored 64 on.
   *
   * The swap was refused because dropping the contour looked like losing its
   * other twelve faces — when almost all of them had a better answer waiting.
   * Stranded ground is not lost ground: `assignHeld` offers it to everything
   * else on the next pass, so it is worth its best remaining answer.
   */
  const regions = Array.from({ length: 13 }, (_, idx) => ({
    idx,
    splitOrigin: 0,
    shapeKind: 'Plane',
    area: 100,
    triangleStart: idx,
    triangleEnd: idx + 1,
  }))
  const part13 = { regions } as unknown as PartFaces
  const every = Array.from({ length: 13 }, (_, i) => i)

  // Off-axis, big, and poor — exactly the reading that was winning.
  const contour = testFeature('contour', 'contour_surface', { x: 0, y: -0.31, z: 0.95 }, every)
  // The excellent one-face reading it was beating.
  const best = testFeature('best', 'face', UP, [0])
  // And decent answers for everything the contour would strand.
  const rest = every.slice(1).map((idx) => testFeature(`rest-${String(idx)}`, 'wall', DOWN, [idx]))
  const all = [contour, best, ...rest]

  const verdicts = verdictsFor([
    ['contour', ['rats']],
    ['best', ['easy']],
    ...rest.map((f) => [f.featureTag, ['alright']] as const),
  ])

  const held = {
    setups: [
      setupFor(TEST_DIRECTIONS, 0, 0),
      setupFor(TEST_DIRECTIONS, 1, 1),
      { id: 'off', directionIndex: 2, name: 'off-axis', direction: contour.machiningDirection },
    ],
    assigned: {},
  }

  it('gives the face to the reading that is best on it', () => {
    const plan = byBestReading(
      part13,
      [...TEST_DIRECTIONS.slice(0, 2), contour.machiningDirection],
      all,
      verdicts,
      held,
    )

    expect(plan.assigned['best']?.rough).toBeDefined()
    expect(plan.assigned['contour']?.rough).toBeUndefined()
  })

  it('still covers everything the displaced reading was holding', () => {
    // The point of valuing stranded ground at its fallback is that the fallback
    // actually arrives — otherwise this is a trade for a hole in the part.
    const plan = byBestReading(
      part13,
      [...TEST_DIRECTIONS.slice(0, 2), contour.machiningDirection],
      all,
      verdicts,
      held,
    )

    expect(coverageOf(part13, all, plan, 'rough').mapped).toBeCloseTo(1, 6)
  })
})

describe('a reading that may cut part of what it covers', () => {
  /*
   * The complaint that made this necessary: taken whole or not at all,
   * one contested face costs a reading every face it covers, and they go to
   * whatever smaller readings come after it — a wall scoring 5 holding a face a
   * pocket scores 77 on, from a way up already held.
   */
  const pocket = testFeature('pocket', 'pocket', TEST_DIRECTIONS[0]!, [0, 1])
  const wall = testFeature('wall', 'wall', TEST_DIRECTIONS[0]!, [0])
  const other = testFeature('other', 'face', TEST_DIRECTIONS[0]!, [1])
  const all = [pocket, wall, other]

  /** `other` beats the pocket on face 1, and blocks it there. */
  const verdicts = verdictsFor([
    ['pocket', ['alright']],
    ['wall', ['no go']],
    ['other', ['easy']],
  ])

  const held = { setups: [setupFor(TEST_DIRECTIONS, 0, 0)], assigned: {} }

  // `gainToMove` and the size floor are the *other* question — whether a split
  // is worth an operation. These are about whether it is possible at all.
  const arrange = (partial: boolean) =>
    byBestReading(
      { regions: part.regions },
      TEST_DIRECTIONS,
      all,
      verdicts,
      held,
      NOTHING_CHARGED,
      false,
      false,
      PASSES,
      partial,
    )

  it('cuts every face by the best reading of it, rather than losing the lot', () => {
    const plan = arrange(true)
    const cut = new Set(all.flatMap((feature) => cutRegions(plan, feature, 'rough')))

    expect([...cut].sort((a, b) => a - b)).toEqual([0, 1])
    // Face 0 goes to the pocket, not to the wall the rules refuse.
    expect(cutRegions(plan, pocket, 'rough')).toContain(0)
    expect(cutRegions(plan, wall, 'rough')).toEqual([])
  })

  it('says what the pocket gave up, which is the note the plan has always carried', () => {
    // Face 1 went to `other`, and the pocket keeps face 0 and records the loss.
    const plan = arrange(true)

    expect(plan.assigned['pocket']?.without?.rough).toEqual([1])
  })

  it('still takes readings whole when it is not allowed to split them', () => {
    const plan = arrange(false)

    expect(plan.assigned['pocket']?.without).toBeUndefined()
  })
})

describe('what a shop will not cut at all', () => {
  /*
   * A band is the worst rule that fired, so a floor is a refusal rather than a
   * preference — and until now a reading the limits called `no go` could still
   * win a face by averaging well across everything else.
   */
  const bad = testFeature('bad', 'wall', TEST_DIRECTIONS[0]!, [0])
  const good = testFeature('good', 'face', TEST_DIRECTIONS[1]!, [0])
  const only = testFeature('only', 'wall', TEST_DIRECTIONS[0]!, [3])

  const arrange = (all: ReadonlyArray<PartFeature>, worstBand?: Parameters<typeof bandRank>[0]) =>
    byBestReading(
      { regions: part.regions },
      TEST_DIRECTIONS,
      all,
      verdictsFor([
        ['bad', ['no go']],
        ['good', ['meh']],
        ['only', ['no go']],
      ]),
      { setups: [setupFor(TEST_DIRECTIONS, 0, 0), setupFor(TEST_DIRECTIONS, 1, 1)], assigned: {} },
      { ...NOTHING_CHARGED, worstBand },
      false,
      false,
      PASSES,
      true,
    )

  it('gives the face to a reading above the floor, whatever the refused one scores', () => {
    const plan = arrange([bad, good], 'rats')

    expect(cutRegions(plan, good, 'rough')).toEqual([0])
    expect(cutRegions(plan, bad, 'rough')).toEqual([])
  })

  it('still cuts a face nothing else reaches, because uncut is not an improvement', () => {
    // A last resort, not a ban.
    const plan = arrange([only], 'rats')

    expect(cutRegions(plan, only, 'rough')).toEqual([3])
  })

  it('refuses nothing when no floor is set, which is every plan before this', () => {
    const plan = arrange([bad, good])

    expect(cutRegions(plan, bad, 'rough').length + cutRegions(plan, good, 'rough').length).toBe(1)
  })
})

describe('how many setups the shop will accept', () => {
  const scale = (rules: ReadonlyArray<Rule>) => scaleFor({ planRules: rules }, 'setups')

  it('reads a count off the band scale, inclusive at each limit', () => {
    const held = scale([setups([2, 3, 4, 5])])!

    expect(bandOnScale(held, 1)).toBe('easy')
    expect(bandOnScale(held, 2)).toBe('easy')
    expect(bandOnScale(held, 3)).toBe('alright')
    expect(bandOnScale(held, 5)).toBe('rats')
  })

  // Past every limit with no refusal set, the scale keeps going at its worst
  // band rather than falling off the end — expensive, never refused, which is
  // what "nothing refused by default" has to mean here.
  it('stays at rats past the end when no refusal is set', () => {
    expect(bandOnScale(scale([setups([2, 3, 4, 5])])!, 40)).toBe('rats')
  })

  it('refuses past the no go, and only past it', () => {
    const held = scale([setups([1, 2, 3, 4], 4)])!

    expect(bandOnScale(held, 4)).toBe('rats')
    expect(bandOnScale(held, 5)).toBe('no go')
  })

  // A refusal may only push the last boundary out, never pull it in: "rats up
  // to five, no go past two" is a rule half-edited, and reading it as a wall at
  // two would hide the five somebody typed.
  it('will not let a refusal below the rats limit pull the scale in', () => {
    expect(bandOnScale(scale([setups([2, 3, 4, 5], 2)])!, 5)).toBe('rats')
  })

  it('prices each way up by the band the plan would land in', () => {
    expect(BAND_PRICE.easy).toBe(1)
    expect(BAND_PRICE.alright).toBe(2)
    expect(BAND_PRICE.rats).toBe(8)
    expect(BAND_PRICE['no go']).toBe(Number.POSITIVE_INFINITY)
  })

  /*
   * Off is off, the same as it is for a rule that judges a feature.
   *
   * Not "easy at any count", which would still charge the base price — a shop
   * switching a rule off is saying it does not care, and charging it anyway is
   * the app disagreeing quietly.
   */
  it('charges nothing where the rule is switched off', () => {
    expect(scale([{ ...setups([2, 3, 4, 5]), enabled: false }])).toBeNull()
    expect(scale([])).toBeNull()
  })

  // The old ceiling was the shop's whole statement about setups, and it was a
  // wall rather than a price — so it becomes one, with nothing charged below it.
  it('folds an old ceiling into a wall that charges nothing below it', () => {
    const held = scaleFor({ maxDirections: 2 }, 'setups')!

    expect(bandOnScale(held, 2)).toBe('easy')
    expect(bandOnScale(held, 3)).toBe('no go')
    expect(held.free).toBe(true)
  })
})

describe('which limits actually did anything', () => {
  /*
   * The question a panel of six prices cannot answer for itself. A shop moves a
   * number, presses generate, and the plan comes back the same — with no way to
   * tell whether the number is wrong, is right and irrelevant on this part, or
   * was never reached. Three different situations that looked identical.
   *
   * A count of **decisions that went differently because of it**, never times
   * it was consulted: a price checked four hundred times that blocked nothing
   * did nothing.
   */
  const spend = (limits: Parameters<typeof byBestReading>[5]) =>
    byBestReading(
      { regions: part.regions },
      TEST_DIRECTIONS,
      part.features,
      new Map<string, FeatureVerdict>(),
      EMPTY_PLAN,
      limits,
    )

  // Both part rules off is a shop saying it does not care about either, and
  // nothing is charged — so nothing can have been refused for a price.
  it('reports nothing bitten where neither part rule is in force', () => {
    spend({ planRules: [] })

    const bit = whatBit()
    expect(bit.gainToMove).toBe(0)
    expect(bit.worthAnOperation).toBe(0)
    expect(bit.sliverFloor).toBe(0)
    expect(bit.worstBand).toBe(0)
  })

  it('counts the ways up a refusal stopped being bought', () => {
    spend({ ...DEFAULT_PLAN_LIMITS, planRules: [setups([1, 1, 1, 1], 1)] })

    expect(whatBit().waysUp).toBeGreaterThan(0)
  })

  // A fresh ledger per run, or the panel reads a mixture of two arrangements —
  // and the second of two runs would look like it did twice the work.
  it('starts again on every run rather than accumulating', () => {
    const limits: PlanLimits = { ...DEFAULT_PLAN_LIMITS, planRules: [setups([1, 1, 1, 1], 1)] }

    spend(limits)
    const once = whatBit().waysUp

    spend(limits)
    expect(whatBit().waysUp).toBe(once)
  })

  it('says whether it settled or ran out of rounds', () => {
    spend({ ...DEFAULT_PLAN_LIMITS, rounds: 1 })

    expect(whatBit().rounds).toEqual({ used: 1, capped: true })
  })

  // Nothing judged these readings, so the unjudged default is what ranked every
  // one of them — a part where that is true is a part whose plan rests on a
  // number nobody set deliberately, and it should say so.
  it('counts readings no rule reached', () => {
    spend(DEFAULT_PLAN_LIMITS)

    expect(whatBit().unjudgedRank).toBe(part.features.length)
  })
})

describe('what a shop has already said it will not cut', () => {
  /*
   * The floor is set to `no go` by default.
   *
   * It was off, on the reasoning that a refusal applied unasked would leave
   * ground uncut. That is not what it does — a refused reading may still cut a
   * face nothing else reaches, and only loses the right to take one from a
   * reading above the floor. So the default is the thing the shop's own rules
   * already say.
   */
  it('refuses a no go reading out of the shipped defaults', () => {
    expect(DEFAULT_PLAN_LIMITS.worstBand).toBe('no go')
  })

  // The half that makes the default safe. Nothing else reads face 5, so the
  // refused reading keeps it: a face cut badly is worth more than a face cut
  // by nobody.
  it('still lets a refused reading cut ground nothing else reaches', () => {
    const lonely = testFeature('lonely', 'wall', UP, [5])
    const plan = byBestReading(
      { regions: part.regions },
      TEST_DIRECTIONS,
      [lonely],
      verdictsFor([['lonely', ['no go']]]),
      EMPTY_PLAN,
      DEFAULT_PLAN_LIMITS,
    )

    expect(cutRegions(plan, lonely, 'rough')).toEqual([5])
  })
})

describe('whether a feature may come apart', () => {
  /*
   * A yes or no, where a scale over "how much work should one operation do"
   * used to be. That priced the same question in points and per cent and
   * average faces, and the question underneath was always this one.
   *
   * The pocket covers three faces and the wall covers one of them, better. Off,
   * the pocket is taken whole and the wall gets nothing; on, the wall takes its
   * face and the pocket keeps the other two.
   */
  const pocket = testFeature('pocket', 'pocket', TEST_DIRECTIONS[0]!, [0, 1, 2])
  const wall = testFeature('wall', 'wall', TEST_DIRECTIONS[1]!, [2])
  const all = [pocket, wall]

  const arrange = (limits: PlanLimits) =>
    byBestReading(
      { regions: part.regions },
      TEST_DIRECTIONS,
      all,
      verdictsFor([
        ['pocket', ['meh']],
        ['wall', ['easy']],
      ]),
      { setups: [setupFor(TEST_DIRECTIONS, 0, 0), setupFor(TEST_DIRECTIONS, 1, 1)], assigned: {} },
      limits,
      false,
      false,
      PASSES,
      // Undefined: the rule decides, which is the whole point of the change.
      undefined,
    )

  it('splits where the rules say a feature may come apart', () => {
    const plan = arrange({ ...NOTHING_CHARGED, splitFeatures: true })

    expect(cutRegions(plan, wall, 'rough')).toEqual([2])
    expect(cutRegions(plan, pocket, 'rough')).toEqual([0, 1])
  })

  it('takes a reading whole where they say it may not', () => {
    const plan = arrange({ ...NOTHING_CHARGED, splitFeatures: false })

    expect(cutRegions(plan, wall, 'rough')).toEqual([])
    expect(cutRegions(plan, pocket, 'rough')).toEqual([0, 1, 2])
  })

  // The shipped answer. It is what the rules are for: each face to whatever
  // cuts it best, and the reading it came from still cuts the rest.
  it('may split, out of the shipped defaults', () => {
    expect(DEFAULT_PLAN_LIMITS.splitFeatures).toBe(true)
  })

  /*
   * An explicit argument still wins, and lasts one run.
   *
   * A generator press is a question about *this* plan; the rule is the shop's
   * usual answer. Without the override the chooser's tick would be a lie.
   */
  it('lets one run say otherwise without editing the rules', () => {
    const plan = byBestReading(
      { regions: part.regions },
      TEST_DIRECTIONS,
      all,
      verdictsFor([
        ['pocket', ['meh']],
        ['wall', ['easy']],
      ]),
      { setups: [setupFor(TEST_DIRECTIONS, 0, 0), setupFor(TEST_DIRECTIONS, 1, 1)], assigned: {} },
      { ...NOTHING_CHARGED, splitFeatures: true },
      false,
      false,
      PASSES,
      false,
    )

    expect(cutRegions(plan, pocket, 'rough')).toEqual([0, 1, 2])
  })
})

describe('a wall the geometry will not respect', () => {
  /*
   * Filed for months as "maxDirections: 2 yields three directions", which
   * reads as an arrangement that cannot count. It is not.
   *
   * A refusal past two ways up is a statement about **choices**. A forced
   * direction is not one — it is the only thing that reaches an undercut, and
   * dropping it would leave the part uncut rather than cheaply arranged. So
   * geometry wins, and what was actually wrong is that it happened in silence.
   */
  const spend = (limits: PlanLimits) =>
    byBestReading(
      { regions: part.regions },
      TEST_DIRECTIONS,
      part.features,
      new Map<string, FeatureVerdict>(),
      EMPTY_PLAN,
      limits,
    )

  it('still buys a way up the geometry forces past the wall', () => {
    const plan = spend({ ...DEFAULT_PLAN_LIMITS, planRules: [setups([1, 1, 1, 1], 1)] })

    // A part needing more than one way up gets them: a wall is not a reason to
    // leave ground uncut.
    expect(plan.setups.length).toBeGreaterThanOrEqual(1)
  })

  it('says how many it was forced past the wall to run', () => {
    spend({ ...DEFAULT_PLAN_LIMITS, planRules: [setups([1, 1, 1, 1], 1)] })

    // One wall at a count of one, so every setup past the first is forced.
    const plan = spend({ ...DEFAULT_PLAN_LIMITS, planRules: [setups([1, 1, 1, 1], 1)] })

    expect(whatBit().waysUpForced).toBe(Math.max(0, plan.setups.length - 1))
  })

  // Nothing to report where the plan is inside the wall, and nothing to report
  // where no wall was set.
  it('says nothing when the plan is within what the shop asked for', () => {
    spend({ ...DEFAULT_PLAN_LIMITS, planRules: [setups([9, 9, 9, 9], 9)] })
    expect(whatBit().waysUpForced).toBe(0)

    spend({ ...DEFAULT_PLAN_LIMITS, planRules: [] })
    expect(whatBit().waysUpForced).toBe(0)
  })
})

describe('a setup somebody has settled', () => {
  /*
   * The one place the app's own rule broke down. **Generate composes, the two
   * modes correct** — except a generator wrote a whole arrangement over the top
   * of ten minutes of correcting, with no warning, so an offer could quietly
   * un-correct a correction.
   *
   * A lock says "this is a decision, not a suggestion".
   */
  const pocket = testFeature('pocket', 'pocket', UP, [0, 1, 2])
  const wall = testFeature('wall', 'wall', DOWN, [2])
  const all = [pocket, wall]

  // The wall is settled on its way up, and scores badly. Nothing should care.
  const settled = () => {
    const setups = [
      setupFor(TEST_DIRECTIONS, 0, 0),
      { ...setupFor(TEST_DIRECTIONS, 1, 1), locked: true },
    ]

    return {
      setups,
      assigned: { wall: { rough: setups[1]!.id, finish: setups[1]!.id } },
    }
  }

  const arrange = () =>
    byBestReading(
      { regions: part.regions },
      TEST_DIRECTIONS,
      all,
      verdictsFor([
        ['pocket', ['easy']],
        ['wall', ['no go']],
      ]),
      settled(),
      NOTHING_CHARGED,
    )

  it('keeps what a locked setup cuts, however badly it scores', () => {
    expect(cutRegions(arrange(), wall, 'rough')).toEqual([2])
  })

  it('leaves the rest of the part to the offer', () => {
    // The pocket still gets the faces the lock does not hold.
    expect(cutRegions(arrange(), pocket, 'rough')).toEqual([0, 1])
  })

  // Without the lock the pocket takes the face outright — which is the
  // behaviour the lock exists to stop, and worth pinning so the test cannot
  // pass for the wrong reason.
  it('is the lock doing it, not the arrangement', () => {
    const open = {
      setups: [setupFor(TEST_DIRECTIONS, 0, 0), setupFor(TEST_DIRECTIONS, 1, 1)],
      assigned: {},
    }
    const plan = byBestReading(
      { regions: part.regions },
      TEST_DIRECTIONS,
      all,
      verdictsFor([
        ['pocket', ['easy']],
        ['wall', ['no go']],
      ]),
      open,
      NOTHING_CHARGED,
    )

    expect(cutRegions(plan, wall, 'rough')).toEqual([])
  })
})
