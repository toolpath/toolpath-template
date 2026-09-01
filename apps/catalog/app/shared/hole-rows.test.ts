import { describe, expect, it } from 'vitest'
import type { PartFeature } from '@toolpath/part-contracts'
import type { CatalogTool } from '@toolpath/catalog-data'
import type { HolePlanRow } from './hole-plan'
import { threadNamed } from './threads'
import {
  autoThreads,
  filterHoleRows,
  groupOfFeature,
  holeFacet,
  nextHoleSort,
  sortHoleRows,
  stepZoom,
  type HoleSort,
} from './hole-rows'

const tool = (catalogNumber: string): CatalogTool =>
  ({
    guid: catalogNumber,
    catalogNumber,
    form: 'drill',
    geometry: { DC: 5, LCF: 30, OAL: 62 },
  }) as unknown as CatalogTool

const feature = (tag: string): PartFeature => ({ featureTag: tag }) as unknown as PartFeature

const row = ({
  key,
  diameter,
  depth,
  holes = 1,
  thread = null,
  drills = ['B041'],
  makers = [],
  interpolated = false,
}: {
  key: string
  diameter: number
  depth: number
  holes?: number
  thread?: string | null
  drills?: ReadonlyArray<string>
  makers?: ReadonlyArray<string>
  interpolated?: boolean
}): HolePlanRow => ({
  group: {
    key,
    diameter,
    depth,
    features: Array.from({ length: holes }, (_, at) => feature(`${key}-${String(at)}`)),
    through: false,
    reach: depth,
    other: null,
  },
  mode: thread === null ? 'plain' : 'cut tap',
  thread: thread === null ? null : threadNamed(thread),
  drills: drills.map((each) => ({
    tool: tool(each),
    removed: [],
    warned: [],
    demoted: [],
    key: [0],
    readings: [],
  })),
  endMills: [],
  interpolated,
  makers: makers.map(tool),
})

const ROWS = [
  row({ key: 'a', diameter: 5, depth: 20, holes: 8, thread: 'M6×1', makers: ['KTAP'] }),
  row({ key: 'b', diameter: 10, depth: 8, holes: 1 }),
  row({ key: 'c', diameter: 3.1, depth: 40, holes: 2, drills: [], interpolated: false }),
  row({ key: 'd', diameter: 12, depth: 12, holes: 4, drills: ['MILL'], interpolated: true }),
]

const keys = (rows: ReadonlyArray<HolePlanRow>) => rows.map((each) => each.group.key)

describe('sorting the holes', () => {
  it('sorts by the numbers a row is scanned by', () => {
    expect(keys(sortHoleRows(ROWS, { code: 'diameter', ascending: true }))).toEqual([
      'c',
      'a',
      'b',
      'd',
    ])
    expect(keys(sortHoleRows(ROWS, { code: 'depth', ascending: false }))).toEqual([
      'c',
      'a',
      'd',
      'b',
    ])
    expect(keys(sortHoleRows(ROWS, { code: 'count', ascending: false }))).toEqual([
      'a',
      'd',
      'c',
      'b',
    ])
  })

  /**
   * "No tap" is not a small tap: a row with nothing in the column sorts last
   * whichever way the column runs, or an ascending sort buries what it was for.
   */
  it('puts the rows with nothing in the column last, both ways', () => {
    expect(keys(sortHoleRows(ROWS, { code: 'tap', ascending: true }))[0]).toBe('a')
    expect(keys(sortHoleRows(ROWS, { code: 'tap', ascending: false }))[0]).toBe('a')
  })

  it('leaves the order alone when no column asked', () => {
    expect(keys(sortHoleRows(ROWS, null))).toEqual(['a', 'b', 'c', 'd'])
  })

  /** Up, down, then back to the order the plan built. */
  it('cycles a column through ascending, descending and off', () => {
    const first: HoleSort | null = nextHoleSort(null, 'depth')
    expect(first).toEqual({ code: 'depth', ascending: true })
    const second = nextHoleSort(first, 'depth')
    expect(second).toEqual({ code: 'depth', ascending: false })
    expect(nextHoleSort(second, 'depth')).toBeNull()
    expect(nextHoleSort(second, 'count')).toEqual({ code: 'count', ascending: true })
  })
})

