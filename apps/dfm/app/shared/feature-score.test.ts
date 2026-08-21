import { describe, expect, test } from 'vitest'
import { featureScores } from './feature-score'

const verdict = (tag: string, band: string | null, weight = 10) =>
  ({
    tag,
    band,
    results: band === null ? [] : [{ rule: { id: 'r', weight, type: 'flag' }, band, value: null }],
    metrics: {},
  }) as never

describe('featureScores', () => {
  test('carries the band and a score out of a hundred', () => {
    const scores = featureScores([verdict('easy-1', 'easy'), verdict('bad-1', 'no go')])

    expect(scores.get('easy-1')).toEqual({ band: 'easy', score: 100 })
    expect(scores.get('bad-1')).toEqual({ band: 'no go', score: 0 })
  })

  test('says nothing about a feature no rule reached', () => {
    // "Nobody looked" is not a verdict, and a zero would read as one.
    expect(featureScores([verdict('quiet-1', null)]).get('quiet-1')).toEqual({
      band: null,
      score: null,
    })
  })
})
