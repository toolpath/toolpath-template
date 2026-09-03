import { describe, expect, test } from 'vitest'
import {
  formatMetric,
  fromDisplay,
  ruleAudience,
  ruleHits,
  ruleLimits,
  ruleReads,
  toDisplay,
  unitSuffix,
} from './rule-text'
import type { ThresholdRule } from './rules'

const drilling: ThresholdRule = {
  id: 'drilling-ld',
  type: 'threshold',
  name: 'Drilling L/D',
  metric: 'drillingLD',
  direction: 'higher is harder',
  thresholds: [3, 5, 8, 12],
  weight: 14,
  enabled: true,
  featureTypes: ['blind_hole', 'through_hole'],
  note: 'Reach down to the bottom of the hole over its diameter.',
}

describe('formatMetric', () => {
  test('converts lengths and leaves ratios alone', () => {
    // A 5:1 pocket is 5:1 in any shop, and a chamfer is 45° in both.
    expect(formatMetric(25.4, 'depth', 'millimeters')).toBe('25.40 mm')
    expect(formatMetric(25.4, 'depth', 'inches')).toBe('1.000 in')
    // A ratio is bare and to one decimal: ":1" reads well in a sentence and
    // badly in a box, and nobody argues about the second decimal of a 5:1
    // pocket.
    expect(formatMetric(4, 'drillingLD', 'inches')).toBe('4.0')
    expect(formatMetric(45, 'chamferAngle', 'inches')).toBe('45.0°')
  })

  test('says nothing rather than zero when there is no measurement', () => {
    expect(formatMetric(null, 'depth', 'millimeters')).toBe('—')
  })

  test('states no unit for a number whose unit it does not know', () => {
    // The inputs to an L/D are two lengths, and printing one as "6.35:1" states
    // a unit the Engine never reported.
    expect(formatMetric(6.35, undefined, 'millimeters')).toBe('6.35')
    expect(formatMetric(2, undefined, 'millimeters')).toBe('2')
    expect(formatMetric(25.400000000000002, undefined, 'millimeters')).toBe('25.4')
  })
})

describe('ruleLimits', () => {
  test('lays out the bands a measurement was judged against', () => {
    const limits = ruleLimits(drilling, 'millimeters')

    // The fourth box bounds rats. A refusal is optional, so without one the
    // `no go` band is not reachable and is left out.
    expect(limits.map((limit) => `${limit.name} ${limit.range}`)).toEqual([
      'easy ∞ – 3.0',
      'alright 3.0 – 5.0',
      'meh 5.0 – 8.0',
      'rats 8.0 – 12.0',
    ])
    // The band is carried alongside its words, so a row can be marked as the
    // one a measurement landed in without matching on the text.
    expect(limits.map((limit) => limit.band)).toEqual(['easy', 'alright', 'meh', 'rats'])
  })

  test('shows an open end as infinity at either end of the scale', () => {
    // Matching the picker, which the same people read alongside this.
    const falling = ruleLimits(
      { ...drilling, direction: 'lower is harder' as const },
      'millimeters',
    )

    expect(falling[0]?.range).toBe('3.0 – ∞')
    expect(falling.at(-1)?.range).toBe('12.0 – 8.0')
  })

  test('shows the refusal as its own step once there is one', () => {
    const refused = ruleLimits({ ...drilling, noGo: 15 }, 'millimeters').at(-1)

    expect(refused).toMatchObject({ band: 'no go', range: '15.0 – ∞' })
  })

  test('uses a shop’s own words for the bands', () => {
    expect(ruleLimits(drilling, 'millimeters', { rats: 'call me' })[3]?.name).toBe('call me')
  })

  test('has nothing to lay out for a rule with no scale', () => {
    expect(
      ruleLimits({ ...drilling, type: 'baseline', bands: {} } as never, 'millimeters'),
    ).toEqual([])
  })
})

describe('what a rule says about itself', () => {
  test('names who it applies to without listing twenty types', () => {
    expect(ruleAudience(drilling)).toBe('blind hole, through hole')
    expect(ruleAudience({ ...drilling, featureTypes: [] })).toBe('every feature')
    expect(ruleAudience({ ...drilling, featureTypes: Array(9).fill('wall') })).toBe(
      '9 feature types',
    )
  })

  test('names what it reads', () => {
    expect(ruleReads(drilling)).toBe('Drilling L/D')
    expect(ruleReads({ ...drilling, type: 'baseline', bands: {} } as never)).toContain('kind of')
  })
})

describe('typing a threshold', () => {
  test('reads and writes back the same number', () => {
    // Rules are stored in millimetres whatever the shop that wrote them was
    // thinking. Getting this pair out of step is how an inch shop's 0.125
    // quietly becomes 0.125 mm.
    const shown = toDisplay(3.175, 'minRadius', 'inches')

    expect(shown).toBeCloseTo(0.125, 6)
    expect(fromDisplay(shown, 'minRadius', 'inches')).toBeCloseTo(3.175, 6)
  })

  test('leaves alone the quantities that do not convert', () => {
    // A 5:1 pocket is 5:1 in any shop, and a chamfer is 45° in both.
    expect(toDisplay(5, 'drillingLD', 'inches')).toBe(5)
    expect(toDisplay(45, 'chamferAngle', 'inches')).toBe(45)
  })

  test('says what a box is measured in', () => {
    expect(unitSuffix('minRadius', 'inches')).toBe('in')
    expect(unitSuffix('drillingLD', 'inches')).toBe('')
    expect(unitSuffix('chamferAngle', 'millimeters')).toBe('°')
  })
})

describe('ruleHits', () => {
  const verdicts = [
    {
      tag: 'hole-1',
      results: [
        { rule: { id: 'ld' }, band: 'meh' },
        { rule: { id: 'size' }, band: 'easy' },
      ],
    },
    { tag: 'hole-2', results: [{ rule: { id: 'ld' }, band: 'no go' }] },
    { tag: 'gone', results: [{ rule: { id: 'ld' }, band: 'rats' }] },
  ] as never

  const features = [
    {
      featureTag: 'hole-1',
      featureType: 'blind_hole',
      regionIdxs: [1, 2],
      machiningDirection: { x: 0, y: 0, z: 1 },
    },
    {
      featureTag: 'hole-2',
      featureType: 'through_hole',
      regionIdxs: [3],
      machiningDirection: { x: 0, y: 0, z: -1 },
    },
  ] as never

  test('lists what each rule bit on, worst first', () => {
    const hits = ruleHits(verdicts, features)

    // The question a shop asks of a limit is what it cost, and the top of the
    // list is the feature that limit is worst about.
    expect(hits.get('ld')?.map((hit) => hit.tag)).toEqual(['hole-2', 'hole-1'])
    expect(hits.get('ld')?.[0]).toMatchObject({ band: 'no go', direction: '−Z', regions: 1 })
    expect(hits.get('size')?.map((hit) => hit.tag)).toEqual(['hole-1'])
  })

  test('drops a verdict whose feature is not in the report', () => {
    // A stale verdict naming a feature nobody can click is a row that goes
    // nowhere.
    expect(
      ruleHits(verdicts, features)
        .get('ld')
        ?.some((hit) => hit.tag === 'gone'),
    ).toBe(false)
  })
})
