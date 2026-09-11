import { describe, expect, it } from 'vitest'
import { defaultLayout, readLayout, reconciled, written, type LayoutColumn } from './column-layout'

/**
 * Which columns a list shows, and in what order, across a reload.
 *
 * The whole risk in storing this is the *second* visit: a stored answer is
 * about the columns that existed when it was written, and this catalog's column
 * sets move. Column widths were taken out of storage on 2026-09-11 for exactly
 * that reason — the kit stores them positionally, so hiding one re-applies
 * every width to the wrong column. Codes survive that, but only if what comes
 * back is reconciled rather than trusted, which is what this pins.
 */
const COLUMNS: ReadonlyArray<LayoutColumn> = [
  { code: 'catalogNumber', default: true },
  { code: 'brand', default: true },
  { code: 'DC', default: true },
  { code: 'RE', default: false },
]

describe('the columns a list shows', () => {
  it('starts with the columns that open by default, in the declared order', () => {
    expect(defaultLayout(COLUMNS)).toEqual({
      hidden: ['RE'],
      order: ['catalogNumber', 'brand', 'DC', 'RE'],
      touched: [],
    })
  })

  it('gives a browser that has stored nothing the defaults', () => {
    expect(readLayout(null, COLUMNS)).toEqual(defaultLayout(COLUMNS))
  })

  /** A half-written or hand-edited key is not worth a blank screen. */
  it('falls back to the defaults on anything it cannot read', () => {
    expect(readLayout('{"hidden":', COLUMNS)).toEqual(defaultLayout(COLUMNS))
    expect(readLayout('"a string"', COLUMNS)).toEqual(defaultLayout(COLUMNS))
    expect(readLayout('{"hidden":{"DC":true},"order":7}', COLUMNS)).toEqual(defaultLayout(COLUMNS))
  })

  it('gives back exactly what was stored where nothing has changed', () => {
    const kept = {
      hidden: ['brand'],
      order: ['DC', 'catalogNumber', 'brand', 'RE'],
      touched: ['brand', 'RE'],
    }

    expect(readLayout(written(kept, COLUMNS), COLUMNS)).toEqual(kept)
  })

  /** A code nothing draws is an answer about nothing. */
  it('drops a column the catalog no longer has', () => {
    const stored = {
      hidden: ['brand', 'LCF'],
      order: ['LCF', 'DC', 'catalogNumber', 'brand', 'RE'],
      touched: ['LCF'],
      known: ['catalogNumber', 'brand', 'DC', 'RE', 'LCF'],
    }

    expect(reconciled(stored, COLUMNS)).toEqual({
      hidden: ['brand'],
      order: ['DC', 'catalogNumber', 'brand', 'RE'],
      touched: [],
    })
  })

  /**
   * **`known` is what tells a new column from one somebody left showing.**
   * Without it every browser that had ever opened the picker would get the next
   * off-by-default column turned on, and keep it on.
   */
  it('gives a column added since the layout was saved its own default', () => {
    const later: ReadonlyArray<LayoutColumn> = [
      ...COLUMNS,
      { code: 'SIG', default: false },
      { code: 'NOF', default: true },
    ]
    const stored = written({ hidden: ['RE'], order: ['DC', 'catalogNumber'], touched: [] }, COLUMNS)

    expect(readLayout(stored, later)).toEqual({
      hidden: ['RE', 'SIG'],
      // Appended, which neither drops it nor pretends somebody placed it.
      order: ['DC', 'catalogNumber', 'brand', 'RE', 'SIG', 'NOF'],
      touched: [],
    })
  })

  /** A column somebody unhid stays unhidden when a later build adds others. */
  it('keeps a column the shop turned on when the column set grows', () => {
    const later: ReadonlyArray<LayoutColumn> = [...COLUMNS, { code: 'SIG', default: false }]
    const stored = written({ hidden: [], order: [], touched: ['RE'] }, COLUMNS)

    expect(readLayout(stored, later)).toMatchObject({ hidden: ['SIG'], touched: ['RE'] })
  })
})
