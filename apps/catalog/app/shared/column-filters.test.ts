import { describe, expect, it } from 'vitest'
import {
  AXES_IN_TOOL_COLUMNS,
  askOfComponentColumn,
  askOfToolColumn,
  sayBound,
} from './column-filters'
import { columnsFor } from './component-columns'
import { termAxesFor } from './component-query'

/**
 * **One question, one place to answer it** — and the place is the column that
 * shows the value (Paul, 2026-09-08).
 */
describe('what a tool column asks', () => {
  it('narrows the vendor, the type and the family on their own words', () => {
    expect(askOfToolColumn('brand')).toEqual({ shape: 'terms', axis: 'brand' })
    // The phrases the columns show — `Reduced shank bull nose end mill`, the
    // vendor's line — rather than the `form` and `familyId` behind them.
    expect(askOfToolColumn('type')).toEqual({ shape: 'terms', axis: 'type' })
    expect(askOfToolColumn('family')).toEqual({ shape: 'terms', axis: 'family' })
  })

  it('searches the catalog number, which is the one answer a shop arrives with', () => {
    expect(askOfToolColumn('catalogNumber')).toEqual({ shape: 'text' })
  })

  it('reads every geometry code as a length unless it is not one', () => {
    expect(askOfToolColumn('DC')).toEqual({ shape: 'range', kind: 'length' })
    expect(askOfToolColumn('LBH')).toEqual({ shape: 'range', kind: 'length' })
    // A count converts to nothing, an angle is degrees in either unit, and an
    // L/D is a ratio: reading one as a length offers to turn 4 flutes into
    // 0.157 of them.
    expect(askOfToolColumn('NOF')).toEqual({ shape: 'range', kind: 'count' })
    expect(askOfToolColumn('SIG')).toEqual({ shape: 'range', kind: 'deg' })
    expect(askOfToolColumn('LD')).toEqual({ shape: 'range', kind: 'ratio' })
  })

  /** They set the holding on that row; there is no value in them to narrow on. */
  it('asks nothing of the holder and collet cells', () => {
    expect(askOfToolColumn('holder')).toBeNull()
    expect(askOfToolColumn('collet')).toBeNull()
  })

  it('names every axis a header takes over from the button row', () => {
    for (const axis of AXES_IN_TOOL_COLUMNS) {
      expect(askOfToolColumn(axis)).not.toBeNull()
    }
  })
})

describe('what a holder or collet column asks', () => {
  it('offers every term axis on the column that shows it', () => {
    for (const kind of ['holder', 'collet'] as const) {
      for (const axis of termAxesFor(kind)) {
        expect(askOfComponentColumn(kind, axis.code)).toEqual({
          shape: 'terms',
          axis: axis.code,
        })
      }
    }
  })

  /**
   * The filter panel built one range control per length column, so the columns
   * were already the list of numbers a holder is picked on. They keep it.
   */
  it('offers a range on every length, and on nothing else', () => {
    for (const kind of ['holder', 'collet'] as const) {
      const ranges = columnsFor(kind)
        .filter((column) => askOfComponentColumn(kind, column.code)?.shape === 'range')
        .map((column) => column.code)

      expect(ranges).toEqual(
        columnsFor(kind)
          .filter((column) => column.kind === 'length')
          .map((column) => column.code),
      )
    }
  })

  /**
   * The type a holder reads as is its taper, its series and its clamping said
   * as one phrase — and that phrase is what a shop calls the thing, so it is a
   * list of its own (Paul, 2026-09-08). The three columns behind it still ask
   * for themselves: one press for every BT30, or one for every BT30 ER11
   * collet chuck.
   */
  it('searches the catalog number, the one answer a shop arrives with', () => {
    expect(askOfComponentColumn('holder', 'catalogNumber')).toEqual({ shape: 'text' })
    expect(askOfComponentColumn('collet', 'catalogNumber')).toEqual({ shape: 'text' })
  })

  it('offers the type a component reads as, as a list', () => {
    expect(askOfComponentColumn('holder', 'type')).toEqual({ shape: 'terms', axis: 'type' })
    expect(askOfComponentColumn('collet', 'type')).toEqual({ shape: 'terms', axis: 'type' })
  })
})

/**
 * The words a filter dialog warns with, in the unit being read in — a warning
 * about a number has to say the number.
 */
describe('a bound said in words', () => {
  it('converts a length and leaves a count alone', () => {
    expect(sayBound('length', { max: 8 }, 'millimeters')).toBe('at most 8.00 mm')
    expect(sayBound('count', { min: 4 }, 'inches')).toBe('at least 4')
  })

  it('says a two-ended bound as a span, and an exact one as the number', () => {
    expect(sayBound('count', { min: 2, max: 4 }, 'millimeters')).toBe('2 to 4')
    expect(sayBound('count', { min: 4, max: 4 }, 'millimeters')).toBe('4')
  })

  it('says a bound with no ends at all rather than nothing', () => {
    expect(sayBound('length', {}, 'millimeters')).toBe('anything')
  })
})
