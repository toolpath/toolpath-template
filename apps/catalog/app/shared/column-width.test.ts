import { describe, expect, it } from 'vitest'
import {
  clampColumn,
  columnWidth,
  NARROWEST,
  OPENS_AT,
  OPENS_AT_FOR_A_GROUP,
  readColumnWidth,
  widestColumn,
  WIDEST_SHARE,
  writeColumnWidth,
} from './column-width'

/** A `localStorage` that is only a map, which is all these rules ask of one. */
const storage = () => {
  const held = new Map<string, string>()
  return {
    getItem: (key: string) => held.get(key) ?? null,
    setItem: (key: string, value: string) => void held.set(key, value),
    removeItem: (key: string) => void held.delete(key),
    get size() {
      return held.size
    },
  }
}

describe('what the column opens at', () => {
  it('opens a reading at one width and a group at a wider one', () => {
    expect(columnWidth(null, false)).toBe(OPENS_AT)
    expect(columnWidth(null, true)).toBe(OPENS_AT_FOR_A_GROUP)
  })

  /**
   * The rule the defaults are only a default *of*: a width somebody dragged to
   * is the width, and opening the group editor does not walk on it. A column
   * that jumped 96px every time a group opened would be undoing that drag.
   */
  it('keeps a stated width when a group opens', () => {
    expect(columnWidth(288, true)).toBe(288)
    expect(columnWidth(288, false)).toBe(288)
  })

  it('never opens narrower than a row can be read at', () => {
    expect(columnWidth(40, false)).toBe(NARROWEST)
  })
})

describe('how far the edge may be dragged', () => {
  it('holds a drag between the narrowest and a share of the viewer', () => {
    expect(clampColumn(80, 1200)).toBe(NARROWEST)
    expect(clampColumn(500, 1200)).toBe(500)
    expect(clampColumn(2000, 1200)).toBe(1200 * WIDEST_SHARE)
  })

  /**
   * A viewer not laid out yet is not a viewer of zero width: clamping a drag
   * against it would snap the column to the floor and then snap it back when the
   * measurement turned up.
   */
  it('falls back to a width rather than to nothing when the room is unknown', () => {
    expect(widestColumn(0)).toBe(OPENS_AT_FOR_A_GROUP)
    expect(widestColumn(Number.NaN)).toBe(OPENS_AT_FOR_A_GROUP)
    expect(clampColumn(2000, 0)).toBe(OPENS_AT_FOR_A_GROUP)
  })

  /** A viewer too narrow for both still gives the column a column to be. */
  it('never lets the ceiling fall under the floor', () => {
    expect(widestColumn(200)).toBe(NARROWEST)
  })

  it('answers a width for a drag that is not a number', () => {
    expect(clampColumn(Number.NaN, 1200)).toBe(OPENS_AT)
  })
})

describe('what the browser remembers', () => {
  it('says nothing for a shop that has never dragged it', () => {
    expect(readColumnWidth(storage())).toBeNull()
    expect(readColumnWidth(null)).toBeNull()
  })

  it('reads back what was stated, rounded', () => {
    const held = storage()
    writeColumnWidth(held, 412.6)
    expect(readColumnWidth(held)).toBe(413)
  })

  /** Forgetting it is what puts the two defaults back, so it is a removal. */
  it('forgets it rather than storing a default', () => {
    const held = storage()
    writeColumnWidth(held, 500)
    writeColumnWidth(held, null)
    expect(held.size).toBe(0)
    expect(columnWidth(readColumnWidth(held), true)).toBe(OPENS_AT_FOR_A_GROUP)
  })

  it('ignores anything stored that is not a width', () => {
    const held = storage()
    held.setItem('tool-catalog.column-width', 'wide')
    expect(readColumnWidth(held)).toBeNull()
    held.setItem('tool-catalog.column-width', '-40')
    expect(readColumnWidth(held)).toBeNull()
  })
})
