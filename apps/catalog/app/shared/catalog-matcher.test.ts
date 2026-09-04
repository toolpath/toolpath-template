import { describe, expect, it } from 'vitest'
import type { CatalogTool, Collet, Holder } from '@toolpath/catalog-data'
import type { PartFeature } from '@toolpath/part-contracts'
import { SHEET_CLAMPING, withClampingLength } from './clamping-length'
import {
  detailedMatch,
  matchKey,
  prepareMatch,
  recommendationMatch,
  rehydrateVerdicts,
  type MatchContext,
} from './catalog-matcher'
import { EMPTY_QUERY } from './filter'
import { policyOf, thresholdsFrom } from './holder-choice'
import { fittingTools } from './tool-fit'

const tool = (guid: string, DC: number): CatalogTool =>
  ({
    guid,
    catalogNumber: guid,
    brand: 'Test',
    vendor: 'Test',
    form: 'flat end mill',
    toolType: 'endmill',
    unitSystem: 'millimeters',
    geometry: { DC, SFDM: DC, LCF: 20, OAL: 60, LD: 4, RE: 0, NOF: 4 },
    provenance: {},
    materialGroups: [],
  }) as unknown as CatalogTool

const pocket = (tag: string): PartFeature =>
  ({
    featureTag: tag,
    featureType: 'Pocket',
    machiningDirection: { x: 0, y: 0, z: 1 },
    regionIdxs: [1],
    datasheet: {
      zMin: -8,
      zMax: 0,
      extendedZMax: 0,
      facts: { kind: 'Pocket', cd: { ignore: { min: 8, max: 10 } }, hasFloor: true, hasWall: true },
    },
  }) as unknown as PartFeature

const context = (features: ReadonlyArray<PartFeature>): MatchContext => ({
  features,
  query: EMPTY_QUERY,
  knobs: [],
  clamping: SHEET_CLAMPING,
  unit: 'millimeters',
  holderFilters: { taper: [], colletSeries: [] },
  margins: { radial: 0, axial: 0 },
  thresholds: thresholdsFrom(),
})

const catalog = { tools: [tool('SMALL', 6), tool('LARGE', 10)], holders: [], collets: [] }

const holder: Holder = {
  guid: 'holder-1',
  familyId: 'bt30',
  brand: 'Test',
  vendor: 'Test',
  catalogNumber: 'BT30-PG6',
  materialNumber: null,
  taper: 'BT30',
  contact: 'taper',
  clamping: 'collet',
  gaugeLength: 60,
  colletSeries: 'PG6',
  boreDiameter: null,
  noseDiameter: 8,
  noseLength: 20,
  bodyDiameter: null,
  bodyLength: null,
  projection: null,
  flangeDiameter: null,
  colletProtrusion: null,
  productLink: null,
  cadModelUrl: null,
  provenance: {},
}

const collet: Collet = {
  guid: 'collet-1',
  familyId: 'pg6',
  brand: 'Test',
  vendor: 'Test',
  catalogNumber: 'PG6-6',
  materialNumber: null,
  series: 'PG6',
  clampMin: 6,
  clampMax: 6,
  clampLength: null,
  productLink: null,
  provenance: {},
}

