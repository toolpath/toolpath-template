import { describe, expect, it } from 'vitest'
import type { CatalogTool } from '@toolpath/catalog-data'
import { keptFirst } from './tool-order'

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
