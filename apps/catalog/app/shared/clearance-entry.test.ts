import { describe, expect, it } from 'vitest'
import type { Margins } from '@toolpath/catalog-data'
import { askFor, boxesFor, shownIn, type RequiredAt } from './clearance-entry'

/** The sheet's own figures, 0.020 in both ways, which is what the page opens on. */
const SHEET: Margins = { axial: 0.508, radial: 0.508 }

/**
 * A stand-in for `clearance().requiredStickout`: the holder has to stand one
 * millimetre off the tip to touch nothing, plus whatever room is asked for.
 *
 * Linear in both axes, which the real sweep is not, and that is the point —
 * this module decides *what* to ask and what the answer means, and a fake that
 * can be read at a glance is what keeps those two questions apart.
 */
const required: RequiredAt = (margins) => 1 + margins.axial + margins.radial

describe('askFor', () => {
  it('asks the stack for nothing while all three boxes are the app’s', () => {
    expect(askFor(null, SHEET, required)).toEqual({
      stickout: null,
      margins: SHEET,
      solve: SHEET,
    })
  })

  it('takes a stated length as the length, and leaves the limits alone', () => {
    expect(askFor({ field: 'below', value: 20 }, SHEET, required)).toEqual({
      stickout: 20,
      margins: SHEET,
      solve: SHEET,
    })
  })

  /**
   * The rule of 2026-09-11: a stated clearance is solved for **alone**. With
   * the other limit left in, the length that came back would be the least that
   * met both, and the box the shop had just typed into would be the one number
   * on screen that did not drive anything.
   */
  it('solves a stated axial clearance with the radial limit dropped', () => {
    const ask = askFor({ field: 'axial', value: 2 }, SHEET, required)
    expect(ask.solve).toEqual({ axial: 2, radial: 0 })
    expect(ask.stickout).toBe(3)
  })

  it('solves a stated radial clearance the same way about', () => {
    const ask = askFor({ field: 'radial', value: 2 }, SHEET, required)
    expect(ask.solve).toEqual({ axial: 0, radial: 2 })
    expect(ask.stickout).toBe(3)
  })

  /**
   * The drawing is told both limits, not the one being solved for: the overlay
   * draws a margin line and writes a verdict, and drawing them against a nought
   * would say the stack clears a wall it is a thou off.
   */
  it('tells the drawing both limits, with the stated one in place', () => {
    expect(askFor({ field: 'axial', value: 2 }, SHEET, required).margins).toEqual({
      axial: 2,
      radial: 0.508,
    })
  })

  it('leaves the length to the stack where the holder states no nose', () => {
    expect(askFor({ field: 'axial', value: 2 }, SHEET, () => null).stickout).toBeNull()
  })
})

