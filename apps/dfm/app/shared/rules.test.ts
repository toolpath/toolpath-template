import { describe, expect, test } from 'vitest'
import type { PartFeature } from './contracts'
import type { FlagRule, Rule, ThresholdRule } from './rules'
import {
  BANDS,
  DEFAULT_BAND_NAMES,
  bandName,
  bandRank,
  evaluateFeature,
  readEveryRule,
  scoreFeature,
  scorePart,
  worstBand,
} from './rules'
import { readMetrics } from './metrics'

/**
 * A rule reads one measurement and places it in a band. What is pinned here is
 * the arithmetic that turns several of those into one answer — and the silences,
 * which are the difference between a real score and a part that reads easy
 * because the Engine said nothing.
 */

const hole = (facts: Record<string, unknown> = {}, sheet: Record<string, unknown> = {}) =>
  ({
    featureTag: 'hole-1',
    featureType: 'blind_hole',
    regionIdxs: [0],
    machiningDirection: { x: 0, y: 0, z: 1 },
    axis: { x: 0, y: 0, z: 1 },
    datasheet: {
      facts: { kind: 'Hole', diameter: 6.35, ...facts },
      zMax: 0,
      zMin: -25.4,
      extendedZMax: 0,
      extendedZMin: -25.4,
      ...sheet,
    },
  }) as unknown as PartFeature

const drillingLD = (over: Partial<ThresholdRule> = {}): ThresholdRule => ({
  id: 'drilling-ld',
  type: 'threshold',
  name: 'Drilling L/D',
  metric: 'drillingLD',
  direction: 'higher is harder',
  thresholds: [3, 5, 8, 12],
  weight: 10,
  enabled: true,
  featureTypes: [],
  note: '',
  ...over,
})

describe('worstBand', () => {
  test('is the worst any rule gave, not the average of them', () => {
    // A feature that fails one rule of five is not four-fifths fine.
    expect(worstBand(['easy', 'rats', 'alright'])).toBe('rats')
    expect(worstBand([])).toBe(null)
  })

  test('ranks the five in the order they get worse', () => {
    expect(BANDS.map(bandRank)).toEqual([0, 1, 2, 3, 4])
  })
})

describe('silence', () => {
  test('a rule that did not apply is never scored as easy', () => {
    const metrics = readMetrics(hole())
    const readings = readEveryRule(
      [
        drillingLD({ enabled: false }),
        drillingLD({ id: 'walls-only', featureTypes: ['wall'] }),
        drillingLD({ id: 'unreported', metric: 'cuspHeight' }),
      ],
      'blind_hole',
      metrics,
    )

    // Each says *why* it stayed quiet. Only the last is a surprise, and with a
    // sparse datasheet a rule that scored silence as easy would put the whole
    // part in green.
    expect(readings.map((reading) => reading.silence)).toEqual([
      'switched off',
      'other feature types',
      'no measurement',
    ])
    expect(readings.every((reading) => reading.band === null)).toBe(true)
  })

  test('a flag that found nothing to flag is its own kind of quiet', () => {
    const flag: FlagRule = {
      id: 'sharp',
      type: 'flag',
      name: 'Sharp corners',
      metric: 'sharpCorners',
      raises: 'no go',
      weight: 10,
      enabled: true,
      featureTypes: [],
      note: '',
    }

    const reported = hole({ kind: 'Three', hasSharpCorner: false })
    const [reading] = readEveryRule([flag], 'blind_hole', readMetrics(reported))

    // "No sharp corner" is the ordinary case, not a missing measurement.
    expect(reading?.band).toBe(null)
    expect(reading?.silence).toBe('nothing to flag')
  })
})