describe('catalog matcher protocol', () => {
  it('makes a stable key independent of object property order', () => {
    const first = context([pocket('pocket-1')])
    const second = { ...first, query: { ranges: {}, terms: {}, text: '' } }

    expect(matchKey('table', first, [{ demandKey: 'one', tags: ['pocket-1'] }])).toBe(
      matchKey('table', second, [{ demandKey: 'one', tags: ['pocket-1'] }]),
    )
  })

  it('reuses a recommendation key when only display units change', () => {
    const input = context([pocket('pocket-1')])
    const demand = [{ demandKey: 'one', tags: ['pocket-1'] }]

    expect(matchKey('recommendations', input, demand)).toBe(
      matchKey('recommendations', { ...input, unit: 'inches' }, demand),
    )
    expect(matchKey('table', input, demand)).not.toBe(
      matchKey('table', { ...input, unit: 'inches' }, demand),
    )
  })

  it('preserves detailed fitting order after compact transfer and rehydration', () => {
    const feature = pocket('pocket-1')
    const input = context([feature])
    const result = detailedMatch(input, { demandKey: 'one', tags: [feature.featureTag] }, catalog)
    const expected = fittingTools(
      [feature],
      [feature],
      withClampingLength(catalog.tools, SHEET_CLAMPING),
      undefined,
      input.knobs,
    )

    expect(
      rehydrateVerdicts(result.fitting, withClampingLength(catalog.tools, SHEET_CLAMPING)).map(
        (verdict) => ({
          guid: verdict.tool.guid,
          removed: verdict.removed,
          warned: verdict.warned,
          demoted: verdict.demoted,
          key: verdict.key,
        }),
      ),
    ).toEqual(
      expected.fitting.map((verdict) => ({
        guid: verdict.tool.guid,
        removed: verdict.removed,
        warned: verdict.warned,
        demoted: verdict.demoted,
        key: verdict.key,
      })),
    )
  })

  it('keeps a thread bore only inside the demand that supplied it', () => {
    const feature = pocket('pocket-1')
    const input = context([feature])
    const withBore = detailedMatch(
      input,
      { demandKey: 'threaded', tags: [feature.featureTag], bores: { [feature.featureTag]: 4.2 } },
      catalog,
    )
    const withoutBore = detailedMatch(
      input,
      { demandKey: 'plain', tags: [feature.featureTag] },
      catalog,
    )

    expect(withBore.demandKey).toBe('threaded')
    expect(withoutBore.demandKey).toBe('plain')
  })

  it('applies the same threshold-derived setup policy as the part route', () => {
    const input = context([pocket('pocket-1')])
    const prepared = prepareMatch(input, catalog)

    expect(prepared.tools).toEqual(
      withClampingLength(catalog.tools, input.clamping, policyOf(input.thresholds)),
    )
    expect(prepared.admitted).toEqual(prepared.tools)
  })

  it('recommends the first tool the detailed table can hold', () => {
    const feature = pocket('pocket-1')
    const input = context([feature])
    const demand = { demandKey: 'one', tags: [feature.featureTag], reachTag: feature.featureTag }
    const holdableCatalog = { tools: catalog.tools, holders: [holder], collets: [collet] }
    const detailed = detailedMatch(input, demand, holdableCatalog)
    const recommendation = recommendationMatch(input, demand, holdableCatalog)

    expect(detailed.heldGuids).not.toHaveLength(0)
    expect(recommendation).toEqual({
      demandKey: 'one',
      state: 'ready',
      toolGuid: detailed.heldGuids[0],
    })
  })

  it('treats missing toolholding records as an unconstrained catalog', () => {
    const feature = pocket('pocket-1')
    const input = context([feature])
    const demand = { demandKey: 'one', tags: [feature.featureTag], reachTag: feature.featureTag }
    const detailed = detailedMatch(input, demand, catalog)
    const recommendation = recommendationMatch(input, demand, catalog)

    expect(detailed.heldGuids).not.toHaveLength(0)
    expect(recommendation).toEqual({
      demandKey: 'one',
      state: 'ready',
      toolGuid: detailed.heldGuids[0],
    })
  })

  it('returns one recommendation result for every demand in a sixteen-feature batch', () => {
    const features = Array.from({ length: 16 }, (_, index) => pocket(`pocket-${String(index)}`))
    const input = context(features)
    const results = features.map((feature) =>
      recommendationMatch(
        input,
        { demandKey: feature.featureTag, tags: [feature.featureTag] },
        catalog,
      ),
    )

    expect(results).toHaveLength(16)
    expect(results.map((result) => result.demandKey)).toEqual(
      features.map((feature) => feature.featureTag),
    )
  })
})
