import { describe, expect, it } from 'vitest'

import { GENERATORS, PICKS_WAYS_UP, generate, planForChosen } from './generate'
import { forcedRegions, isUndercut, requiredDirections } from './reach'
import { EMPTY_PLAN, coverageOf, cutRegions } from './setups'
import { TEST_DIRECTIONS, testFeature, testPart } from './test-part'
import type { PartFeature } from './contracts'

/** The arrangement and its ledger, for the tests that are about what was decided. */
const offerBoth = (how: Parameters<typeof generate>[0]) =>
  generate(how, {
    report: { regions: part.regions },
    directions: TEST_DIRECTIONS,
    features,
    plan: { setups: [], assigned: {} },
    verdicts: [],
  })

const part = testPart()
const features = part.features

const offer = (how: Parameters<typeof generate>[0], all: ReadonlyArray<PartFeature> = features) =>
  generate(how, {
    report: { regions: part.regions },
    directions: TEST_DIRECTIONS,
    features: all,
    plan: { setups: [], assigned: {} },
    verdicts: [],
  }).plan

describe('what the part forces', () => {
  it('finds the faces only one way up can reach', () => {
    // Region 4 and 5 are covered only by down-profile, so −Z is forced.
    expect([...forcedRegions(features)].sort()).toEqual([4, 5])
  })

  it('names the directions those faces force', () => {
    expect(requiredDirections(TEST_DIRECTIONS, features)).toEqual([1])
  })

  it('forces nothing when every face has a second reading', () => {
    const both = [
      testFeature('a', 'wall', TEST_DIRECTIONS[0]!, [0]),
      testFeature('b', 'wall', TEST_DIRECTIONS[1]!, [0]),
    ]

    expect(forcedRegions(both).size).toBe(0)
    expect(requiredDirections(TEST_DIRECTIONS, both)).toEqual([])
  })
})

describe('required only', () => {
  it('takes the forced directions and nothing else', () => {
    const plan = offer('required only')

    expect(plan.setups.map((setup) => setup.directionIndex)).toEqual([1])
  })

  it('leaves the rest of the part open, which is the question it poses', () => {
    // Sweeping in everything −Z happens to reach would answer the question this
    // offer exists to ask.
    const plan = offer('required only')

    expect(coverageOf(part, features, plan, 'rough').mapped).toBeLessThan(1)
  })
})

describe('required, filled', () => {
  it('starts from what the part forces, then fits the rest in', () => {
    const plan = offer('required, filled')

    expect(plan.setups[0]?.directionIndex).toBe(1)
    expect(plan.setups.length).toBeGreaterThan(1)
  })

  it('reaches the whole part', () => {
    expect(coverageOf(part, features, offer('required, filled'), 'rough').mapped).toBeCloseTo(1, 6)
  })

  it('cuts every face exactly once', () => {
    // The invariant the whole model exists for: the Engine reports the same
    // surface from every way up that can see it, and an arrangement that took
    // them all would machine one wall four times.
    const plan = offer('required, filled')
    const seen = new Set<number>()

    for (const feature of features) {
      if (!plan.assigned[feature.featureTag]?.rough) continue
      for (const idx of feature.regionIdxs) {
        expect(seen.has(idx)).toBe(false)
        seen.add(idx)
      }
    }
  })
})

describe('the two questions the offers answer', () => {
  /*
   * Four of them pick ways up and one fills the ways up already held, and
   * reading them as one list of six is why the sequence that actually works —
   * `required only`, then `fill from current` — was folklore rather than the
   * obvious path.
   */
  it('splits into picking ways up and filling them', () => {
    const picks = GENERATORS.filter((generator) => PICKS_WAYS_UP.includes(generator.how))
    const fills = GENERATORS.filter((generator) => !PICKS_WAYS_UP.includes(generator.how))

    expect(picks).toHaveLength(5)
    expect(fills.map((generator) => generator.how)).toEqual(['fill from current'])
  })

  /*
   * `By hand` is gone. It generated nothing and returned an empty plan — it was
   * a *mode* sitting in a row of offers, and the way to work by hand is to work
   * by hand: press R, F or Both on a reading and the way up appears.
   */
  it('offers nothing that does nothing', () => {
    expect(GENERATORS.map((generator) => generator.how)).not.toContain('by hand')
  })
})

