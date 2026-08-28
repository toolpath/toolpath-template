import { describe, expect, test } from 'vitest'
import { escapeStep } from './escape'

const state = (over: Partial<Parameters<typeof escapeStep>[0]> = {}) =>
  escapeStep({
    editing: false,
    hasSelection: false,
    expandedType: null,
    direction: null,
    arrows: false,
    mode: false,
    ...over,
  })

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

  test('puts the arrows away next, which is what a mode left on screen', () => {
    expect(state({ arrows: true, mode: true })).toBe('arrows')
  })

  test('and comes back to By face last, so pressing it out always lands somewhere known', () => {
    expect(state({ mode: true })).toBe('mode')
  })

  test('does nothing when there is nothing to put down', () => {
    expect(state()).toBe(null)
  })
})

describe('escape with faces painted', () => {
  test('puts the painted set down with the selection, not after it', () => {
    // Painted faces are part of what the newest gesture put on screen. Leaving
    // them lit while Escape moved on to older state is how paint got stuck.
    expect(state({ hasSelection: true, expandedType: 'wall', direction: 1 })).toBe('selection')
  })

  test('reaches the older state once nothing is painted or selected', () => {
    expect(state({ hasSelection: false, expandedType: 'wall', direction: 1 })).toBe('expandedType')
  })
})

describe('the editor is innermost, and the only rung that undoes', () => {
  /*
   * Leaving the editor any way but `Save` puts the plan back as it was when it
   * opened. Escape has to mean the same thing as clicking away from it — a way
   * out that sometimes commits and sometimes does not is one somebody has to
   * remember the rule for, and the whole point of a Save button is not having
   * to.
   */
  test('backs out of the editor before anything else', () => {
    expect(state({ editing: true, hasSelection: true, expandedType: 'wall', direction: 2 })).toBe(
      'editing',
    )
  })

  // And the rungs below it are untouched: one press puts down one thing, and
  // the editor is the newest of them rather than a special case beside them.
  test('leaves the rest of the ladder as it was', () => {
    expect(state({ hasSelection: true })).toBe('selection')
    expect(state({ editing: false, arrows: true })).toBe('arrows')
  })
})
