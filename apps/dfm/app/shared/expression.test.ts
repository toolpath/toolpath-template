import { describe, expect, test } from 'vitest'
import { expressionReads, readExpression } from './expression'
import type { FeatureMetrics } from './metrics'

/**
 * A shop's own rule is usually a ratio nobody precomputed — depth over the
 * cutter that has to reach it — and adding a metric to the app for every idea
 * is a release for every idea.
 */

const metrics = { depth: 25.4, requiredCutter: 6.35, holeDiameter: 0 } as unknown as FeatureMetrics

const run = (source: string) => readExpression(source)?.(metrics) ?? null

describe('readExpression', () => {
  test('reads a measurement by name', () => {
    expect(run('depth')).toBeCloseTo(25.4, 6)
  })

  test('does the arithmetic a shop would write on paper', () => {
    expect(run('depth / requiredCutter')).toBeCloseTo(4, 6)
    expect(run('depth - requiredCutter')).toBeCloseTo(19.05, 6)
    expect(run('2 * requiredCutter')).toBeCloseTo(12.7, 6)
  })

  test('gives multiplication its precedence, and brackets theirs', () => {
    expect(run('1 + 2 * 3')).toBe(7)
    expect(run('(1 + 2) * 3')).toBe(9)
  })

  test('goes quiet when a measurement it needs was never reported', () => {
    // The same rule as everywhere else: silence is not zero, and a rule reading
    // a number the Engine never gave has to stand down rather than guess.
    expect(run('cuspHeight * 2')).toBe(null)
  })

  test('refuses to divide by nothing rather than returning infinity', () => {
    expect(run('depth / holeDiameter')).toBe(null)
  })

  test('says so when what was typed is not arithmetic', () => {
    // Caught in the box somebody is typing in, not on every feature afterwards.
    for (const nonsense of ['', 'depth +', '* 2', 'depth ) 2', 'drop table']) {
      expect(readExpression(nonsense)).toBe(null)
      expect(expressionReads(nonsense)).toBe(false)
    }
    expect(expressionReads('depth / requiredCutter')).toBe(true)
  })
})
