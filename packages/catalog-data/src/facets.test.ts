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
  unitSystem: 'metric',
  geometry: { DC: 5, NOF: 4 },
  materialGroups: ['P'],
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