describe('boxesFor', () => {
  const drawn = { stickout: 20, overLimit: false }

  it('reads all three off the stack while nothing has been stated', () => {
    const boxes = boxesFor(null, SHEET, drawn, { axial: 0.6, radial: 0.9 })
    expect(boxes.below).toEqual({
      entered: null,
      value: 20,
      clamped: false,
      overLimit: false,
    })
    expect(boxes.axial).toEqual({
      entered: null,
      value: 0.6,
      asked: 0.508,
      short: false,
      held: null,
    })
    expect(boxes.radial).toEqual({
      entered: null,
      value: 0.9,
      asked: 0.508,
      short: false,
      held: null,
    })
  })

  it('holds a box that was typed into to what was typed', () => {
    const boxes = boxesFor({ field: 'axial', value: 2 }, SHEET, drawn, { axial: 2, radial: 0.9 })
    expect(boxes.axial.entered).toBe(2)
    expect(boxes.axial.asked).toBe(2)
    expect(boxes.axial.short).toBe(false)
  })

  /**
   * The whole reason the other limit may be dropped for the solve: it still
   * marks its box. A stated axial clearance that walks the holder into a wall
   * says so on the radial box rather than on nothing.
   */
  it('marks the untouched axis when the stated one walks it under the sheet', () => {
    const boxes = boxesFor({ field: 'axial', value: 2 }, SHEET, drawn, { axial: 2, radial: 0.2 })
    expect(boxes.radial.short).toBe(true)
    expect(boxes.radial.asked).toBe(0.508)
  })

  it('marks a gap that has gone into the material', () => {
    expect(boxesFor(null, SHEET, drawn, { axial: -0.3, radial: 0.9 }).axial.short).toBe(true)
  })

  it('does not mark a gap that meets its limit exactly', () => {
    expect(boxesFor(null, SHEET, drawn, { axial: 0.508, radial: 0.508 }).axial.short).toBe(false)
  })

  /**
   * Paul, 2026-09-11: "why is it overriding some values I enter? I am entering
   * 0.03 in and it is jumping to 0.056 in" — the stack was already as short as
   * its flutes allow, so every length it can be set to leaves more room than
   * that. The entry stands and this says the stack could not meet it.
   */
  it('says when the stack leaves more room than was asked for', () => {
    const boxes = boxesFor({ field: 'axial', value: 0.762 }, SHEET, drawn, {
      axial: 1.422,
      radial: 0.9,
    })
    expect(boxes.axial.held).toBe('more')
    expect(shownIn(boxes.axial)).toBe(0.762)
  })

  it('says when the stack cannot clear by as much as was asked', () => {
    const boxes = boxesFor({ field: 'axial', value: 2 }, SHEET, drawn, { axial: 1, radial: 0.9 })
    expect(boxes.axial.held).toBe('less')
  })

  it('says nothing about a met entry, or about a box nobody typed in', () => {
    expect(
      boxesFor({ field: 'axial', value: 2 }, SHEET, drawn, { axial: 2, radial: 0.9 }).axial.held,
    ).toBeNull()
    expect(boxesFor(null, SHEET, drawn, { axial: 2, radial: 0.9 }).axial.held).toBeNull()
  })

  /**
   * **The box obeys the entry** (Paul, 2026-09-11: "it should always obey the
   * value I enter and revise the other two"). Every other box is a reading off
   * the stack that was actually drawn, which is the only thing they can
   * honestly be — and the box that was typed in keeps the number that was typed
   * in, with {@link ClearanceBox.held} saying where the stack could not follow.
   */
  it('shows the entry where there is one and the reading everywhere else', () => {
    const boxes = boxesFor({ field: 'axial', value: 0.762 }, SHEET, drawn, {
      axial: 1.422,
      radial: 0.9,
    })
    expect(shownIn(boxes.axial)).toBe(0.762)
    expect(shownIn(boxes.radial)).toBe(0.9)
    expect(shownIn(boxes.below)).toBe(20)
  })

  /**
   * The tool is floored at its flutes and capped at what the holder can still
   * grip, so a stated length outside that is a length the stack will not take.
   * The box still shows it, and `clamped` is what says the drawing is elsewhere.
   */
  it('shows a stated length the stack would not take, rather than the length it took', () => {
    const boxes = boxesFor(
      { field: 'below', value: 60 },
      SHEET,
      { ...drawn, stickout: 42 },
      {
        axial: 0.6,
        radial: 0.9,
      },
    )
    expect(shownIn(boxes.below)).toBe(60)
    expect(boxes.below.clamped).toBe(true)
    expect(boxes.below.value).toBe(42)
  })

  it('says nothing about an axis nothing was measured on', () => {
    const boxes = boxesFor(null, SHEET, drawn, { axial: 0.6, radial: null })
    expect(boxes.radial.value).toBeNull()
    expect(boxes.radial.short).toBe(false)
  })

  it('does not mark a stated length the stack took', () => {
    expect(
      boxesFor({ field: 'below', value: 20 }, SHEET, drawn, { axial: 0.6, radial: 0.9 }).below
        .clamped,
    ).toBe(false)
  })

  it('carries the stack’s own over-limit through', () => {
    expect(
      boxesFor(null, SHEET, { stickout: 42, overLimit: true }, { axial: 0.6, radial: 0.9 }).below
        .overLimit,
    ).toBe(true)
  })
})
