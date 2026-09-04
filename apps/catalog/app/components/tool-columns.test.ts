import { describe, expect, it } from 'vitest'
import { GEOMETRY_FIELDS } from '@toolpath/catalog-data'
import { TAP_COLUMNS, TOOL_COLUMNS, isHolding, isStack } from './part-tool-table'

/**
 * **A column has to have a number behind it.**
 *
 * `LU` — ISO's usable length — sat in this list for months as "Usable length".
 * No vendor in this dataset states it and nothing derives it, so ticking it in
 * the column picker drew a column of dashes: a choice that does nothing, with
 * no error to say so (Paul, 2026-08-31: "what is the usable length? It's
 * showing as empty — what is the intent?").
 *
 * Every column is either a field the catalog defines, or one of the two the
 * table works out for itself — the holder and collet it is held in, and the
 * stickout the stack needs.
 */
describe('the columns the list offers', () => {
  it('names a field the catalog defines, or one the table works out', () => {
    const unknown = TOOL_COLUMNS.filter(
      (column) =>
        !isHolding(column.code) &&
        !isStack(column.code) &&
        GEOMETRY_FIELDS[column.code] === undefined,
    ).map((column) => column.code)

    expect(unknown).toEqual([])
  })
})

/**
 * **What the list opens with is a decision, not a leftover.**
 *
 * The column was "Stickout needed" — about a stack somebody had chosen a
 * holder for, empty on a fresh list, and turning itself on anyway (Paul,
 * 2026-08-31). It is the tool's own **length below holder** now: the overall
 * length less the shank the clamping rule holds, which is a number every tool
 * has and which decides whether it reaches (Paul, 2026-09-01). So it opens
 * with the rest, and the holder and collet still wait to be asked for.
 */
describe('the columns a list opens with', () => {
  it('opens with the numbers a tool is chosen on, reach among them', () => {
    expect(TOOL_COLUMNS.filter((column) => column.default).map((column) => column.code)).toEqual([
      'DC',
      'LCF',
      'LBH',
      'LD',
      'OAL',
      'RE',
      'NOF',
      'SFDM',
    ])
  })

  it('leaves the holder and the collet for somebody to ask for', () => {
    for (const code of ['holder', 'collet']) {
      expect(TOOL_COLUMNS.find((column) => column.code === code)?.default).toBe(false)
    }
  })
})

/**
 * **The tap list offers the numbers a tap has** (Paul, 2026-09-02: "look at
 * the fields on a tap and allow me to use those columns if I edit the tap
 * table").
 *
 * A tap in this catalog states `DC`, `SFDM`, `OAL`, `LCF` and `NOF`, and the
 * build derives `LBH` and `LD` from them. Corner radius and point angle were
 * columns of dashes on the tap table this replaced; they are not columns here,
 * so ticking one cannot draw an empty one.
 */
describe('the columns a tap list offers', () => {
  /** Every number 129 taps in the dataset carry, and nothing they do not. */
  const ON_A_TAP = ['DC', 'SFDM', 'OAL', 'LCF', 'NOF', 'LBH', 'LD']

  it('offers a number a tap carries, or the holding every list can ask for', () => {
    const unknown = TAP_COLUMNS.filter(
      (column) => !isHolding(column.code) && !ON_A_TAP.includes(column.code),
    ).map((column) => column.code)

    expect(unknown).toEqual([])
  })

  it('opens with all of them, and leaves the holding to be asked for', () => {
    expect(TAP_COLUMNS.filter((column) => column.default).map((column) => column.code)).toEqual([
      'DC',
      'LCF',
      'LBH',
      'LD',
      'OAL',
      'NOF',
      'SFDM',
    ])
    for (const code of ['holder', 'collet']) {
      expect(TAP_COLUMNS.find((column) => column.code === code)?.default).toBe(false)
    }
  })

  /**
   * Two of them mean something else on a tap than on a mill, and say so: `DC`
   * is the thread's nominal diameter rather than a width of cut, and `LCF` is
   * the threaded length. `LBH` is the tap's own length below the holder —
   * "Stickout needed" was a heading about a stack nothing here has chosen.
   */
  it('calls them what they are on a tap', () => {
    const label = (code: string) => TAP_COLUMNS.find((column) => column.code === code)?.label

    expect(label('DC')).toBe('Thread diameter')
    expect(label('LCF')).toBe('Thread length')
    expect(label('LBH')).toBe('Below holder')
  })
})
