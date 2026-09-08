import { describe, expect, it } from 'vitest'
import type { CatalogTool } from '@toolpath/catalog-data'
import type { Verdict } from './judge'
import type { Rule } from './rules'
import { overridableCount, overridableTally, overridableTools } from './tool-fit'

/**
 * The removed half of a verdict, which is all an override reads.
 *
 * Built from literals rather than judged, the way `judge.ts` is tested: what is
 * under test is which removals a column may forgive, and that is a question
 * about the reasons rather than about the tools.
 */
const bound = (field: string): Rule =>
  ({
    line: 1,
    stage: 'tool',
    level: 'must',
    toolTypes: ['*'],
    test: { kind: 'bound', field, operator: '<=', base: { kind: 'feature' } },
    text: `${field} rule`,
    note: '',
  }) as unknown as Rule

const removed = (guid: string, fields: ReadonlyArray<string>, miss: number): Verdict =>
  ({
    tool: { guid } as CatalogTool,
    removed: fields.map((field) => ({
      rule: bound(field),
      text: `${field} over`,
      shortfall: miss,
    })),
    warned: [],
    demoted: [],
    key: [],
    readings: [],
  }) as unknown as Verdict

/** Removed for something no column asks: the wrong kind of tool for the feature. */
const wrongKind = (guid: string): Verdict =>
  ({
    tool: { guid } as CatalogTool,
    removed: [{ rule: null, text: 'the tool types this feature considers' }],
    warned: [],
    demoted: [],
    key: [],
    readings: [],
  }) as unknown as Verdict

const all = (...guids: ReadonlyArray<string>) => new Set(guids)

describe('what a column offers to forgive', () => {
  it('counts a tool that only this column turns down', () => {
    const excluded = [removed('a', ['diameter'], 1), removed('b', ['flute length'], 1)]

    expect(overridableTally(excluded, all('a', 'b'))).toEqual({ DC: 1, LCF: 1 })
  })

  /**
   * A cutter turned down on both is not brought back by forgiving either, so
   * counting it under both would promise a row that never appears.
   */
  it('counts a tool two columns turn down under neither', () => {
    const excluded = [removed('a', ['diameter', 'flute length'], 1)]

    expect(overridableTally(excluded, all('a'))).toEqual({})
  })

  it('leaves out what the filters do not admit in the first place', () => {
    expect(overridableTally([removed('a', ['diameter'], 1)], all())).toEqual({})
  })

  /** No filter asks "is this the right kind of tool", so no filter forgives it. */
  it('offers nothing for a removal no column asks about', () => {
    expect(overridableTally([wrongKind('a')], all('a'))).toEqual({})
    expect(overridableTools([wrongKind('a')], all('a'), ['DC'], 10)).toEqual([])
  })
})

describe('what a forgiven column puts back', () => {
  it('forgives only the columns named', () => {
    const excluded = [removed('wide', ['diameter'], 1), removed('short', ['flute length'], 1)]

    expect(overridableTools(excluded, all('wide', 'short'), ['DC'], 10).map((v) => v.tool.guid)) //
      .toEqual(['wide'])
  })

  it('forgives a tool two columns turn down once both are named', () => {
    const excluded = [removed('both', ['diameter', 'flute length'], 1)]

    expect(overridableTools(excluded, all('both'), ['DC'], 10)).toEqual([])
    expect(
      overridableTools(excluded, all('both'), ['DC', 'LCF'], 10).map((v) => v.tool.guid),
    ).toEqual(['both'])
  })

  it('forgives nothing while nothing is named', () => {
    expect(overridableTools([removed('a', ['diameter'], 1)], all('a'), [], 10)).toEqual([])
  })

  /**
   * **A cap that hides the end of the range somebody widened *to* is worse than
   * no override at all** (Paul, 2026-09-08: "it still doesn't seem to be going
   * up to the bounds — I'm sure there are 1/2 inch tools with greater than
   * 0.980 inch flute length in this library"). The list is nearest first, so a
   * cap fills every slot with the tools that miss by the least; against a
   * 38,000-tool catalog a cap of 200 was entirely ⌀12 mm cutters and never
   * reached the 663 half-inch ones the filter had been typed to find.
   *
   * The cap is the table's own row cap now. What it still drops is counted, so
   * the list can say it rather than read as the whole answer.
   */
  it('takes the nearest first, and counts what the cap dropped', () => {
    const excluded = [3, 1, 2, 4].map((miss) => removed(`miss-${String(miss)}`, ['diameter'], miss))

    expect(overridableTools(excluded, all(...excluded.map((v) => v.tool.guid)), ['DC'], 2)) //
      .toEqual([excluded[1], excluded[2]])
    expect(overridableCount(excluded, all(...excluded.map((v) => v.tool.guid)), ['DC'])).toBe(4)
  })
})
