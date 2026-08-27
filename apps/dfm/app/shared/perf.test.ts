import { describe, it, expect } from 'vitest'
import { byBestReading } from './best-reading'
import { EMPTY_PLAN, PASSES, setupFor } from './setups'
import type { SetupPlan } from './setups'
import { testFeature } from './test-part'
import type { FeatureVerdict, RuleResult } from './rules'
import type { PartFaces } from './setups'
import type { PartFeature } from './contracts'

const DIRS = [
  { x: 0, y: 0, z: 1 },
  { x: 0, y: 0, z: -1 },
  { x: 1, y: 0, z: 0 },
  { x: -1, y: 0, z: 0 },
  { x: 0, y: 1, z: 0 },
  { x: 0, y: -0.31, z: 0.95 },
]
const F = 108
const regions = Array.from({ length: F }, (_, idx) => ({
  idx,
  splitOrigin: 0,
  shapeKind: 'Plane',
  area: 100,
  triangleStart: idx,
  triangleEnd: idx + 1,
}))
const part = { regions } as unknown as PartFaces

// ~200 readings: each direction gets a spread of small and large features.
const features: PartFeature[] = []
DIRS.forEach((d, di) => {
  for (let i = 0; i < 25; i++) {
    const size = (i % 5) + 1
    const start = (i * 7 + di * 3) % F
    const idxs = Array.from({ length: size }, (_, k) => (start + k) % F)
    features.push(testFeature(`d${di}-f${i}`, i % 4 === 0 ? 'contour_surface' : 'wall', d, idxs))
  }
  const wide = Array.from({ length: 13 }, (_, k) => (di * 5 + k) % F)
  features.push(testFeature(`d${di}-wide`, 'contour_surface', d, wide))
})

const rule = () => ({ weight: 1 }) as unknown as RuleResult['rule']
const BANDS = ['easy', 'alright', 'meh', 'rats', 'no go'] as const
const verdicts = new Map<string, FeatureVerdict>(
  features.map((f, i) => {
    const band = BANDS[i % 5]!
    return [
      f.featureTag,
      {
        tag: f.featureTag,
        featureType: 'wall',
        band,
        results: [{ rule: rule(), band, value: null }],
        metrics: {},
      } as unknown as FeatureVerdict,
    ]
  }),
)

/**
 * The arrangement, as it comes out — with the setup ids taken off.
 *
 * Two runs of the allocator produce different `id`s, because `setupFor` mints a
 * UUID for each setup, so the plans can never be compared directly. What is
 * being compared is the *decision*: which way up each reading ended up cut
 * from, and which ways up the plan holds at all.
 */
const shapeOf = (plan: SetupPlan) => {
  const wayUp = new Map(plan.setups.map((setup) => [setup.id, setup.directionIndex]))

  return {
    setups: plan.setups.map((setup) => setup.directionIndex).sort((a, b) => a - b),
    assigned: Object.entries(plan.assigned)
      .map(([tag, held]) =>
        [tag, PASSES.map((pass) => wayUp.get(held[pass] ?? '') ?? null)].join(':'),
      )
      .sort(),
  }
}

describe('a part the size of a real one', () => {
  /*
   * 108 faces, 156 readings, six ways up — the shape of the part this froze on.
   *
   * What went wrong was the arrangement failing to *settle*: an unbounded swap
   * loop trading the same faces back and forth, which from the outside is a
   * page that has stopped responding.
   *
   * That used to be checked with a stopwatch — under two seconds, deliberately
   * loose. A wall-clock budget on a shared runner measures the runner as much
   * as the loop, so it fails on a busy afternoon and passes on a loop that has
   * quietly got twice as slow. Convergence is the actual claim, so it is the
   * thing asserted: run the allocator on its own output and it must not move.
   * A loop that never settles no longer trips a threshold — it runs past the
   * test's timeout, which is the same failure the page shows.
   */
  /**
   * Runs it until it stops moving, and says how many rounds that took.
   *
   * One call is not a fixed point — feeding a plan back is what `Fill from
   * current` does, and it can still find work the first pass could not place.
   * That is improvement, not churn. The difference between the two is whether
   * it *stops*: an unbounded swap loop never does.
   */
  const settle = (from: SetupPlan, limit = 8) => {
    let plan = from
    const counts = [Object.keys(plan.assigned).length]

    for (let round = 1; round <= limit; round += 1) {
      const next = byBestReading(part, DIRS, features, verdicts, plan)
      counts.push(Object.keys(next.assigned).length)

      if (JSON.stringify(shapeOf(next)) === JSON.stringify(shapeOf(plan))) {
        return { plan: next, rounds: round, counts }
      }
      plan = next
    }

    return { plan, rounds: Infinity, counts }
  }

  it('settles rather than trading faces back and forth', () => {
    const { plan, rounds, counts } = settle(EMPTY_PLAN)

    expect(plan.setups.length).toBeGreaterThan(0)
    // A handful of rounds, not "eventually". Trading faces back and forth
    // never reaches this at all, and needing more of them than this is the
    // allocator having stopped converging — which is what the page freezing
    // looked like from the outside.
    expect(rounds).toBeLessThanOrEqual(4)

    // And every round placed at least as much work as the one before it.
    // A count that goes down is a swap that undid itself, which is the shape
    // of an oscillation even when it happens to stop.
    expect(counts).toEqual([...counts].sort((a, b) => a - b))
  })

  it('settles the same way twice, rather than picking a different arrangement', () => {
    // Same inputs, same answer. A tie broken by iteration order rather than by
    // a rule is a plan that changes under somebody while they are reading it.
    const once = byBestReading(part, DIRS, features, verdicts, EMPTY_PLAN)
    const twice = byBestReading(part, DIRS, features, verdicts, EMPTY_PLAN)

    expect(shapeOf(twice)).toEqual(shapeOf(once))
  })

  it('settles just as surely when filling around what is held', () => {
    const keep = { setups: [setupFor(DIRS, 0, 0), setupFor(DIRS, 5, 1)], assigned: {} }

    const { rounds, counts } = settle(keep)

    expect(rounds).toBeLessThanOrEqual(4)
    expect(counts).toEqual([...counts].sort((a, b) => a - b))
  })

  /*
   * The one thing left that a stopwatch was doing usefully: noticing that this
   * got dramatically slower. Kept as a test timeout rather than an assertion,
   * so a slow runner reports "this took too long" rather than an arithmetic
   * failure two frames from the real cause — and so the number is nowhere near
   * anything a healthy run approaches.
   */
  it('gets through a real part without needing to be waited for', { timeout: 10_000 }, () => {
    expect(byBestReading(part, DIRS, features, verdicts, EMPTY_PLAN).setups.length).toBeGreaterThan(
      0,
    )
  })
})
