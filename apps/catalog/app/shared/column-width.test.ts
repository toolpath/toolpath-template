import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WEIGHT,
  columnWeight,
  fillingWidth,
  forgetStoredWidths,
  widthId,
} from './column-width'

/**
 * How wide a column is.
 *
 * **The zero floor is the whole rule.** A track with a floor in it is a track
 * that can refuse to shrink, and thirteen of those inside a panel narrower than
 * their sum is a list that overflows its box — which is what the tool list did
 * until 2026-09-11. What is left is a weight, so the map beside the columns
 * finally says something: ten parts of catalogue number to six of flute count,
 * out of whatever room there is.
 */
describe('how wide a column is', () => {
  it('asks for a share of the box rather than a floor under it', () => {
    expect(fillingWidth('10rem')).toBe('minmax(0, 10fr)')
    expect(fillingWidth('6rem')).toBe('minmax(0, 6fr)')
  })

  it('reads the parts a column asks for out of its rem', () => {
    expect(columnWeight('12rem')).toBe(12)
    expect(columnWeight('7.5rem')).toBe(7.5)
  })

  /**
   * A width map is read here and nowhere else, so anything that is not a plain
   * rem weighs what an unstated column does rather than becoming a second,
   * silent sizing rule.
   */
  it('weighs anything that is not a rem as an unstated column', () => {
    expect(columnWeight('160px')).toBe(DEFAULT_WEIGHT)
    expect(columnWeight('20%')).toBe(DEFAULT_WEIGHT)
    expect(columnWeight('0rem')).toBe(DEFAULT_WEIGHT)
    expect(columnWeight('')).toBe(DEFAULT_WEIGHT)
  })
})

/**
 * Where the kit keeps what somebody dragged (Paul, 2026-09-11: "the column
 * widths should be stored in local storage but invalidate the old stores/ids
 * every time a column is added or hidden").
 *
 * `@toolpath/ui` writes a grid track list under `table-<id>` — positional, and
 * silent about which column each track was for. The kit guards the one case it
 * can see, a change in the column *count*, and a swap or a reorder leaves that
 * alone. So the id carries the column set, and a set that has changed asks a
 * different key rather than being handed the wrong answer.
 */
describe('where a list keeps its dragged widths', () => {
  it('names the id after the list and the columns on screen', () => {
    expect(widthId('part-tools', ['catalogNumber', 'brand', 'DC'])).toBe(
      'part-tools.catalogNumber.brand.DC',
    )
  })

  it('asks a different key once a column is hidden, added or moved', () => {
    const shown = ['catalogNumber', 'brand', 'DC']
    const hidden = widthId('part-tools', ['catalogNumber', 'DC'])
    const added = widthId('part-tools', [...shown, 'RE'])
    // A reorder is a rearrangement of the very positions a track list indexes.
    const moved = widthId('part-tools', ['brand', 'catalogNumber', 'DC'])
    const same = widthId('part-tools', shown)

    expect(new Set([hidden, added, moved, same]).size).toBe(4)
    expect(widthId('part-tools', shown)).toBe(same)
  })

  /**
   * **Editing the columns puts every list back on its defaults** (Paul,
   * 2026-09-11: "I don't want columns to change size as I show and hide
   * columns"). Every list, not this one: a stored width is an answer about a
   * column set, and the press that edits one set has invalidated the idea that
   * an old answer is worth resurfacing.
   */
  describe('clearing the stored widths', () => {
    const store = (entries: Record<string, string>): Storage => {
      const held = new Map(Object.entries(entries))
      return {
        get length() {
          return held.size
        },
        key: (at: number) => [...held.keys()][at] ?? null,
        getItem: (key: string) => held.get(key) ?? null,
        setItem: (key: string, value: string) => held.set(key, value),
        removeItem: (key: string) => void held.delete(key),
        clear: () => held.clear(),
      } as Storage
    }

    it('drops every width any list has stored, and nothing else', () => {
      const held = store({
        'table-part-tools.catalogNumber.brand': 'a',
        'table-part-tools.catalogNumber.brand.DC': 'b',
        'table-part-holders.catalogNumber': 'c',
        'tool-catalog.columns.tools': 'd',
        'tool-catalog.preferences': 'e',
      })

      forgetStoredWidths(held)

      expect(held.length).toBe(2)
      expect(held.getItem('tool-catalog.columns.tools')).toBe('d')
      expect(held.getItem('tool-catalog.preferences')).toBe('e')
    })

    it('does nothing where a browser has no storage', () => {
      expect(() => forgetStoredWidths(null)).not.toThrow()
    })
  })
})
