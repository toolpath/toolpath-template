import { describe, expect, it } from 'vitest'
import { dropEdge, movedBy, movedTo, orderedCodes } from './column-order'

describe('the column order', () => {
  const order = ['DC', 'LCF', 'LD', 'RE']

  it('draws the columns in it', () => {
    expect(orderedCodes(['LD', 'DC', 'RE', 'LCF'], order)).toEqual(order)
  })

  /** A column added after an order was saved has never been placed. */
  it('puts a column the order has never heard of on the end', () => {
    expect(orderedCodes(['DC', 'NEW', 'LCF'], order)).toEqual(['DC', 'LCF', 'NEW'])
  })

  it('ignores a code that is no longer a column', () => {
    expect(orderedCodes(['DC', 'LCF'], ['GONE', 'LCF', 'DC'])).toEqual(['LCF', 'DC'])
  })

  it('moves a code to an index, the rest closing up behind it', () => {
    expect(movedTo(order, 'RE', 0)).toEqual(['RE', 'DC', 'LCF', 'LD'])
    expect(movedTo(order, 'DC', 2)).toEqual(['LCF', 'LD', 'DC', 'RE'])
  })

  /**
   * The index is read after the code is lifted out, so a drag past the end
   * lands on the end rather than one short of it.
   */
  it('lands on the end when dragged past it', () => {
    expect(movedTo(order, 'DC', 9)).toEqual(['LCF', 'LD', 'RE', 'DC'])
  })

  it('says nothing about a code that is not in the order', () => {
    expect(movedTo(order, 'NOPE', 0)).toEqual(order)
    expect(movedBy(order, 'NOPE', 1)).toEqual(order)
  })

  /** The keyboard's way of doing the same thing, and it stops at both ends. */
  it('moves one place at a time, staying inside the list', () => {
    expect(movedBy(order, 'LD', -1)).toEqual(['DC', 'LD', 'LCF', 'RE'])
    expect(movedBy(order, 'DC', -1)).toEqual(order)
    expect(movedBy(order, 'RE', 1)).toEqual(order)
  })
})

/**
 * The line that says where a dragged column would land.
 *
 * **Decided by `movedTo`, not by what looks right** (Paul, 2026-09-11: "the
 * list should show a blue line (2px horizontal) where the item will be
 * dropped"). `movedTo` lifts the code out before reading the index, so a drop
 * below where the drag started lands *after* the row under the pointer and one
 * above lands *before* it — and a line drawn on the other edge would promise a
 * position the drop does not deliver.
 */
describe('where a dragged column would land', () => {
  const ORDER = ['A', 'B', 'C', 'D']

  it('goes under the row when the drag is downwards', () => {
    expect(dropEdge(ORDER, 'A', 2)).toBe('below')
    // And that is where it lands: [B, C, A, D].
    expect(movedTo(ORDER, 'A', 2)).toEqual(['B', 'C', 'A', 'D'])
  })

  it('goes over the row when the drag is upwards', () => {
    expect(dropEdge(ORDER, 'D', 1)).toBe('above')
    expect(movedTo(ORDER, 'D', 1)).toEqual(['A', 'D', 'B', 'C'])
  })

  /** A row cannot land on itself, so it draws no line while it is picked up. */
  it('draws nothing over the row being dragged', () => {
    expect(dropEdge(ORDER, 'B', 1)).toBeNull()
  })

  it('draws nothing for a code or a row this list does not have', () => {
    expect(dropEdge(ORDER, 'Z', 2)).toBeNull()
    expect(dropEdge(ORDER, 'A', -1)).toBeNull()
    expect(dropEdge(ORDER, 'A', 4)).toBeNull()
  })
})
