import { describe, expect, it } from 'vitest'
import type { CatalogTool } from '@toolpath/catalog-data'
import {
  EMPTY_QUERY,
  countBy,
  cycleTerm,
  filterTools,
  isEmptyQuery,
  prioritise,
  queryFromSearch,
  searchFromQuery,
  searchWithQuery,
  toggleTerm,
  type ToolQuery,
} from './filter'

const tool = (over: Partial<CatalogTool> & Pick<CatalogTool, 'guid'>): CatalogTool => ({
  familyId: 'vhm-endmills',
  brand: 'WIDIA',
  vendor: 'Kennametal',
  catalogNumber: 'TDMX0500',
  materialNumber: '6694846',
  toolType: 'endmill',
  form: 'flat end mill',
  unitSystem: 'metric',
  geometry: { DC: 5, NOF: 4, RE: 0.5 },
  materialGroups: ['P'],
  productLink: null,
  provenance: {},
  ...over,
})

const query = (over: Partial<ToolQuery>): ToolQuery => ({ ...EMPTY_QUERY, ...over })

describe('filterTools', () => {
  it('returns everything for an empty query', () => {
    const tools = [tool({ guid: 'a' }), tool({ guid: 'b' })]
    expect(filterTools(tools, EMPTY_QUERY)).toHaveLength(2)
  })

  it('searches the identifiers a shop types, case-insensitively', () => {
    const tools = [
      tool({ guid: 'a', catalogNumber: 'TDMX0500' }),
      tool({ guid: 'b', catalogNumber: 'VDS400A' }),
    ]

    expect(filterTools(tools, query({ text: 'tdmx' })).map((each) => each.guid)).toEqual(['a'])
  })

  it('finds a tool by the vendor’s material number', () => {
    const tools = [
      tool({ guid: 'a', materialNumber: '6694846' }),
      tool({ guid: 'b', materialNumber: null }),
    ]

    expect(filterTools(tools, query({ text: '6694846' })).map((each) => each.guid)).toEqual(['a'])
  })

  /** Never geometry: '5' must not match every tool with a 5 mm anything. */
  it('does not match free text against geometry', () => {
    const tools = [tool({ guid: 'a', catalogNumber: 'AAA', geometry: { DC: 5 } })]

    expect(filterTools(tools, query({ text: '5' }))).toEqual([])
  })

  it('treats several values of one axis as alternatives', () => {
    const tools = [
      tool({ guid: 'a', toolType: 'endmill' }),
      tool({ guid: 'b', toolType: 'drill' }),
      tool({ guid: 'c', toolType: 'tap' }),
    ]

    const selected = query({ terms: { toolType: ['endmill', 'drill'] } })
    expect(filterTools(tools, selected).map((each) => each.guid)).toEqual(['a', 'b'])
  })

  it('treats different axes as requirements, not alternatives', () => {
    const tools = [
      tool({ guid: 'a', toolType: 'endmill', brand: 'WIDIA' }),
      tool({ guid: 'b', toolType: 'endmill', brand: 'Kennametal' }),
    ]

    const selected = query({ terms: { toolType: ['endmill'], brand: ['WIDIA'] } })
    expect(filterTools(tools, selected).map((each) => each.guid)).toEqual(['a'])
  })

  it('filters on a geometry range in millimetres', () => {
    const tools = [
      tool({ guid: 'a', geometry: { DC: 3 } }),
      tool({ guid: 'b', geometry: { DC: 6 } }),
      tool({ guid: 'c', geometry: { DC: 12 } }),
    ]

    const selected = query({ ranges: { DC: { min: 4, max: 10 } } })
    expect(filterTools(tools, selected).map((each) => each.guid)).toEqual(['b'])
  })

  /**
   * Asking for a corner radius under 1 mm and being shown tools whose radius
   * nobody knows is an answer a machinist cannot act on.
   */
  it('excludes a tool that does not state the filtered dimension', () => {
    const tools = [tool({ guid: 'a', geometry: { DC: 5 } })]

    expect(filterTools(tools, query({ ranges: { RE: { max: 1 } } }))).toEqual([])
  })
})

describe('the URL round trip', () => {
  it('round-trips a full selection without loss', () => {
    const selected = query({
      text: 'tdmx',
      terms: { toolType: ['endmill'], NOF: ['3', '4'] },
      ranges: { DC: { min: 4, max: 10 } },
    })

    expect(queryFromSearch(searchFromQuery(selected))).toEqual(selected)
  })

  it('writes nothing for an unconstrained selection', () => {
    expect(searchFromQuery(EMPTY_QUERY).toString()).toBe('')
  })

  it('drops a range bound that is not a number rather than guessing at one', () => {
    const parsed = queryFromSearch(new URLSearchParams('min.DC=wide&max.DC=10'))

    expect(parsed.ranges.DC).toEqual({ max: 10 })
  })

  it('trims the free text it stores', () => {
    expect(searchFromQuery(query({ text: '  tdmx  ' })).get('q')).toBe('tdmx')
  })
})

describe('toggleTerm', () => {
  it('adds a value, then removes it, leaving the axis absent rather than empty', () => {
    const added = toggleTerm(EMPTY_QUERY, 'toolType', 'drill')
    expect(added.terms.toolType).toEqual(['drill'])

    const removed = toggleTerm(added, 'toolType', 'drill')
    expect(removed.terms.toolType).toBeUndefined()
    expect(isEmptyQuery(removed)).toBe(true)
  })

  it('leaves the rest of the selection alone', () => {
    const selected = query({
      text: 'tdmx',
      ranges: { DC: { min: 4 } },
      terms: { brand: ['WIDIA'] },
    })
    const next = toggleTerm(selected, 'toolType', 'drill')

    expect(next.text).toBe('tdmx')
    expect(next.ranges).toEqual({ DC: { min: 4 } })
    expect(next.terms.brand).toEqual(['WIDIA'])
  })
})

