// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useRules } from './use-rules'
import { testFeature } from './test-part'

const UP = { x: 0, y: 0, z: 1 }
const features = [
  testFeature('hole-1', 'blind_hole', UP, [0]),
  testFeature('wall-1', 'wall', UP, [1]),
]

/**
 * The rule set is handed to the rules panel whole, as one prop.
 *
 * The panel is memoised, so this hook returning a fresh object each render is
 * enough on its own to re-render it on every one of the page's thirty-odd
 * state changes — however stable the verdicts and callbacks inside it are.
 * That is a defect nothing on the page can show you: the panel simply renders
 * more than it needs to, correctly, and the cost only appears under a pointer
 * moving down a list.
 */
describe('useRules', () => {
  it('hands back the same object while nothing in it has changed', () => {
    const { result, rerender } = renderHook(() => useRules(features))

    const first = result.current
    rerender()

    expect(result.current).toBe(first)
  })

  it('hands back a new object once a rule has moved', () => {
    const { result } = renderHook(() => useRules(features))

    const before = result.current
    const rule = before.ruleSet.rules[0]!
    act(() => {
      before.updateRule({ ...rule, name: `${rule.name} (edited)` })
    })

    expect(result.current).not.toBe(before)
    expect(result.current.ruleSet.rules[0]?.name).toBe(`${rule.name} (edited)`)
  })

  it('keeps the verdicts themselves stable across a bare re-render', () => {
    const { result, rerender } = renderHook(() => useRules(features))

    const verdicts = result.current.verdicts
    rerender()

    expect(result.current.verdicts).toBe(verdicts)
  })
})
