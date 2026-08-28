import { describe, expect, it } from 'vitest'

import { partClick, type PartClickState } from './part-click'

const NOTHING_OPEN: PartClickState = {
  drawing: false,
  secondary: false,
  editing: false,
  editingCovers: false,
  offered: false,
  offeredHere: false,
  holding: false,
}

const click = (state: Partial<PartClickState> = {}) => partClick({ ...NOTHING_OPEN, ...state })

describe('a click on the part, with nothing claiming it', () => {
  it('picks the face', () => {
    expect(click()).toBe('select')
  })
})

describe('while a reading is being drawn', () => {
  /*
   * The bug this is written for: the drawing rung lived *inside* the
   * right-click branch, so a left click never reached it and fell through to
   * the ordinary pick — which grabs whole features. Drawing is the one mode
   * where that is exactly wrong.
   */
  it('takes a left click as a face of the drawing', () => {
    expect(click({ drawing: true })).toBe('draw')
  })

  it('takes it before the editor, an offer, or a held way up', () => {
    expect(
      click({ drawing: true, editing: true, offered: true, offeredHere: true, holding: true }),
    ).toBe('draw')
  })

  // Right still only ever reads, even here: it is the one press that is safe
  // to make half-way through a decision.
  it('still lets the reading button read', () => {
    expect(click({ drawing: true, secondary: true })).toBe('draw')
  })
})

describe('the reading button', () => {
  it('changes nothing, whatever is open', () => {
    expect(click({ secondary: true })).toBe('peek')
    expect(click({ secondary: true, offered: true, offeredHere: true })).toBe('peek')
    expect(click({ secondary: true, holding: true })).toBe('peek')
  })

  /*
   * Inside the editor a read is a different question. "Which row is this face"
   * is what somebody wants there, not "which reading owns it" — the editor is
   * already open on one reading and that is the answer to the second question.
   */
  it('shows the row, for a face the open reading covers', () => {
    expect(click({ secondary: true, editing: true, editingCovers: true })).toBe('reveal')
  })

  it('falls back to reading it, for a face the open reading does not cover', () => {
    expect(click({ secondary: true, editing: true, editingCovers: false })).toBe('peek')
  })
})

describe('while the face editor is open', () => {
  it('claims the face for the reading being edited', () => {
    expect(click({ editing: true })).toBe('claim')
  })

  // Entered and left deliberately, so a click inside it is not ambiguous —
  // which is why nothing needs arming and no offer may take the click first.
  it('takes the click before a standing offer', () => {
    expect(click({ editing: true, offered: true, offeredHere: true })).toBe('claim')
  })

  it('takes it before a held way up', () => {
    expect(click({ editing: true, holding: true })).toBe('claim')
  })
})

describe('while an offer stands', () => {
  // The part *is* the offer: a face in it comes out, and only that face.
  it('takes a face out of the offer', () => {
    expect(click({ offered: true, offeredHere: true })).toBe('prune')
  })

  it('puts a face outside it in', () => {
    expect(click({ offered: true, offeredHere: false })).toBe('join')
  })

  it('takes the click before a held way up', () => {
    expect(click({ offered: true, offeredHere: false, holding: true })).toBe('join')
  })
})

describe('while a way up is held', () => {
  // The direction is chosen, so the click asks what work is there rather than
  // which face: the whole reading goes on or comes off.
  it('paints the whole reading of the face', () => {
    expect(click({ holding: true })).toBe('paint')
  })
})

describe('the ladder as a whole', () => {
  /*
   * Every rung, most-claiming first. A press can only ever mean one thing, and
   * this is the order in which the modes are allowed to claim it — the property
   * that four separate bugs were each a break in.
   */
  it('gives the click to exactly one mode, in a fixed order', () => {
    const everything: PartClickState = {
      drawing: true,
      secondary: true,
      editing: true,
      editingCovers: true,
      offered: true,
      offeredHere: true,
      holding: true,
    }

    expect(partClick(everything)).toBe('draw')
    expect(partClick({ ...everything, drawing: false })).toBe('reveal')
    expect(partClick({ ...everything, drawing: false, secondary: false })).toBe('claim')
    expect(partClick({ ...everything, drawing: false, secondary: false, editing: false })).toBe(
      'prune',
    )
    expect(
      partClick({
        ...everything,
        drawing: false,
        secondary: false,
        editing: false,
        offeredHere: false,
      }),
    ).toBe('join')
    expect(
      partClick({
        ...everything,
        drawing: false,
        secondary: false,
        editing: false,
        offered: false,
      }),
    ).toBe('paint')
    expect(partClick(NOTHING_OPEN)).toBe('select')
  })
})
