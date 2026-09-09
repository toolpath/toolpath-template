import { describe, expect, it } from 'vitest'
import type { CatalogTool, Collet, Holder } from '@toolpath/catalog-data'
import type { PartFeature } from '@toolpath/part-contracts'
import { SHEET_CLAMPING, withClampingLength } from './clamping-length'
import {
  detailedMatch,
  featuresKey,
  matchKey,
  prepareMatch,
  recommendationMatch,
  rehydrateVerdicts,
  type MatchContext,
} from './catalog-matcher'
import { EMPTY_QUERY } from './filter'
import { policyOf, thresholdsFrom } from './holder-choice'
import { fittingTools, ruleTally, tightestOf, tightestRule } from './tool-fit'
import { closestMisses } from './judge'

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
  overrides: [],
})

const catalog = { tools: [tool('SMALL', 6), tool('LARGE', 10)], holders: [], collets: [] }

/** Two that the 8-10 mm pocket admits and one it is too wide for, by a stated amount. */
const wide = {
  tools: [tool('SMALL', 6), tool('MID', 7), tool('WIDE', 10)],
  holders: [],
  collets: [],
}

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

  it('judges the discrete filters without the ranges, so a range hides a tool without unjudging it', () => {
    const feature = pocket('pocket-1')
    const input = {
      ...context([feature]),
      // 7 mm exactly: the pocket admits SMALL and MID, and the range admits MID.
      query: { text: '', terms: {}, ranges: { DC: { min: 7, max: 7 } } },
    }
    const prepared = prepareMatch(input, wide)
    const result = detailedMatch(
      input,
      { demandKey: 'one', tags: [feature.featureTag] },
      wide,
      prepared,
    )

    expect(prepared.considered.map((each) => each.guid)).toEqual(['SMALL', 'MID', 'WIDE'])
    expect(prepared.admitted.map((each) => each.guid)).toEqual(['MID'])
    // The rules were run over all three, so the one the range hides is still a
    // near miss the panel can offer rather than a tool nobody ever judged.
    expect(result.fitting.map((each) => each.toolGuid).sort()).toEqual(['MID', 'SMALL'])
    expect(result.narrowedGuids).toEqual(['MID'])
    expect(result.nearMisses.map((each) => each.toolGuid)).toEqual(['WIDE'])
  })

  /**
   * **A form the filter asks for is a form the question is about** (Paul,
   * 2026-09-08: "there is no way to show end mills if I can't find a drill").
   *
   * The pocket's type table considers end mills, so a drill in the catalog is
   * removed before a rule reads it — and adding one to the `form` filter is
   * the whole of the ask. Pinned here because the wiring is what was missing:
   * the predrill button had been writing that filter since 2026-09-02 and the
   * judge was throwing the tools away again.
   */
  it('lets the form filter put a type the feature does not consider into the judging', () => {
    const feature = pocket('pocket-1')
    const drill = { ...tool('DRILL', 6), form: 'drill', toolType: 'drill' } as CatalogTool
    const crib = { tools: [tool('SMALL', 6), drill], holders: [], collets: [] }
    const asking = (forms: ReadonlyArray<string>) =>
      detailedMatch(
        { ...context([feature]), query: { text: '', terms: { form: forms }, ranges: {} } },
        { demandKey: 'one', tags: [feature.featureTag] },
        crib,
      )

    const before = asking(['flat end mill'])
    expect(before.fitting.map((each) => each.toolGuid)).toEqual(['SMALL'])

    const after = asking(['flat end mill', 'drill'])
    expect(after.fitting.map((each) => each.toolGuid).sort()).toEqual(['DRILL', 'SMALL'])
    // Asked for, not forgiven: every other rule still reads it.
    expect(rehydrateVerdicts(after.fitting, crib.tools).map((each) => each.tool.form)).toContain(
      'drill',
    )
  })

  /**
   * **The filters are the last word** (Paul, 2026-09-08: "I may want to use a
   * larger tool than required … when I change the filter, it currently shows me
   * 'no tools match'"). Asking for the 10 mm cutter in an 8 mm pocket is a
   * question with an answer, and every list the worker sent said nothing.
   */
  /** Widened past what the pocket admits: only WIDE is left, and it is removed. */
  const widened = {
    ...context([pocket('pocket-1')]),
    query: { text: '', terms: {}, ranges: { DC: { min: 9 } } },
  }

  it('counts what each column alone is holding back, before anything is overridden', () => {
    const result = detailedMatch(widened, { demandKey: 'one', tags: ['pocket-1'] }, wide)

    expect(result.narrowedGuids).toEqual([])
    expect(result.heldGuids).toEqual([])
    // The offer the Diameter dialog makes, measured over the whole removed set.
    expect(result.overridableByCode).toEqual({ DC: 1 })
    // And nothing is forgiven that nobody asked to have forgiven.
    expect(result.overridable).toEqual([])
  })

  it('sends the removed tools a forgiven column puts back, with their verdicts', () => {
    const result = detailedMatch(
      { ...widened, overrides: ['DC'] },
      { demandKey: 'one', tags: ['pocket-1'] },
      wide,
    )

    expect(result.overridable.map((each) => each.toolGuid)).toEqual(['WIDE'])
    // With its verdict, so the table can still say which rule it overrules.
    expect(result.overridable[0]?.removed.length).toBeGreaterThan(0)
  })

  /**
   * **A filter overrules the rule it is the same question as, and no other**
   * (Paul, 2026-09-08). Forgiving the flute length says nothing about a tool
   * the diameter rows turned down.
   */
  it('forgives only the column that was overridden', () => {
    const result = detailedMatch(
      { ...widened, overrides: ['LCF'] },
      { demandKey: 'one', tags: ['pocket-1'] },
      wide,
    )

    expect(result.overridable).toEqual([])
  })

  it('offers nothing to override where the filters admit nothing the rules removed', () => {
    const feature = pocket('pocket-1')
    const input = {
      ...context([feature]),
      query: { text: '', terms: {}, ranges: { DC: { min: 7, max: 7 } } },
      overrides: ['DC'],
    }
    const result = detailedMatch(input, { demandKey: 'one', tags: [feature.featureTag] }, wide)

    // MID fits, so there is nothing being kept from the person by the rules —
    // WIDE is outside their own range and is a near miss rather than an
    // override.
    expect(result.overridable).toEqual([])
    expect(result.overridableByCode).toEqual({})
    expect(result.nearMisses.map((each) => each.toolGuid)).toEqual(['WIDE'])
  })

  /**
   * **An override must not evict a recommendation** — the same reasoning that
   * keeps the display unit out of a one-each key: a pick is never drawn from the
   * removed set, so an override cannot move it.
   */
  it('leaves an override out of a recommendation key and in a table key', () => {
    const demands = [{ demandKey: 'one', tags: ['pocket-1'] }]
    const forgiven = { ...widened, overrides: ['DC'] }

    expect(matchKey('recommendations', forgiven, demands)).toBe(
      matchKey('recommendations', widened, demands),
    )
    expect(matchKey('table', forgiven, demands)).not.toBe(matchKey('table', widened, demands))
  })

  it('sends the closest misses with the whole removed set as a count and a tally', () => {
    const feature = pocket('pocket-1')
    const input = context([feature])
    const result = detailedMatch(input, { demandKey: 'one', tags: [feature.featureTag] }, wide)
    const every = fittingTools(
      [feature],
      [feature],
      withClampingLength(wide.tools, SHEET_CLAMPING, policyOf(input.thresholds)),
      undefined,
      input.knobs,
    )

    // The count and the tally are taken where the whole set still exists; only
    // the near misses themselves cross the boundary.
    expect(result.excludedCount).toBe(every.excluded.length)
    expect(result.ruleTally).toEqual(ruleTally(every.excluded))
    expect(tightestOf(result.ruleTally)).toBe(tightestRule(every.excluded))
    expect(result.nearMisses.map((each) => each.toolGuid)).toEqual(
      closestMisses(every.excluded, 50).map((verdict) => verdict.tool.guid),
    )
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

/**
 * **The report crosses the worker boundary once** (Paul, 2026-09-07: "it still
 * lags quite a bit when I finish with one feature then go to select another …
 * the hover highlight and ability to click on the model hangs"). A key was
 * built by serialising the whole feature list, on every render that asked for
 * one, and the request carried the list again — measured at 3.4 MB a message on
 * a 400-feature part.
 */
describe('the features key', () => {
  const one = (tag: string): PartFeature =>
    ({ featureTag: tag, featureType: 'wall', regionIdxs: [0] }) as unknown as PartFeature

  it('is the same for one array asked twice', () => {
    const features = [one('a'), one('b')]
    expect(featuresKey(features)).toBe(featuresKey(features))
  })

  it('is the same for two arrays that say the same thing', () => {
    expect(featuresKey([one('a')])).toBe(featuresKey([one('a')]))
  })

  it('differs for a different report', () => {
    expect(featuresKey([one('a')])).not.toBe(featuresKey([one('b')]))
  })

  /** The digest is what goes in the key, so a key never carries a datasheet. */
  it('keeps the features out of the match key', () => {
    const features = [one('a')]
    const key = matchKey('table', context(features), [{ demandKey: 'one', tags: ['a'] }])
    expect(key).toContain(featuresKey(features))
    expect(key).not.toContain('featureType')
  })
})
