import { describe, expect, test } from 'vitest'
import { escapeStep } from './escape'

const state = (over: Partial<Parameters<typeof escapeStep>[0]> = {}) =>
  escapeStep({ hasSelection: false, expandedType: null, direction: null, ...over })

describe('escapeStep', () => {
  test('puts down the newest thing first', () => {
    expect(state({ hasSelection: true, expandedType: 'wall', direction: 2 })).toBe('selection')
  })

  test('then closes the open type, which is what was being browsed before it', () => {
    expect(state({ expandedType: 'wall', direction: 2 })).toBe('expandedType')
  })

  test('and lets go of the direction last', () => {
    // A scope somebody set deliberately, and would be annoyed to lose while
    // undoing a click.
    expect(state({ direction: 2 })).toBe('direction')
  })

  test('does nothing when there is nothing to put down', () => {
    expect(state()).toBe(null)
  })
})
