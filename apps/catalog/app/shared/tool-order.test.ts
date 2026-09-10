import { describe, expect, it } from 'vitest'
import type { CatalogTool } from '@toolpath/catalog-data'
import { capRows, firstBy, keptFirst, oneEach } from './tool-order'

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

/**
 * **A cap over a list two sources fill silently empties the shorter one**
 * (Paul, 2026-09-09: a ⌀0.125 in pocket widened to ⌀0.5 in "doesn't obey my new
 * entry and show the tools … sometimes it stays at 0.125"). What a forgiven
 * column offers goes under what the rules kept, and on the scraped catalog the
 * rules kept 2,197 tools against a cap of 2,000 — so every override row fell
 * past the end of the slice and widening the filter changed nothing on screen.
 *
 * Written against the shape rather than a number, for the same reason
 * `tool-fit.ts` § `spreadOver` is: a cap raised later must not be able to pass
 * this by being larger.
 */
describe('the row cap', () => {
  const many = (prefix: string, count: number) =>
    Array.from({ length: count }, (_, at) => ({ guid: `${prefix}${String(at)}` }) as CatalogTool)

  it('leaves a list that already fits alone', () => {
    expect(guids(capRows(tools, new Set(['c']), 10))).toEqual(['a', 'b', 'c', 'd'])
  })

  it('is a plain slice while nothing is reserved', () => {
    expect(guids(capRows(tools, new Set(), 2))).toEqual(['a', 'b'])
  })

  it('keeps reserved rows the leading rows would otherwise have crowded out', () => {
    const rows = [...many('fit-', 12), ...many('over-', 12)]
    const kept = capRows(rows, new Set(guids(many('over-', 12))), 10)

    expect(kept).toHaveLength(10)
    expect(guids(kept).filter((guid) => guid.startsWith('over-'))).toHaveLength(5)
    // Order is untouched: the cap decides which rows go, never where they sit.
    expect(guids(kept)).toEqual([
      'fit-0',
      'fit-1',
      'fit-2',
      'fit-3',
      'fit-4',
      'over-0',
      'over-1',
      'over-2',
      'over-3',
      'over-4',
    ])
  })

  /** Reserved rows take a share, not the cap: what fits is still the answer to reach for first. */
  it('gives the leading rows the room the reserved ones do not need', () => {
    const rows = [...many('fit-', 20), ...many('over-', 2)]
    const kept = capRows(rows, new Set(['over-0', 'over-1']), 10)

    expect(guids(kept).filter((guid) => guid.startsWith('fit-'))).toHaveLength(8)
    expect(guids(kept).filter((guid) => guid.startsWith('over-'))).toHaveLength(2)
  })
})
