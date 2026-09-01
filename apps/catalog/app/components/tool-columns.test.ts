import { describe, expect, it } from 'vitest'
import { GEOMETRY_FIELDS } from '@toolpath/catalog-data'
import { TOOL_COLUMNS, isHolding, isStack } from './tool-table'

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
