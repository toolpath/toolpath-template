import { describe, expect, it } from 'vitest'
import type { CatalogTool, Holder } from '@toolpath/catalog-data'
import { fusionLibrary } from './fusion-library'

const tool = (over: Partial<CatalogTool> = {}): CatalogTool =>
  ({
    guid: 'tool-1',
    catalogNumber: 'TDMX0800',
    brand: 'WIDIA',
    vendor: 'Kennametal',
    form: 'bull nose end mill',
    toolType: 'endmill',
    geometry: { DC: 8, LCF: 19, OAL: 63, SFDM: 8, NOF: 4, RE: 1, LBH: 27 },
    productLink: 'https://example.com/TDMX0800',
    provenance: {},
    ...over,
  }) as unknown as CatalogTool

const holder = {
  guid: 'holder-1',
  brand: 'Kennametal',
  catalogNumber: 'BT30ER16060M',
  noseDiameter: 28,
  noseLength: 20,
  bodyDiameter: 34,
  bodyLength: 15,
  flangeDiameter: 46,
  projection: 60,
} as unknown as Holder

describe('the order list as a Fusion library', () => {
  /** The form vocabulary is Fusion's already, and so are the geometry keys. */
  it('writes a tool in the words Fusion reads', () => {
    const { library } = fusionLibrary([{ tool: tool() }])
    const first = library.data[0]!

    expect(library.version).toBe(4)
    expect(first.type).toBe('bull nose end mill')
    expect(first.unit).toBe('millimeters')
    expect(first['product-id']).toBe('TDMX0800')
    expect(first['product-link']).toBe('https://example.com/TDMX0800')
    expect(first.geometry).toEqual({ DC: 8, LCF: 19, OAL: 63, SFDM: 8, NOF: 4, RE: 1, LB: 27 })
  })

  /** Numbered in the order of the bill, so the library lands ready to post. */
  it('numbers the tools from one', () => {
    const { library } = fusionLibrary([
      { tool: tool() },
      { tool: tool({ guid: 'tool-2', catalogNumber: 'V22210' }) },
    ])

    expect(library.data.map((each) => each['post-process'].number)).toEqual([1, 2])
  })

  /** The nose, the body, and what is left up to the flange — what the vendor stated. */
  it('writes the holder as the cylinders the vendor published', () => {
    const { library } = fusionLibrary([{ tool: tool(), holder }])

    expect(library.data[0]?.holder?.segments).toEqual([
      { height: 20, 'lower-diameter': 28, 'upper-diameter': 28 },
      { height: 15, 'lower-diameter': 34, 'upper-diameter': 34 },
      { height: 25, 'lower-diameter': 46, 'upper-diameter': 46 },
    ])
  })

  /** A holder that publishes no shape gets no shape, rather than a guessed one. */
  it('leaves the holder out when nothing was published about it', () => {
    const bare = { ...holder, noseLength: null, bodyLength: null, projection: null } as Holder
    const { library } = fusionLibrary([{ tool: tool(), holder: bare }])

    expect(library.data[0]?.holder).toBeUndefined()
  })

  /**
   * Fusion refuses a type it does not know, and a library that fails to import
   * is worse than one that is short — so a tool the dataset could not name is
   * left out and counted.
   */
  it('leaves out a tool it cannot name for Fusion', () => {
    const { library, skipped } = fusionLibrary([
      { tool: tool({ form: 'other' }) },
      { tool: tool() },
    ])

    expect(library.data).toHaveLength(1)
    expect(skipped).toBe(1)
  })
})