describe('scoring', () => {
  const judge = (rules: ReadonlyArray<Rule>, feature = hole()) => evaluateFeature(rules, feature)

  test('places a measurement in the band its thresholds describe', () => {
    // 25.4 deep in a 6.35 bore is 4:1, which is past the easy limit of 3.
    const verdict = judge([drillingLD()])

    expect(verdict.band).toBe('alright')
    expect(verdict.results[0]?.value).toBeCloseTo(4, 6)
  })

  test('scores by where in the band it sits, not by the band alone', () => {
    // Both are `alright`, and the deeper one is worse. A score that only knew
    // the band would call them identical.
    const shallow = judge([drillingLD()], hole({}, { zMin: -22 }))
    const deep = judge([drillingLD()], hole({}, { zMin: -30 }))

    expect(shallow.band).toBe(deep.band)
    expect(scoreFeature(shallow)).toBeGreaterThan(scoreFeature(deep) as number)
  })

  test('weights the part by rule rather than by feature', () => {
    const light = judge([drillingLD({ weight: 1 })])
    const heavy = judge([drillingLD({ id: 'heavy', weight: 100, thresholds: [1, 2, 2.5, 3] })])

    const part = scorePart([light, heavy])

    // The heavy rule bands it `no go`, and the part's score has to lean its way
    // — a rule a shop cares about counts for more wherever it applies.
    expect(part.score).toBeLessThan(0.5)
  })

  test('counts a hard limit rather than folding it into the score', () => {
    const verdict = judge([drillingLD({ thresholds: [1, 2, 2.5, 3], noGo: 3.5 })])
    const part = scorePart([verdict])

    // "This part scores 0.72" and "one feature cannot be cut at all" are
    // different things to know.
    expect(verdict.band).toBe('no go')
    expect(part.pastHardLimit).toBe(1)
    expect(part.score).toBeGreaterThanOrEqual(0)
  })

  test('never scores worse than the worst band', () => {
    // `no go` is the floor. Its interior position used to carry a feature past
    // a refusal to −0.25, which dragged the part average below the range the
    // number is documented to have.
    const refused = judge([drillingLD({ thresholds: [1, 2, 2.5, 3], noGo: 3.5 })])

    expect(scoreFeature(refused)).toBe(0)
    expect(scorePart([refused]).score).toBe(0)
  })

  test('keeps a refusal above the limit it refuses past', () => {
    // "Rats up to 12" is what a hard job looks like and "no go past 15" is
    // where it stops being a job at all. A refusal written below the rats limit
    // would otherwise refuse work the same rule calls merely hard.
    const backwards = judge([drillingLD({ thresholds: [3, 5, 8, 12], noGo: 3.5 })])

    expect(backwards.band).toBe('alright')
  })

  test('counts what nothing judged, rather than burying it', () => {
    const part = scorePart([judge([drillingLD({ featureTypes: ['wall'] })])])

    // "0.94, and 200 features unjudged" is a different statement from 0.94.
    expect(part.unjudged).toBe(1)
    expect(part.counts.easy).toBe(0)
  })
})

describe('band names', () => {
  test('ships the ids as the words, so nothing reads as unnamed', () => {
    expect(DEFAULT_BAND_NAMES.rats).toBe('rats')
  })

  test('takes the most local name there is', () => {
    const set = { rats: 'call me' }
    const rule = { rats: 'ring the shop' }

    expect(bandName('rats', set)).toBe('call me')
    expect(bandName('rats', set, rule)).toBe('ring the shop')
    expect(bandName('meh', set)).toBe('meh')
  })

  test('treats a blank name as no name', () => {
    // An empty field left behind in the editor should read as the band it is.
    expect(bandName('rats', { rats: '   ' })).toBe('rats')
  })

  test('renaming a band moves no feature between bands', () => {
    const named = evaluateFeature([drillingLD()], hole())
    const renamed = evaluateFeature([drillingLD({ bandNames: { alright: 'fine' } })], hole())

    // The id is what is stored and what everything compares on; the words are
    // over the top of it.
    expect(renamed.band).toBe(named.band)
    expect(scoreFeature(renamed)).toBe(scoreFeature(named))
  })
})

describe('a refusal is optional', () => {
  const bare = drillingLD({ thresholds: [3, 5, 8, 12] })

  test('leaves the worst band unreachable when no rule names one', () => {
    // Without a refusal a shop is saying "hard, but bought" — only a rule that
    // names one can say a thing cannot be made.
    const verdict = evaluateFeature([bare], hole({}, { zMin: -200 }))

    expect(verdict.band).toBe('rats')
    expect(scorePart([verdict]).pastHardLimit).toBe(0)
  })

  test('refuses only past the refusal, once there is one', () => {
    const refused = evaluateFeature([drillingLD({ noGo: 20 })], hole({}, { zMin: -200 }))

    // 200 in a 6.35 bore is past 20:1.
    expect(refused.band).toBe('no go')
  })
})
