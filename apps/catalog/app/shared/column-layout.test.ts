import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  COLUMN_KEY,
  defaultLayout,
  readLayout,
  reconciled,
  useColumnLayout,
  written,
  type LayoutColumn,
} from './column-layout'

/**
 * Which columns a list shows, and in what order, across a reload.
 *
 * The whole risk in storing this is the *second* visit: a stored answer is
 * about the columns that existed when it was written, and this catalog's column
 * sets move. Codes survive that, but only if what comes back is reconciled
 * rather than trusted, which is what this pins.
 *
 * A column *width* is the other case: it is stored positionally, so it cannot
 * be reconciled at all and is thrown away instead — `shared/column-width.ts`,
 * and the press that throws it is at the bottom of this file.
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

/**
 * The press that edits the columns, and what it costs a dragged width.
 *
 * **Every stored width goes** (Paul, 2026-09-11: "on changing columns
 * shown/hidden delete all localstorage keys saving column widths … Go back to
 * the default sizes."). The rule is `shared/column-width.ts`; this is the wire
 * from the picker to it, which is the part that can be got wrong silently —
 * clearing on the columns *changing* rather than on the press throws away the
 * width the list is about to settle on, since the list edits its own columns a
 * tick after it loads.
 */
describe('the press that edits the columns', () => {
  const COLUMNS: ReadonlyArray<LayoutColumn> = [
    { code: 'catalogNumber', default: true },
    { code: 'brand', default: true },
    { code: 'RE', default: false },
  ]

  beforeEach(() => {
    localStorage.clear()
  })

  const widths = () => Object.keys(localStorage).filter((key) => key.startsWith('table-'))

  it('drops every stored width when a column is shown or hidden', () => {
    localStorage.setItem('table-part-tools.catalogNumber.brand', '8px 50% 50%')
    localStorage.setItem('table-part-holders.catalogNumber', '8px 100%')
    const { result } = renderHook(() => useColumnLayout(COLUMN_KEY.tools, COLUMNS))

    act(() => {
      result.current.toggle('brand')
    })

    expect(widths()).toEqual([])
    expect(result.current.hidden).toContain('brand')
  })

  it('drops them when the columns are dragged into another order too', () => {
    localStorage.setItem('table-part-tools.catalogNumber.brand', '8px 50% 50%')
    const { result } = renderHook(() => useColumnLayout(COLUMN_KEY.tools, COLUMNS))

    act(() => {
      result.current.reorder(['brand', 'catalogNumber', 'RE'])
    })

    expect(widths()).toEqual([])
  })

  /**
   * The list turning a column on for itself is not a press. A width stored
   * under the set the list settles on has to survive the settling.
   */
  it('leaves them alone when the list edits its own columns', () => {
    localStorage.setItem('table-part-tools.catalogNumber.brand.RE', '8px 40% 30% 30%')
    const { result } = renderHook(() => useColumnLayout(COLUMN_KEY.tools, COLUMNS))

    act(() => {
      result.current.setHidden((hidden) => hidden.filter((code) => code !== 'RE'))
    })

    expect(widths()).toEqual(['table-part-tools.catalogNumber.brand.RE'])
    expect(result.current.hidden).not.toContain('RE')
  })
})
