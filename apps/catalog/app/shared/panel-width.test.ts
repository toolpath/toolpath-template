import { describe, expect, it } from 'vitest'
import {
  clampPanel,
  panelWidth,
  NARROWEST,
  OPENS_AT,
  OPENS_AT_FOR_A_GROUP,
  readPanelWidth,
  widestPanel,
  WIDEST_SHARE,
  writePanelWidth,
} from './panel-width'

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

describe('what the panel opens at', () => {
  it('opens a reading at one width and a group at a wider one', () => {
    expect(panelWidth(null, false)).toBe(OPENS_AT)
    expect(panelWidth(null, true)).toBe(OPENS_AT_FOR_A_GROUP)
  })

  /**
   * The rule the defaults are only a default *of*: a width somebody dragged to
   * is the width, and opening the group editor does not walk on it. A panel
   * that jumped 96px every time a group opened would be undoing that drag.
   */
  it('keeps a stated width when a group opens', () => {
    expect(panelWidth(288, true)).toBe(288)
    expect(panelWidth(288, false)).toBe(288)
  })

  it('never opens narrower than a row can be read at', () => {
    expect(panelWidth(40, false)).toBe(NARROWEST)
  })
})

describe('how far the edge may be dragged', () => {
  it('holds a drag between the narrowest and a share of the viewer', () => {
    expect(clampPanel(80, 1200)).toBe(NARROWEST)
    expect(clampPanel(500, 1200)).toBe(500)
    expect(clampPanel(2000, 1200)).toBe(1200 * WIDEST_SHARE)
  })

  /**
   * A viewer not laid out yet is not a viewer of zero width: clamping a drag
   * against it would snap the panel to the floor and then snap it back when the
   * measurement turned up.
   */
  it('falls back to a width rather than to nothing when the room is unknown', () => {
    expect(widestPanel(0)).toBe(OPENS_AT_FOR_A_GROUP)
    expect(widestPanel(Number.NaN)).toBe(OPENS_AT_FOR_A_GROUP)
    expect(clampPanel(2000, 0)).toBe(OPENS_AT_FOR_A_GROUP)
  })

  /** A viewer too narrow for both still gives the panel a width to be. */
  it('never lets the ceiling fall under the floor', () => {
    expect(widestPanel(200)).toBe(NARROWEST)
  })

  it('answers a width for a drag that is not a number', () => {
    expect(clampPanel(Number.NaN, 1200)).toBe(OPENS_AT)
  })
})

describe('what the browser remembers', () => {
  it('says nothing for a shop that has never dragged it', () => {
    expect(readPanelWidth(storage())).toBeNull()
    expect(readPanelWidth(null)).toBeNull()
  })

  it('reads back what was stated, rounded', () => {
    const held = storage()
    writePanelWidth(held, 412.6)
    expect(readPanelWidth(held)).toBe(413)
  })

  /** Forgetting it is what puts the two defaults back, so it is a removal. */
  it('forgets it rather than storing a default', () => {
    const held = storage()
    writePanelWidth(held, 500)
    writePanelWidth(held, null)
    expect(held.size).toBe(0)
    expect(panelWidth(readPanelWidth(held), true)).toBe(OPENS_AT_FOR_A_GROUP)
  })

  it('ignores anything stored that is not a width', () => {
    const held = storage()
    held.setItem('tool-catalog.panel-width', 'wide')
    expect(readPanelWidth(held)).toBeNull()
    held.setItem('tool-catalog.panel-width', '-40')
    expect(readPanelWidth(held)).toBeNull()
  })
})
