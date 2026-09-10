import { describe, expect, it } from 'vitest'
import { AUTO_CODES, autoColumnsFor, hiddenAfterAuto } from './auto-columns'

/**
 * **Each of the two is the number one kind of tool is chosen on** (Paul,
 * 2026-09-10: "Tip angle on by default for drills, corner radius on by default
 * for end mills. If filters show both, show both").
 *
 * A tip angle beside a bull nose is a dash and a corner radius beside a drill
 * is a dash, so neither is worth a permanent column — and neither is worth
 * hunting for in the picker on a list full of the tools it is about.
 */
describe('the columns the list turns on for itself', () => {
  it('brings the tip angle out for a drill', () => {
    expect(autoColumnsFor(['drill'])).toEqual(['SIG'])
  })

  it('brings the corner radius out for a mill', () => {
    expect(autoColumnsFor(['bull nose end mill'])).toEqual(['RE'])
  })

  it('brings both out for a list holding both', () => {
    expect(autoColumnsFor(['drill', 'flat end mill'])).toEqual(['SIG', 'RE'])
  })

  /** A spot drill and a center drill have a point, and state its angle. */
  it('counts the other pointed tools as drills', () => {
    expect(autoColumnsFor(['spot drill'])).toEqual(['SIG'])
    expect(autoColumnsFor(['center drill'])).toEqual(['SIG'])
  })

  it('brings neither out for a tap', () => {
    expect(autoColumnsFor(['tap right hand'])).toEqual([])
  })
})

describe('the hidden set the rule leaves behind', () => {
  const untouched = new Set<string>()

  it('shows the tip angle and keeps the radius hidden on a list of drills', () => {
    expect(hiddenAfterAuto(['RE', 'SIG'], ['drill'], untouched)).toEqual(['RE'])
  })

  it('hides them both again when the tools go', () => {
    expect([...hiddenAfterAuto([], ['tap right hand'], untouched)].sort()).toEqual(['RE', 'SIG'])
  })

  /**
   * **Toggled by hand, a column stays where it was put.** A list that undoes
   * somebody's choice on the next keystroke is worse than one that never made
   * a choice of its own.
   */
  it('leaves a column somebody has decided about', () => {
    expect(hiddenAfterAuto(['SIG'], ['drill'], new Set(['SIG']))).toEqual(['SIG', 'RE'])
    expect(hiddenAfterAuto([], ['tap right hand'], new Set(['RE', 'SIG']))).toEqual([])
  })

  it('leaves every other hidden column alone', () => {
    expect(hiddenAfterAuto(['holder', 'collet', 'SIG'], ['drill'], untouched)).toEqual([
      'holder',
      'collet',
      'RE',
    ])
  })

  /**
   * **The same set comes back as the same array**, so a state update that
   * changes nothing bails out instead of re-rendering the whole table on every
   * keystroke that re-filters the list.
   */
  it('returns the set it was given when nothing moved', () => {
    const hidden = ['RE', 'holder']
    expect(hiddenAfterAuto(hidden, ['drill'], new Set(['SIG']))).toBe(hidden)
  })

  it('owns exactly the two codes', () => {
    expect(AUTO_CODES).toEqual(['SIG', 'RE'])
  })
})
