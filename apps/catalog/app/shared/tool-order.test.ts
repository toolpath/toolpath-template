import { describe, expect, it } from 'vitest'
import type { CatalogTool } from '@toolpath/catalog-data'
import { firstBy, keptFirst } from './tool-order'

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