describe('countBy', () => {
  it('counts the result set it is given, not the catalog', () => {
    const counts = countBy(
      [tool({ guid: 'a' }), tool({ guid: 'b', toolType: 'drill' })],
      'toolType',
    )

    expect(counts.get('endmill')).toBe(1)
    expect(counts.get('drill')).toBe(1)
  })

  it('skips a tool that does not state the axis', () => {
    const counts = countBy([tool({ guid: 'a', geometry: { DC: 5 } })], 'NOF')

    expect(counts.size).toBe(0)
  })
})

describe('a URL that carries more than filters', () => {
  /**
   * The part page's URL holds `?job=<id>`. Read as a filter it asks for tools
   * whose `job` equals a job id — which no tool states, so every tool is
   * excluded and the list goes silently empty.
   */
  it('ignores a parameter that is not one of this page’s axes', () => {
    const parsed = queryFromSearch(new URLSearchParams('job=abc123&toolType=drill'), [
      'toolType',
      'DC',
    ])

    expect(parsed.terms).toEqual({ toolType: ['drill'] })
  })

  it('ignores a range bound on an axis this page does not have', () => {
    const parsed = queryFromSearch(new URLSearchParams('min.NOPE=4&min.DC=6'), ['DC'])

    expect(parsed.ranges).toEqual({ DC: { min: 6 } })
  })

  it('still takes every parameter when no axes are named', () => {
    const parsed = queryFromSearch(new URLSearchParams('toolType=drill'))

    expect(parsed.terms).toEqual({ toolType: ['drill'] })
  })

  it('leaves a filtered selection matching after the round trip', () => {
    const selected = queryFromSearch(new URLSearchParams('job=abc&toolType=drill'), ['toolType'])

    expect(queryFromSearch(searchFromQuery(selected), ['toolType'])).toEqual(selected)
  })
})

describe('writing filters into a URL that carries other things', () => {
  /**
   * The part page's own `?job=` lives in the same URL. Replacing the whole
   * query string with the filters threw it away, and the next render had a part
   * id and no job.
   */
  it('keeps what is not a filter', () => {
    const current = new URLSearchParams('job=abc123&toolType=drill')
    const next = searchWithQuery(current, { ...EMPTY_QUERY, terms: { toolType: ['endmill'] } }, [
      'toolType',
      'DC',
    ])

    expect(next.get('job')).toBe('abc123')
    expect(next.getAll('toolType')).toEqual(['endmill'])
  })

  it('drops a filter that has been cleared, and keeps the rest of the URL', () => {
    const current = new URLSearchParams('job=abc123&toolType=drill&max.DC=6')
    const next = searchWithQuery(current, EMPTY_QUERY, ['toolType', 'DC'])

    expect(next.get('job')).toBe('abc123')
    expect(next.get('toolType')).toBeNull()
    expect(next.get('max.DC')).toBeNull()
  })

  it('replaces the free text rather than doubling it', () => {
    const current = new URLSearchParams('q=old&job=abc')
    const next = searchWithQuery(current, { ...EMPTY_QUERY, text: 'new' }, ['toolType'])

    expect(next.getAll('q')).toEqual(['new'])
  })

  it('round-trips through the reader it was written for', () => {
    const query = { ...EMPTY_QUERY, terms: { toolType: ['drill'] }, ranges: { DC: { max: 6 } } }
    const next = searchWithQuery(new URLSearchParams('job=abc'), query, ['toolType', 'DC'])

    expect(queryFromSearch(next, ['toolType', 'DC'])).toEqual(query)
  })
})

describe('a press on a tile walks its priority', () => {
  it('reads 1, 2, off for a second tile pressed again and again', () => {
    const one = cycleTerm(EMPTY_QUERY, 'form', 'drill')
    expect(one.terms.form).toEqual(['drill'])

    const two = cycleTerm(one, 'form', 'reamer')
    expect(two.terms.form).toEqual(['drill', 'reamer'])

    // Press the first again: it moves one place later, and then it is last, and then it is off.
    const swapped = cycleTerm(two, 'form', 'drill')
    expect(swapped.terms.form).toEqual(['reamer', 'drill'])
    const off = cycleTerm(swapped, 'form', 'drill')
    expect(off.terms.form).toEqual(['reamer'])
  })

  it('drops the key when the last one is taken off', () => {
    expect(
      cycleTerm(cycleTerm(EMPTY_QUERY, 'form', 'drill'), 'form', 'drill').terms.form,
    ).toBeUndefined()
  })
})

describe('the list in the order the priorities ask for', () => {
  const make = (guid: string, form: string, brand: string): CatalogTool =>
    ({ ...tool, guid, form, brand }) as CatalogTool
  const listed = [
    make('a', 'drill', 'WIDIA'),
    make('b', 'flat end mill', 'Kennametal'),
    make('c', 'drill', 'Kennametal'),
  ]

  it('sorts by tool type first, then brand, keeping the rest of the order', () => {
    const query = {
      ...EMPTY_QUERY,
      terms: { form: ['flat end mill', 'drill'], brand: ['Kennametal'] },
    }

    expect(prioritise(listed, query).map((each) => each.guid)).toEqual(['b', 'c', 'a'])
  })

  it('leaves the order alone with nothing to sort by', () => {
    expect(prioritise(listed, EMPTY_QUERY).map((each) => each.guid)).toEqual(['a', 'b', 'c'])
    expect(
      prioritise(listed, { ...EMPTY_QUERY, terms: { form: ['drill'] } }).map((each) => each.guid),
    ).toEqual(['a', 'b', 'c'])
  })
})