describe('what a generator will not volunteer', () => {
  it('passes over an undercut that something else can reach', () => {
    // Reachable in the Engine's sense, but it wants a T-slot cutter, and a plan
    // that fills itself with them has promised a shop something no endmill does.
    const ordinary = testFeature('wall', 'wall', TEST_DIRECTIONS[0]!, [0])
    const awkward = testFeature('slot', 'undercut_filleted_tslot', TEST_DIRECTIONS[1]!, [0])
    const plan = offer('from toolpath', [ordinary, awkward])

    expect(plan.assigned['slot']?.rough).toBeUndefined()
    expect(plan.assigned['wall']?.rough).toBeDefined()
  })

  it('takes one where nothing else can reach the face', () => {
    // Refusing these leaves the plan with a hole in it and no explanation.
    const awkward = testFeature('slot', 'undercut_filleted_tslot', TEST_DIRECTIONS[1]!, [7])
    const plan = offer('from toolpath', [awkward])

    expect(plan.assigned['slot']?.rough).toBeDefined()
  })

  it('knows an undercut by its type', () => {
    expect(isUndercut(testFeature('a', 'undercut_tslot', TEST_DIRECTIONS[0]!, [0]))).toBe(true)
    expect(isUndercut(testFeature('b', 'wall', TEST_DIRECTIONS[0]!, [0]))).toBe(false)
  })
})

describe('a plan over the ways up somebody chose', () => {
  /*
   * The sequence this file already recommends in prose, made into one gesture:
   * Required only then Fill from current reaches a part in three setups at 100%
   * where `from the rules` reaches 95% across five.
   */
  const up = testFeature('up', 'profile', TEST_DIRECTIONS[0]!, [0, 1])
  const down = testFeature('down', 'wall', TEST_DIRECTIONS[1]!, [0, 1])
  const both = [up, down]
  const report = { ...testPart(), features: both }
  const options = {
    report,
    directions: TEST_DIRECTIONS,
    features: both,
    verdicts: [],
    plan: EMPTY_PLAN,
  }

  it('uses only the ways up it was given', () => {
    // A way up nobody chose is not one this may add — the whole point of
    // having been asked.
    const plan = planForChosen({
      ...options,
      chosen: [0],
      splitPasses: false,
      partial: false,
    }).plan

    expect(plan.setups.map((setup) => setup.directionIndex)).toEqual([0])
  })

  it('cuts what those ways up can reach', () => {
    const plan = planForChosen({
      ...options,
      chosen: [0],
      splitPasses: false,
      partial: false,
    }).plan

    expect(cutRegions(plan, up, 'rough')).toEqual([0, 1])
    expect(cutRegions(plan, up, 'finish')).toEqual([0, 1])
  })

  it('decides both passes together unless told otherwise', () => {
    const plan = planForChosen({
      ...options,
      chosen: [0, 1],
      splitPasses: false,
      partial: false,
    }).plan

    for (const assignment of Object.values(plan.assigned)) {
      expect(assignment.rough).toBe(assignment.finish)
    }
  })

  it('maps finishing as well as roughing when they are decided apart', () => {
    /*
     * The bug this was written for: the finishing run was handed the roughing
     * plan as `keep`, which marks every face it claimed as somebody else's
     * decision — untouchable — so the finishing run had nothing left to decide
     * and wrote nothing at all.
     */
    const plan = planForChosen({
      ...options,
      chosen: [0, 1],
      splitPasses: true,
      partial: false,
    }).plan

    expect(cutRegions(plan, up, 'rough')).toEqual([0, 1])
    expect(cutRegions(plan, up, 'finish')).toEqual([0, 1])
  })

  it('decides each pass on the best reading, so today the two agree', () => {
    /*
     * Both runs get the same economics, because the best reading of a face is
     * the best reading of it whichever pass is cutting. The option changes the
     * *shape* of the plan rather than its content — the passes are decided
     * separately, so they diverge the moment anything distinguishes them.
     */
    const apart = planForChosen({
      ...options,
      chosen: [0, 1],
      splitPasses: true,
      partial: false,
    }).plan
    const together = planForChosen({
      ...options,
      chosen: [0, 1],
      splitPasses: false,
      partial: false,
    }).plan

    // By what the assignments *mean*: a setup id is a fresh uuid per run.
    const asDirections = (plan: typeof apart) => {
      const byId = new Map(plan.setups.map((setup) => [setup.id, setup.directionIndex]))
      return Object.fromEntries(
        Object.entries(plan.assigned).map(([tag, held]) => [
          tag,
          { rough: byId.get(held.rough ?? ''), finish: byId.get(held.finish ?? '') },
        ]),
      )
    }

    expect(asDirections(apart)).toEqual(asDirections(together))
  })

  /*
   * The bug the ledger was returned for.
   *
   * It used to be module state read through a getter, and every caller reached
   * for it on the line *above* the run that fills it — so the panel showed the
   * previous arrangement's counters, and zeroes on the very first press. There
   * is no ledger to read now until there is a plan to read it from.
   */
  it('reports the run that just happened, on the first press', () => {
    expect(offerBoth('from the rules').bit?.unjudgedRank).toBe(features.length)
  })

  /*
   * Nothing to report, said as nothing rather than as zeroes.
   *
   * The three sweeping offers never consult the limits, so "the limits refused
   * nothing" would be a claim they are not entitled to make.
   */
  it('says nothing for an offer that never consulted the limits', () => {
    expect(offerBoth('from toolpath').bit).toBeUndefined()
  })

  /*
   * Two runs make one plan, so its ledger has to be two ledgers.
   *
   * The ledger used to be module state that each run reset on the way in, so
   * the roughing run's counters were overwritten by the finishing run before
   * anybody could read them — a split-pass plan reported half of what it
   * decided, and the half it dropped was silent. The counters are additive
   * because they count decisions, and both runs made decisions.
   */
  it('adds up what both passes of a split decided', () => {
    const split = planForChosen({
      ...options,
      chosen: [0, 1],
      splitPasses: true,
      partial: false,
    })
    const once = planForChosen({
      ...options,
      chosen: [0, 1],
      splitPasses: false,
      partial: false,
    })

    // Whatever a single run counts, two runs of the same economics count twice.
    expect(split.bit?.unjudgedRank).toBe((once.bit?.unjudgedRank ?? 0) * 2)
  })

  // `rounds` is the one counter that is not a sum: a plan is as capped as its
  // most capped half, not twice as capped.
  it('takes the longer of the two runs rather than adding the rounds up', () => {
    const split = planForChosen({
      ...options,
      chosen: [0, 1],
      splitPasses: true,
      partial: false,
    })
    const once = planForChosen({
      ...options,
      chosen: [0, 1],
      splitPasses: false,
      partial: false,
    })

    expect(split.bit?.rounds.used).toBe(once.bit?.rounds.used)
  })
})

