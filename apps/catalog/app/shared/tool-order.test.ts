import { describe, expect, it } from 'vitest'
import type { CatalogTool } from '@toolpath/catalog-data'
import { firstBy, keptFirst, oneEach } from './tool-order'

const tools = ['a', 'b', 'c', 'd'].map((guid) => ({ guid }) as CatalogTool)
const guids = (of: ReadonlyArray<CatalogTool>) => of.map((each) => each.guid)

describe('the tools kept for a feature', () => {
  it('come first, in the order they were listed', () => {
    expect(guids(keptFirst(tools, new Set(['c', 'a'])))).toEqual(['a', 'c', 'b', 'd'])
  })

  /** A partition, not a sort: everything else keeps the order it arrived in. */
  it('leave the rest of the list alone', () => {
    expect(guids(keptFirst(tools, new Set(['d'])))).toEqual(['d', 'a', 'b', 'c'])
  })

  /** Nothing kept, or nothing kept that is on the list, changes nothing at all. */
  it('are the list itself when none of them are on it', () => {
    expect(keptFirst(tools, new Set())).toBe(tools)
    expect(keptFirst(tools, new Set(['elsewhere']))).toBe(tools)
  })
})

/**
 * **The same rule for a holder and a collet** (Paul, 2026-09-07: "can we float
 * confirmed tool assembly components to the top of the table lists?").
 */
describe('the rows a predicate picks out', () => {
  const rows = [{ guid: 'a' }, { guid: 'b' }, { guid: 'c' }]

  it('come first, and the rest keep their order', () => {
    expect(firstBy(rows, (each) => each.guid === 'c').map((each) => each.guid)).toEqual([
      'c',
      'a',
      'b',
    ])
  })

  it('are the list itself when the predicate picks none', () => {
    expect(firstBy(rows, (each) => each.guid === 'z')).toBe(rows)
  })
})

/**
 * **A tool the fill and a forgiven column both offer is still one row**
 * (2026-09-09): both are drawn from the set the rules removed, and the table
 * drew `TDMX0500` twice.
 */
describe('one row per tool', () => {
  it('keeps the first of each and the order they arrived in', () => {
    const [a, b, c] = tools
    expect(guids(oneEach([a!, b!, a!, c!, b!]))).toEqual(['a', 'b', 'c'])
  })

  it('leaves a list with nothing repeated as it is', () => {
    expect(guids(oneEach(tools))).toEqual(['a', 'b', 'c', 'd'])
  })
})
