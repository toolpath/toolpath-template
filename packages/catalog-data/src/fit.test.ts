import { describe, expect, it } from 'vitest'
import type { PartFeature } from '@toolpath/part-contracts'
import { demandOf, demandsOf, fitAgainst, fitTools, toolsForFeatures } from './fit.js'
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
  geometry: { DC: 5, LCF: 15, RE: 0, NOF: 4 },
  materialGroups: ['P'],
  productLine: null,
  productLink: null,
  provenance: {},
  ...over,
})

/** A feature as the Engine reports it, trimmed to what a fit reads. */
const feature = (over: {
  tag?: string
  cd?: number
  zMax?: number
  zMin?: number
  fillet?: number
}): PartFeature =>
  ({
    featureTag: over.tag ?? 'pocket-1',
    featureType: 'Pocket',
    regionIdxs: [],
    machiningDirection: { x: 0, y: 0, z: 1 },
    datasheet: {
      zMax: over.zMax,
      zMin: over.zMin,
      facts: {
        kind: 'Pocket',
        ...(over.cd === undefined ? {} : { cd: { ignore: { min: over.cd } } }),
        ...(over.fillet === undefined ? {} : { filletRadius: over.fillet }),
      },
    },
  }) as unknown as PartFeature

const hole = (over: {
  tag?: string
  drill?: number
  endmill?: number
  bore?: number
}): PartFeature =>
  ({
    featureTag: over.tag ?? 'hole-1',
    featureType: 'Hole',
    regionIdxs: [],
    machiningDirection: { x: 0, y: 0, z: 1 },
    datasheet: {
      facts: {
        kind: 'Hole',
        diameter: over.bore,
        maxDrillDiameter: over.drill,
        maxEndmillDiameter: over.endmill,
      },
    },
  }) as unknown as PartFeature

describe('demandOf', () => {
  it('reads the widest cutter the Engine says reaches the corners', () => {
    expect(demandOf(feature({ cd: 6.6 })).maxToolDiameter).toBe(6.6)
  })

  it('measures depth as the span between the feature’s top and bottom', () => {
    expect(demandOf(feature({ zMax: 10, zMin: 2 })).depth).toBe(8)
  })

  it('keeps a hole’s drill and endmill limits apart', () => {
    const demand = demandOf(hole({ drill: 10, endmill: 8, bore: 10 }))

    expect(demand.maxDrillDiameter).toBe(10)
    expect(demand.maxEndmillDiameter).toBe(8)
  })

  /**
   * A measurement the kernel does not state must not become a demand of zero,
   * which would exclude every tool in the catalog for no stated reason.
   */
  it('states nothing the datasheet does not', () => {
    const demand = demandOf(feature({}))

    expect(demand.maxToolDiameter).toBeUndefined()
    expect(demand.depth).toBeUndefined()
    expect(demand.floorRadius).toBeUndefined()
  })
})

describe('fitAgainst', () => {
  it('accepts a tool the feature has room for', () => {
    expect(
      fitAgainst(tool({ guid: 'a' }), demandOf(feature({ cd: 6.6, zMax: 10, zMin: 2 }))),
    ).toEqual([])
  })

  it('rules out a cutter wider than the tightest corner admits', () => {
    const wide = tool({ guid: 'a', geometry: { DC: 8, LCF: 20 } })

    expect(fitAgainst(wide, demandOf(feature({ cd: 6.6 })))).toHaveLength(1)
  })

  it('rules out a tool whose flutes do not reach the bottom', () => {
    const short = tool({ guid: 'a', geometry: { DC: 5, LCF: 6 } })
    const failures = fitAgainst(short, demandOf(feature({ zMax: 10, zMin: 0 })))

    expect(failures[0]?.reason).toContain('does not reach')
  })

  it('rules out a corner radius the floor fillet has no room for', () => {
    const rounded = tool({ guid: 'a', geometry: { DC: 5, RE: 2 } })

    expect(fitAgainst(rounded, demandOf(feature({ fillet: 0.5 })))).toHaveLength(1)
  })

  /** A sharp tool in a filleted corner is fine; it just leaves the fillet alone. */
  it('accepts a sharp tool where a fillet is stated', () => {
    expect(fitAgainst(tool({ guid: 'a' }), demandOf(feature({ fillet: 0.5 })))).toEqual([])
  })

  it('holds a drill to the bore and an endmill to what can helix in it', () => {
    // The *form* is what decides how a tool goes into a hole now, and a
    // catalog tool's form is derived from its type — so a fixture that set the
    // type and left the base fixture's `flat end mill` form was describing a
    // tool `buildCatalog` cannot produce.
    const drill = tool({ guid: 'd', toolType: 'drill', form: 'drill', geometry: { DC: 9.5 } })
    const endmill = tool({ guid: 'e', toolType: 'endmill', geometry: { DC: 9.5 } })
    const demand = demandOf(hole({ drill: 10, endmill: 8, bore: 10 }))

    expect(fitAgainst(drill, demand)).toEqual([])
    expect(fitAgainst(endmill, demand)).toHaveLength(1)
  })

  it('checks nothing it was not told, rather than guessing', () => {
    const huge = tool({ guid: 'a', geometry: { DC: 100, LCF: 1 } })

    expect(fitAgainst(huge, demandOf(feature({})))).toEqual([])
  })
})

describe('fitting several features at once', () => {
  const small = tool({ guid: 'small', catalogNumber: 'SMALL', geometry: { DC: 3, LCF: 20 } })
  const medium = tool({ guid: 'medium', catalogNumber: 'MED', geometry: { DC: 6, LCF: 20 } })
  const long = tool({ guid: 'long', catalogNumber: 'LONG', geometry: { DC: 3, LCF: 4 } })

  const tight = feature({ tag: 'tight', cd: 4 })
  const deep = feature({ tag: 'deep', zMax: 12, zMin: 0 })

  /** One setup wants one tool for as much of the part as it can get. */
  it('returns only the tools that clear every selected feature', () => {
    const both = toolsForFeatures([small, medium, long], [tight, deep])

    expect(both.map((each) => each.catalogNumber)).toEqual(['SMALL'])
  })

  it('says which feature ruled a tool out, rather than dropping it silently', () => {
    const fits = fitTools([medium], demandsOf([tight, deep]))

    expect(fits[0]?.fits).toBe(false)
    expect(fits[0]?.failures.map((each) => each.featureTag)).toEqual(['tight'])
  })

  it('narrows as more features are selected, never widens', () => {
    const one = toolsForFeatures([small, medium, long], [tight])
    const two = toolsForFeatures([small, medium, long], [tight, deep])

    expect(two.length).toBeLessThanOrEqual(one.length)
    expect(one.map((each) => each.guid)).toEqual(
      expect.arrayContaining(two.map((each) => each.guid)),
    )
  })

  it('asks nothing of a tool when nothing is selected', () => {
    expect(toolsForFeatures([small, medium, long], [])).toHaveLength(3)
  })
})
