import { describe, expect, it } from 'vitest'
import type { CatalogTool } from '@toolpath/catalog-data'
import { recommendationRows } from './recommendations'
import type { ListItem } from './feature-list'

const tool = (guid: string): CatalogTool =>
  ({ guid, catalogNumber: guid }) as unknown as CatalogTool

/** The rules' own pick, with nothing chosen to hold it in yet. */
const recommends = (guid: string) => ({
  picks: [{ tool: tool(guid), holder: null, collet: null }],
  chosen: false,
})

const nameOf = (tag: string): string => (tag.startsWith('hole') ? 'Through Hole' : 'Pocket')

const LIST: Array<ListItem> = [
  { kind: 'feature', id: 'feature-1', tags: ['pocket-1'] },
  { kind: 'group', id: 'group-1', tags: ['hole-1', 'hole-2'], results: 'all' },
  { kind: 'group', id: 'group-2', tags: ['hole-3', 'pocket-2'], results: 'each' },
]

describe('the list answered a row at a time', () => {
  /** One row per item: the list is the questions, the table is the answers. */
  it('recommends one tool per row, named by what the row is', () => {
    const rows = recommendationRows(LIST, { topFor: (tags) => recommends(tags.join('+')), nameOf })

    expect(rows.map((row) => [row.label, row.picks[0]?.tool.guid])).toEqual([
      ['Pocket', 'pocket-1'],
      ['2 × Through Hole', 'hole-1+hole-2'],
      // A group asked for one each has no single tool to name, so it counts them.
      ['Through Hole + Pocket', undefined],
    ])
    expect(rows[2]?.note).toBe('2 tools, one per feature')
  })

  /**
   * A group asked for one tool **each** opens rather than spending three rows
   * of the table on one item of the list (Paul, 2026-09-02: "group result is
   * returned in a single row and expanded to see results for each feature").
   */
  it('opens a one-each group into a row per feature, and nothing else opens', () => {
    const rows = recommendationRows(LIST, { topFor: (tags) => recommends(tags.join('+')), nameOf })

    expect(rows[0]?.children).toEqual([])
    expect(rows[1]?.children).toEqual([])
    expect(
      rows[2]?.children.map((child) => [child.label, child.picks[0]?.tool.guid, child.tag]),
    ).toEqual([
      ['Through Hole', 'hole-3', 'hole-3'],
      ['Pocket', 'pocket-2', 'pocket-2'],
    ])
  })

  /**
   * Identical holes are one decision, so they are one child row — the rule
   * `groupOf` holds everywhere else. Without it a bolt circle opens into eight
   * rows saying the same thing.
   */
  it('opens identical holes as one row, not one each', () => {
    const rows = recommendationRows(
      [{ kind: 'group', id: 'group-1', tags: ['hole-1', 'hole-2', 'pocket-1'], results: 'each' }],
      {
        topFor: (tags) => recommends(tags.join('+')),
        nameOf,
        split: (tags) => [tags.filter((tag) => tag.startsWith('hole')), ['pocket-1']],
      },
    )

    expect(rows[0]?.children.map((child) => child.label)).toEqual(['2 × Through Hole', 'Pocket'])
  })

  /**
   * Where every feature lands on the same tool the group has one answer after
   * all, and saying "3 tools" about one drill is a worse answer than the drill.
   */
  it('names the one tool where every feature in a one-each group wants it', () => {
    const rows = recommendationRows(
      [{ kind: 'group', id: 'group-1', tags: ['hole-1', 'hole-2'], results: 'each' }],
      { topFor: () => recommends('B976Z02500'), nameOf },
    )

    expect(rows[0]?.picks[0]?.tool.guid).toBe('B976Z02500')
    expect(rows[0]?.note).toBeNull()
  })

  /**
   * **An empty answer says which question failed.** A group that wants one
   * tool for six features usually fails because no single tool cuts all six,
   * which is a different sentence from a feature nothing in the catalog fits.
   */
  it('says why a row has no tool, in the words of the question it asked', () => {
    const rows = recommendationRows(LIST, { topFor: () => null, nameOf })

    expect(rows.map((row) => row.note)).toEqual([
      'nothing fits',
      'no one tool cuts all of these',
      'nothing fits',
    ])
    expect(rows[2]?.children.map((child) => child.note)).toEqual(['nothing fits', 'nothing fits'])
  })
})

/**
 * **More than one, where somebody chose more than one** (Paul, 2026-09-02: "a
 * feature or group can have multiple tools saved to it, not just one"). A hole
 * is a spot drill and a drill.
 */
describe('a row answered with several tools', () => {
  it('carries every one of them, in the order they were chosen', () => {
    const rows = recommendationRows([{ kind: 'feature', id: 'feature-1', tags: ['hole-1'] }], {
      topFor: () => ({
        picks: [
          { tool: tool('SPOT'), holder: 'BT30-ER16', collet: 'ER16-3' },
          { tool: tool('DRILL'), holder: null, collet: null },
        ],
        chosen: true,
      }),
      nameOf,
    })

    expect(rows[0]?.picks.map((pick) => pick.tool.guid)).toEqual(['SPOT', 'DRILL'])
    expect(rows[0]?.picks[0]?.holder).toBe('BT30-ER16')
    expect(rows[0]?.chosen).toBe(true)
    expect(rows[0]?.note).toBeNull()
  })

  /** Counted across every tool of every feature, so a group says how many it holds. */
  it('counts a one-each group’s tools across all of its features', () => {
    const rows = recommendationRows(
      [{ kind: 'group', id: 'group-1', tags: ['hole-1', 'pocket-1'], results: 'each' }],
      {
        topFor: (tags) => ({
          picks: [{ tool: tool(tags.join('+')), holder: null, collet: null }],
          chosen: true,
        }),
        nameOf,
      },
    )

    expect(rows[0]?.note).toBe('2 tools, one per feature')
    expect(rows[0]?.picks).toEqual([])
  })
})
