import { describe, expect, test } from 'vitest'
import { costlyCount, rulesSummary, worstOf } from './rules-summary'

const rule = (id: string, name: string, enabled = true) => ({ id, name, enabled, weight: 10 })

const verdicts = [
  {
    tag: 'hole-1',
    results: [
      { rule: rule('ld', 'Drilling L/D'), band: 'meh', value: 5.6 },
      { rule: rule('size', 'Smallest drilled hole'), band: 'rats', value: 2 },
    ],
  },
  { tag: 'wall-1', results: [{ rule: rule('ld', 'Drilling L/D'), band: 'easy', value: 1 }] },
] as never

const features = [
  {
    featureTag: 'hole-1',
    featureType: 'blind_hole',
    regionIdxs: [1],
    machiningDirection: { x: 0, y: 0, z: 1 },
  },
  {
    featureTag: 'wall-1',
    featureType: 'wall',
    regionIdxs: [1],
    machiningDirection: { x: 0, y: 0, z: -1 },
  },
] as never

const rules = [
  rule('ld', 'Drilling L/D'),
  rule('size', 'Smallest'),
  rule('off', 'Off', false),
] as never

describe('rulesSummary', () => {
  const summary = rulesSummary(verdicts, features, rules)

  test('counts readings rather than features', () => {
    // One rule speaking about one feature is one reading, and a feature three
    // rules looked at is three — which is what the score averages over.
    expect(summary.readings).toBe(3)
  })

  test('says how many rules had anything to say, of those in force', () => {
    // A rule that never fired is not a rule that passed, and a set where four
    // of fourteen spoke is a set worth looking at.
    expect(summary.spoke).toBe(2)
    expect(summary.rules).toBe(2)
  })

  test('names the readings that cost the most, worst first', () => {
    expect(summary.worst.map((reading) => `${reading.label} ${reading.band}`)).toEqual([
      'Blind Hole rats',
      'Blind Hole meh',
    ])
  })

  test('leaves the easy readings out of the worst of it', () => {
    // "Worst of it" that includes things nobody minds is a list nobody reads.
    expect(summary.worst.some((reading) => reading.band === 'easy')).toBe(false)
  })
})

describe('what a rule cost', () => {
  const hits = [{ band: 'easy' }, { band: 'meh' }, { band: 'no go' }] as never

  test('counts the readings a shop would mind', () => {
    expect(costlyCount(hits)).toBe(2)
  })

  test('names the worst band it handed out', () => {
    expect(worstOf(hits)).toBe('no go')
    expect(worstOf([])).toBe(null)
  })
})
