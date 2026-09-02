import { describe, expect, it } from 'vitest'
import { arrowsFor, arrowsVisible, nextArrows, shownArrow } from './arrows'

const nothing = {
  focusedDirection: null,
  activeDirection: null,
  litDirection: null,
  confirmed: [],
  choosing: null,
}

describe('nextArrows', () => {
  it('narrows all the way round: every one, then the plan, then none', () => {
    // A cycle that widened halfway through would be one nobody could press
    // without watching.
    expect(nextArrows('all')).toBe('confirmed')
    expect(nextArrows('confirmed')).toBe('off')
    expect(nextArrows('off')).toBe('all')
  })
})

describe('arrowsVisible', () => {
  it('draws nothing with the toggle off and nothing selected', () => {
    // An arrow per way up is most of a small part, answering a question nobody
    // has asked yet.
    expect(arrowsVisible('off', nothing)).toBe(false)
  })

  it('draws them when they are asked for', () => {
    expect(arrowsVisible('all', nothing)).toBe(true)
  })

  it('draws one on its own while a feature is being read', () => {
    expect(arrowsVisible('off', { ...nothing, focusedDirection: 2 })).toBe(true)
  })

  it('draws one while a direction is being held', () => {
    expect(arrowsVisible('off', { ...nothing, activeDirection: 1 })).toBe(true)
  })
})

describe('shownArrow', () => {
  it('narrows nothing when they were turned on deliberately', () => {
    // Every way up is the question being asked, so none of them is the answer.
    expect(shownArrow('all', { ...nothing, focusedDirection: 2, activeDirection: 1 })).toBeNull()
  })

  it('prefers the direction being held over the one being read', () => {
    // Holding one is the more immediate thing to have said, and it survives
    // looking at readings within it.
    expect(shownArrow('off', { ...nothing, focusedDirection: 2, activeDirection: 1 })).toBe(1)
  })

  it('falls back to the way up the feature being read is cut from', () => {
    expect(shownArrow('off', { ...nothing, focusedDirection: 2 })).toBe(2)
  })

  it('shows none rather than all when there is nothing to show', () => {
    // `-1` matches no candidate, where `null` would mean "all of them" — the
    // difference between an empty answer and every answer at once.
    expect(shownArrow('off', nothing)).toBe(-1)
  })
})

describe('naming a way up in a list', () => {
  it('draws its arrow, so the direction being asked about is on the part', () => {
    expect(arrowsVisible('off', { ...nothing, litDirection: 1 })).toBe(true)
    expect(shownArrow('off', { ...nothing, litDirection: 1 })).toBe(1)
  })

  it('beats the reading being read, because it is the newer question', () => {
    // The reading was opened to look at a feature; the direction was named
    // afterwards to ask about the direction.
    expect(shownArrow('off', { ...nothing, focusedDirection: 2, litDirection: 1 })).toBe(1)
  })

  it('loses to a way up actually being held, which scopes the click', () => {
    expect(
      shownArrow('off', { ...nothing, focusedDirection: 2, activeDirection: 0, litDirection: 1 }),
    ).toBe(0)
  })

  it('still shows every arrow when they were asked for outright', () => {
    expect(shownArrow('all', { ...nothing, litDirection: 1 })).toBeNull()
  })
})

describe('only the ways up a plan has confirmed', () => {
  const plan = { ...nothing, confirmed: [0, 3] }

  it('draws the list the plan holds, not the one the part offers', () => {
    // Candidates are what the part offers; setups are what has been decided,
    // and once there is a plan the ones it passed over are the clutter.
    expect(shownArrow('confirmed', plan)).toEqual([0, 3])
    expect(arrowsVisible('confirmed', plan)).toBe(true)
  })

  it('draws nothing while nothing is confirmed, and says so by drawing nothing', () => {
    // Falling back to all of them would be the toggle refusing the state it was
    // put in.
    expect(shownArrow('confirmed', nothing)).toEqual([])
    expect(arrowsVisible('confirmed', nothing)).toBe(false)
  })

  it('keeps the arrow of whatever is being read, confirmed or not', () => {
    // Dropping it would make clicking a feature take its arrow away.
    expect(shownArrow('confirmed', { ...plan, focusedDirection: 1 })).toEqual([0, 3, 1])
  })

  it('does not draw one twice when the plan already holds it', () => {
    expect(shownArrow('confirmed', { ...plan, focusedDirection: 3 })).toEqual([0, 3])
  })

  it('still narrows to one while a way up is held', () => {
    // Choosing a direction is asking about that direction, and the answer is
    // not improved by the plan's other arrows crossing the part.
    expect(shownArrow('confirmed', { ...plan, activeDirection: 3 })).toBe(3)
  })
})

describe('while the ways up are being chosen', () => {
  /*
   * The arrows are the only place a set of directions can be seen, so a column
   * of ticks against an unchanged part is a decision made blind — and the
   * question being asked is precisely which of these to hold.
   */
  it('draws exactly the ones ticked', () => {
    expect(shownArrow('off', { ...nothing, choosing: [0, 2] })).toEqual([0, 2])
  })

  it('outranks the toggle, which would otherwise refuse the one job it has', () => {
    expect(shownArrow('off', { ...nothing, choosing: [1] })).toEqual([1])
    expect(shownArrow('all', { ...nothing, choosing: [1] })).toEqual([1])
    expect(shownArrow('confirmed', { ...nothing, choosing: [1], confirmed: [3] })).toEqual([1])
  })

  it('outranks a way up being held, which is an older question', () => {
    expect(shownArrow('off', { ...nothing, choosing: [1], activeDirection: 2 })).toEqual([1])
  })

  it('draws nothing when nothing is ticked yet', () => {
    expect(arrowsVisible('off', { ...nothing, choosing: [] })).toBe(false)
  })
})

describe('which reading the arrows are drawn for', () => {
  /*
   * Paul's: pressing `Edit Feature` on a row opens that reading's editor
   * whether or not it is the row the datasheet is focused on. The arrow
   * followed the focus, so the part showed the way up of a reading nobody was
   * working on — while every face click was landing on the one that is.
   *
   * Tested here rather than on the part: the arrow is drawn in the canvas,
   * where no assertion reaches. An end-to-end test of it passed just as well
   * before the fix as after, which is a test of nothing.
   */
  it('draws for the reading being edited, over the one being read', () => {
    expect(arrowsFor('editing', 'reading')).toBe('editing')
  })

  it('falls back to the one being read when nothing is being edited', () => {
    expect(arrowsFor(null, 'reading')).toBe('reading')
  })

  it('draws for nothing when neither is set', () => {
    expect(arrowsFor(null, null)).toBeNull()
  })
})