describe('narrowing the holes', () => {
  it('keeps the rows inside a band', () => {
    expect(keys(filterHoleRows(ROWS, { diameter: { min: 5, max: 10 } }))).toEqual(['a', 'b'])
    expect(keys(filterHoleRows(ROWS, { depth: { min: 20 } }))).toEqual(['a', 'c'])
    expect(keys(filterHoleRows(ROWS, { count: { max: 2 } }))).toEqual(['b', 'c'])
  })

  /** The three states the drill column can be in, which is what it filters on. */
  it('narrows by what the drill column says', () => {
    expect(keys(filterHoleRows(ROWS, { drill: ['none'] }))).toEqual(['c'])
    expect(keys(filterHoleRows(ROWS, { drill: ['interpolated'] }))).toEqual(['d'])
    expect(keys(filterHoleRows(ROWS, { drill: ['drill'] }))).toEqual(['a', 'b'])
  })

  it('narrows by thread and by tap', () => {
    expect(keys(filterHoleRows(ROWS, { thread: ['M6×1'] }))).toEqual(['a'])
    expect(keys(filterHoleRows(ROWS, { thread: ['plain'] }))).toEqual(['b', 'c', 'd'])
    expect(keys(filterHoleRows(ROWS, { tap: ['tap'] }))).toEqual(['a'])
  })

  it('narrows on every column at once, and keeps everything with no filter', () => {
    expect(keys(filterHoleRows(ROWS, { diameter: { max: 6 }, drill: ['drill'] }))).toEqual(['a'])
    expect(keys(filterHoleRows(ROWS, {}))).toEqual(['a', 'b', 'c', 'd'])
    expect(keys(filterHoleRows(ROWS, { thread: [] }))).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('what a column offers to filter on', () => {
  it('counts the rows behind each value', () => {
    expect(holeFacet(ROWS, 'drill')).toEqual([
      { value: 'drill', label: 'A drill', count: 2 },
      { value: 'interpolated', label: 'A mill, interpolated', count: 1 },
      { value: 'none', label: 'Nothing fits', count: 1 },
    ])
  })

  it('offers the threads the rows actually carry', () => {
    expect(holeFacet(ROWS, 'thread').map((each) => each.label)).toEqual(['M6×1', 'No thread'])
  })
})

describe('walking the zoom through a group', () => {
  /** Press, see the first; press again, see the second; past the last, round again. */
  it('steps through the holes of a size and comes round', () => {
    expect(stepZoom(3, undefined)).toEqual({ index: 0, next: 2 })
    expect(stepZoom(3, 2)).toEqual({ index: 1, next: 3 })
    expect(stepZoom(3, 3)).toEqual({ index: 2, next: 1 })
    expect(stepZoom(3, 1)).toEqual({ index: 0, next: 2 })
  })

  it('stays on the only hole there is', () => {
    expect(stepZoom(1, undefined)).toEqual({ index: 0, next: 1 })
    expect(stepZoom(1, 1)).toEqual({ index: 0, next: 1 })
  })

  it('asks for nothing when there is nothing to frame', () => {
    expect(stepZoom(0, undefined)).toEqual({ index: 0, next: 1 })
  })
})

describe('threading every size at once', () => {
  /**
   * ⌀5 is M6×1's tap drill and ⌀8 is 3/8-16 UNC's, so a shop whose CAD draws
   * tapped holes at the tap drill can thread the whole part in one press.
   */
  it('threads every size that reads as one at the stated diameter', () => {
    const rows = [
      row({ key: 'a', diameter: 5, depth: 20, holes: 8 }),
      // ⌀7.3 is nobody's tap drill, minor or nominal — it is left alone.
      row({ key: 'b', diameter: 7.3, depth: 8 }),
    ]

    const applied = autoThreads(rows, 'tap drill', 'cut tap')

    expect(applied.map((each) => each.key)).toEqual(['a'])
    expect(applied[0]?.choice.mode).toBe('cut tap')
    expect(applied[0]?.choice.spec?.name).toBe('M6×1')
  })

  /** The reading is the shop's answer, so a hole drawn at nominal reads as one. */
  it('reads the diameter the shop says its model uses', () => {
    const rows = [row({ key: 'a', diameter: 6, depth: 20 })]

    expect(autoThreads(rows, 'nominal', 'form tap')[0]?.choice.spec?.name).toBe('M6×1')
    // ⌀6 is nobody's tap drill, so nothing is claimed at that reading.
    expect(autoThreads(rows, 'tap drill', 'form tap')).toEqual([])
  })

  /** It is a button somebody pressed: it says what it does to every matching size. */
  it('applies to a size that already has a thread', () => {
    const rows = [row({ key: 'a', diameter: 5, depth: 20, thread: 'M5×0.8' })]

    expect(autoThreads(rows, 'tap drill', 'form tap')[0]?.choice).toEqual({
      mode: 'form tap',
      spec: expect.objectContaining({ name: 'M6×1' }),
    })
  })
})

describe('which size a hole on the part belongs to', () => {
  const groups = [
    { key: 'a', features: [{ featureTag: 'h1' }, { featureTag: 'h2' }], other: null },
    { key: 'b', features: [{ featureTag: 'h3' }], other: { features: [{ featureTag: 'h3-far' }] } },
  ]

  it('finds the size a clicked hole is one of', () => {
    expect(groupOfFeature(groups, 'h2')).toBe('a')
    expect(groupOfFeature(groups, 'h3')).toBe('b')
  })

  /** Clicking the far end of a two-sided hole is still asking about that size. */
  it('finds it from the side the group is not being made from', () => {
    expect(groupOfFeature(groups, 'h3-far')).toBe('b')
  })

  it('finds nothing for a feature that is not a hole', () => {
    expect(groupOfFeature(groups, 'pocket-1')).toBeNull()
    expect(groupOfFeature(groups, null)).toBeNull()
  })
})