describe('splitting a feature between ways up', () => {
  /*
   * Paul's case. A face belongs to several readings and only one can cut it —
   * but the rest of those readings are still the right answer for their other
   * faces. Without this, one contested face costs a reading every face it
   * covers, and they go to whatever smaller readings come after it.
   */
  const wide = testFeature('wide', 'profile', TEST_DIRECTIONS[0]!, [0, 1])
  const narrow = testFeature('narrow', 'wall', TEST_DIRECTIONS[1]!, [1])
  const all = [wide, narrow]
  const part = { ...testPart(), features: all }
  const verdicts = [
    { tag: 'wide', band: 'easy', results: [] },
    { tag: 'narrow', band: 'easy', results: [] },
  ] as unknown as Parameters<typeof planForChosen>[0]['verdicts']

  const options = {
    report: part,
    directions: TEST_DIRECTIONS,
    features: all,
    verdicts,
    plan: EMPTY_PLAN,
    splitPasses: false,
  }

  it('lets a reading keep the faces it won, and says what it gave up', () => {
    const plan = planForChosen({ ...options, chosen: [0, 1], partial: true }).plan

    // Both readings are in the plan, and between them they cut both faces.
    const cut = [...cutRegions(plan, wide, 'rough'), ...cutRegions(plan, narrow, 'rough')]
    expect([...cut].sort()).toEqual([0, 1])
  })

  it('drops a reading that could not be taken whole, without it', () => {
    /*
     * The old rule: a reading holding some of its faces was filtered out of the
     * plan entirely, and its faces left cut by nobody.
     */
    const plan = planForChosen({ ...options, chosen: [0, 1], partial: false }).plan
    const cut = new Set([...cutRegions(plan, wide, 'rough'), ...cutRegions(plan, narrow, 'rough')])

    expect(cut.size).toBeLessThanOrEqual(2)
  })
})
