import { describe, it, expect } from 'vitest'
import { byBestReading } from './best-reading'
import { EMPTY_PLAN, setupFor } from './setups'
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

describe('a part the size of a real one', () => {
  /*
   * 108 faces, 156 readings, six ways up — the shape of the part this froze on.
   *
   * The budget is deliberately loose. It is not here to police milliseconds; it
   * is here to catch the arrangement failing to *settle* again, which is what
   * an unbounded swap loop does and what a page freezing looks like from the
   * outside. Anything in this range is fine; anything near the limit means the
   * loop has stopped converging.
   */
  it('settles quickly rather than trading faces back and forth', () => {
    const started = Date.now()
    const plan = byBestReading(part, DIRS, features, verdicts, EMPTY_PLAN)

    expect(Date.now() - started).toBeLessThan(2000)
    expect(plan.setups.length).toBeGreaterThan(0)
  })

  it('settles just as quickly when filling around what is held', () => {
    const keep = { setups: [setupFor(DIRS, 0, 0), setupFor(DIRS, 5, 1)], assigned: {} }

    const started = Date.now()
    byBestReading(part, DIRS, features, verdicts, keep)

    expect(Date.now() - started).toBeLessThan(2000)
  })
})
