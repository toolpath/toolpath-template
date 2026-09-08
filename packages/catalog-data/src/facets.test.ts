import { describe, expect, it } from 'vitest'
import { facetsFor } from './facets.js'
import type { CatalogTool } from './types.js'

const tool = (over: Partial<CatalogTool> & Pick<CatalogTool, 'guid'>): CatalogTool => ({
  familyId: 'endmills',
  brand: 'WIDIA',
  vendor: 'Kennametal',
  catalogNumber: 'TDMX0500',
  materialNumber: null,
  toolType: 'endmill',
  form: 'flat end mill',
  unitSystem: 'millimeters',
  geometry: { DC: 5, NOF: 4 },
  materialGroups: ['P'],
  productLine: null,
  threadMethod: null,
  productLink: null,
  provenance: {},
  ...over,
})

describe('facetsFor', () => {
  it('counts every value of a discrete axis', () => {
    const facets = facetsFor([
      tool({ guid: 'a' }),
      tool({ guid: 'b' }),
      tool({ guid: 'c', toolType: 'drill' }),
    ])

    const toolTypes = facets.terms.find((axis) => axis.key === 'toolType')
    expect(toolTypes?.values).toEqual([
      { value: 'drill', count: 1 },
      { value: 'endmill', count: 2 },
    ])
  })

  it('orders flute counts as numbers, not as strings', () => {
    const facets = facetsFor([
      tool({ guid: 'a', geometry: { NOF: 10 } }),
      tool({ guid: 'b', geometry: { NOF: 2 } }),
    ])

    const flutes = facets.terms.find((axis) => axis.key === 'NOF')
    expect(flutes?.values.map((each) => each.value)).toEqual(['2', '10'])
  })

  it('publishes the bounds the catalog actually spans', () => {
    const facets = facetsFor([
      tool({ guid: 'a', geometry: { DC: 3 } }),
      tool({ guid: 'b', geometry: { DC: 12.7 } }),
    ])

    expect(facets.ranges.find((axis) => axis.key === 'DC')).toEqual({
      key: 'DC',
      label: 'Cutting diameter',
      min: 3,
      max: 12.7,
    })
  })

  /**
   * A slider from zero to zero filters nothing and reads as broken, so an axis
   * no tool states is left out rather than published empty.
   */
  it('leaves out an axis no tool states', () => {
    const facets = facetsFor([tool({ guid: 'a', geometry: { DC: 5 } })])

    expect(facets.ranges.map((axis) => axis.key)).toEqual(['DC'])
    expect(facets.terms.find((axis) => axis.key === 'NOF')).toBeUndefined()
  })

  it('has nothing to offer for an empty catalog', () => {
    expect(facetsFor([])).toEqual({ terms: [], ranges: [] })
  })
})

describe('the product-line axis', () => {
  /**
   * A line spans families, so it is the axis a shop asks "the rest of that
   * line" on. The vendors that name none are the reason it counts `null` as no
   * value rather than as a bucket: Harvey publishes no line separate from its
   * part description, and a `—` chip holding every Harvey tool would be an
   * option nobody can act on.
   */
  it('counts the tools whose vendor names a line, and leaves the rest out', () => {
    const facets = facetsFor([
      tool({ guid: 'a', productLine: 'GOdrill™' }),
      tool({ guid: 'b', productLine: 'GOdrill™' }),
      tool({ guid: 'c', productLine: 'KenCut™ FF' }),
      tool({ guid: 'd', productLine: null }),
    ])

    const axis = facets.terms.find((each) => each.key === 'productLine')
    expect(axis?.label).toBe('Product line')
    expect(axis?.values).toEqual([
      { value: 'GOdrill™', count: 2 },
      { value: 'KenCut™ FF', count: 1 },
    ])
  })

  /** A catalog whose vendors name no line gets no control, not an empty one. */
  it('is not offered at all where nothing states one', () => {
    const facets = facetsFor([tool({ guid: 'a' }), tool({ guid: 'b' })])
    expect(facets.terms.find((each) => each.key === 'productLine')).toBeUndefined()
  })
})

describe('the thread method axis', () => {
  it('counts the taps the vendor labelled, and leaves the unlabelled out', () => {
    const facets = facetsFor([
      tool({ guid: 'a', toolType: 'tap', threadMethod: 'cutting' }),
      tool({ guid: 'b', toolType: 'tap', threadMethod: 'cutting' }),
      tool({ guid: 'c', toolType: 'tap', threadMethod: 'forming' }),
      tool({ guid: 'd', toolType: 'tap', threadMethod: null }),
      tool({ guid: 'e', toolType: 'endmill', threadMethod: null }),
    ])

    const axis = facets.terms.find((each) => each.key === 'threadMethod')
    expect(axis?.label).toBe('Thread method')
    expect(axis?.values).toEqual([
      { value: 'cutting', count: 2 },
      { value: 'forming', count: 1 },
    ])
  })

  /**
   * A catalog scraped before the label exists offers no such filter, rather
   * than one whose every value is empty. Which is also the state Paul's
   * 38,114-tool scrape is in until its tap families are scraped again.
   */
  it('is not offered at all where no tap is labelled', () => {
    const facets = facetsFor([
      tool({ guid: 'a', toolType: 'tap' }),
      tool({ guid: 'b', toolType: 'tap' }),
    ])
    expect(facets.terms.find((each) => each.key === 'threadMethod')).toBeUndefined()
  })
})
