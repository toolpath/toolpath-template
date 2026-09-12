import { describe, expect, it } from 'vitest'
import { menuRoom, placeMenu } from './menu-place'

/**
 * How tall a box opened off a button is, and which way it opens.
 *
 * One rule for the filter menus, the column picker and the quick filters: the
 * picker ran off the bottom of the screen with its last columns unreachable
 * (Paul, 2026-09-10), which is the defect the Type filter had a day earlier.
 */
describe('the room a menu opens into', () => {
  it('takes the room under the button and opens downwards', () => {
    expect(menuRoom({ top: 100, bottom: 130 }, 900)).toEqual({ upwards: false, height: 758 })
  })

  it('opens upwards where what is left under the button is a strip', () => {
    expect(menuRoom({ top: 700, bottom: 730 }, 900)).toEqual({ upwards: true, height: 688 })
  })

  /** A strip above and a strip below still opens downwards, and overhangs. */
  it('never squeezes itself below the least height worth reading', () => {
    expect(menuRoom({ top: 40, bottom: 70 }, 200)).toEqual({ upwards: false, height: 220 })
  })
})

/**
 * Where the box stands, in viewport pixels.
 *
 * These are the numbers a `position: fixed` portal is given, which is why the
 * menus that used to be drawn inside the strip that opened them are no longer
 * cut off by the viewer card (Paul, 2026-09-11).
 */
describe('placing a menu against its button', () => {
  const viewport = { width: 1000, height: 900 }
  const button = { top: 100, bottom: 130, left: 400, right: 500 }

  it('hangs a downward menu off the bottom of the button', () => {
    expect(placeMenu(button, 160, 'right', viewport)).toEqual({
      top: 134,
      bottom: null,
      left: 340,
      height: 758,
    })
  })

  /** Anchored by its bottom, so a box flips without a frame in the wrong place. */
  it('stands an upward menu on the top of the button', () => {
    expect(placeMenu({ ...button, top: 700, bottom: 730 }, 160, 'right', viewport)).toEqual({
      top: null,
      bottom: 204,
      left: 340,
      height: 688,
    })
  })

  it('lines a left-aligned menu up with the near edge instead', () => {
    expect(placeMenu(button, 160, 'left', viewport).left).toBe(400)
  })

  /** A menu on the last column opens leftwards rather than off the screen. */
  it('keeps the box inside the window at either edge', () => {
    expect(placeMenu({ ...button, left: 960, right: 990 }, 160, 'left', viewport).left).toBe(832)
    expect(placeMenu({ ...button, left: 4, right: 30 }, 160, 'right', viewport).left).toBe(8)
  })
})
