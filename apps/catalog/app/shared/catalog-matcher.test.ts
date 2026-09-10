import { describe, expect, it } from 'vitest'
import type { CatalogTool, Collet, Holder } from '@toolpath/catalog-data'
import type { PartFeature } from '@toolpath/part-contracts'
import { SHEET_CLAMPING, withClampingLength } from './clamping-length'
import {
  detailedMatch,
  facetPool,
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
  ownRanges: {},
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

  /**
   * **A form the filters name gets its own nearest misses across the boundary**
   * (Paul, 2026-09-09). Fifty is the whole slice, and one form can fill it: a
   * predrill's drills miss a small bore by the next size up while the end mills
   * miss the helix limit by far more, so ticking the end mills on could not put
   * one on the list — the worker had never sent one.
   */
  it('sends the nearest of each form the filters ask about, not the nearest fifty of all of them', () => {
    const feature = pocket('pocket-1')
    // Fifty-five mills over the pocket's 8 mm corner, each missing by less than
    // any of the drills: the fifty nearest are all mills.
    const mills = Array.from({ length: 55 }, (_, index) =>
      tool(`MILL-${String(index)}`, 8.1 + index * 0.02),
    )
    // Drills the pocket admits by diameter whose flutes are half the depth: a
    // miss by a number, and a bigger one than any mill's.
    const drills = [6, 7, 8].map(
      (DC) =>
        ({
          ...tool(`DRILL-${String(DC)}`, DC),
          form: 'drill',
          toolType: 'drill',
          geometry: { DC, SFDM: DC, LCF: 4, OAL: 60, LD: 4, RE: 0, NOF: 2, SIG: 140 },
        }) as unknown as CatalogTool,
    )
    const crib = { tools: [...mills, ...drills], holders: [], collets: [] }
    const demand = { demandKey: 'one', tags: [feature.featureTag] }
    const formOf = (guid: string) => (guid.startsWith('DRILL') ? 'drill' : 'flat end mill')

    const blind = detailedMatch(context([feature]), demand, crib)
    expect(blind.nearMisses).toHaveLength(50)
    expect(blind.nearMisses.every((each) => formOf(each.toolGuid) === 'flat end mill')).toBe(true)

    const asked = {
      ...context([feature]),
      query: { ...EMPTY_QUERY, terms: { form: ['drill', 'flat end mill'] } },
    }
    const both = detailedMatch(asked, demand, crib)
    expect(both.nearMisses.filter((each) => formOf(each.toolGuid) === 'drill')).toHaveLength(3)
    // The overall fifty are still all there — each form's own slice is capped
    // by the same number — and the drills are added to them.
    expect(
      both.nearMisses.filter((each) => formOf(each.toolGuid) === 'flat end mill'),
    ).toHaveLength(50)
    expect(new Set(both.nearMisses.map((each) => each.toolGuid)).size).toBe(both.nearMisses.length)
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
 * **An axis must never count itself** (Paul, 2026-09-10: filter to Kennametal,
 * open the Vendor menu again, and every other vendor reads nought — "they have
 * compatible tools", and ticking one proves it).
 *
 * With a feature on the screen the rows are what the matcher judged, and the
 * matcher only judges what the terms already admit, so no other vendor's tools
 * had ever been put to the rules. The count beside a checkbox is a question
 * about every filter **but** that checkbox's own axis, which is why it is
 * answered here — beside the pipeline that is the only thing able to answer it
 * — rather than by counting the rows on screen.
 */
describe('the counts an axis offers while it is narrowing', () => {
  const branded = (guid: string, brand: string, DC: number): CatalogTool =>
    ({ ...tool(guid, DC), brand, vendor: brand }) as CatalogTool

  const crib = {
    tools: [
      branded('k-1', 'Kennametal', 6),
      branded('w-1', 'WIDIA', 6),
      branded('w-2', 'WIDIA', 7),
    ],
    holders: [],
    collets: [],
  }
  const feature = pocket('pocket-1')
  const demand = { demandKey: 'one', tags: [feature.featureTag] }
  const asked = (terms: Record<string, ReadonlyArray<string>>): MatchContext => ({
    ...context([feature]),
    query: { ...EMPTY_QUERY, terms },
  })

  it('says nothing while no facet is narrowing, because the rows are the answer', () => {
    expect(detailedMatch(asked({}), demand, crib).facetCounts).toBeNull()
  })

  it('counts the vendors a chosen vendor hid, over tools the rules actually admit', () => {
    const result = detailedMatch(asked({ brand: ['Kennametal'] }), demand, crib)

    expect(result.heldGuids).toEqual(['k-1'])
    expect(result.facetCounts?.brand).toEqual({ Kennametal: 1, WIDIA: 2 })
  })

  it('measures one axis against every other filter that is set', () => {
    const result = detailedMatch(
      asked({ brand: ['Kennametal'], type: ['Flat end mill'] }),
      demand,
      crib,
    )

    // The vendor count still answers "what would WIDIA bring" *with* the type
    // narrowing standing, and the type count answers it with the vendor's.
    expect(result.facetCounts?.brand).toEqual({ Kennametal: 1, WIDIA: 2 })
    expect(result.facetCounts?.type).toEqual({ 'Flat end mill': 1 })
  })

  /**
   * **A count is measured over the rows it stands beside** (Paul, 2026-09-10: a
   * pocket offering six necked bull nose end mills over a table holding none).
   * The tool table under an assembly is `narrowTools` applied to this answer,
   * so a collet in the stack takes every shank it cannot close on off the
   * screen — and the counts knew nothing about it.
   */
  it('counts only what the collet in the stack can hold', () => {
    const wider: Collet = {
      ...collet,
      guid: 'collet-2',
      catalogNumber: 'PG6-7',
      clampMin: 7,
      clampMax: 7,
    }
    const stocked = { tools: crib.tools, holders: [holder], collets: [collet, wider] }
    const query = asked({ brand: ['Kennametal'] })

    // The crib holds both shanks, so all three tools are on the widened pool.
    expect(detailedMatch(query, demand, stocked).facetCounts?.brand).toEqual({
      Kennametal: 1,
      WIDIA: 2,
    })

    const inStack = { ...demand, stack: { holderGuid: holder.guid, colletGuid: collet.guid } }

    // `collet-1` closes on ⌀6 alone, which is the ⌀7 WIDIA tool off the table.
    expect(detailedMatch(query, inStack, stocked).facetCounts?.brand).toEqual({
      Kennametal: 1,
      WIDIA: 1,
    })
  })

  it('leaves a stack whose guids name nothing in this crib alone', () => {
    const stocked = { tools: crib.tools, holders: [holder], collets: [collet] }
    const gone = { ...demand, stack: { holderGuid: 'holder-gone', colletGuid: 'collet-gone' } }

    expect(
      detailedMatch(asked({ brand: ['Kennametal'] }), gone, stocked).facetCounts?.brand,
    ).toEqual({ Kennametal: 1, WIDIA: 1 })
  })

  it("leaves a caller's widened pool alone rather than judging a second time", () => {
    const pool = facetPool(asked({ brand: ['Kennametal'] }), demand, crib)

    expect([...pool.map((each) => each.guid)].sort()).toEqual(['k-1', 'w-1', 'w-2'])
    expect(
      detailedMatch(asked({ brand: ['Kennametal'] }), demand, crib, undefined, pool).facetCounts
        ?.brand,
    ).toEqual({ Kennametal: 1, WIDIA: 2 })
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

/**
 * **A bound somebody typed is obeyed by the list that stands in when nothing
 * fits** (Paul, 2026-09-10: at most three flutes, then Kennametal, and
 * four-flute tools on the list — "they should not be … we should see 'no tools
 * meet these filters'").
 *
 * And obeyed **here**, before the fifty nearest are taken. The cap ranks on how
 * far a tool is outside the *rules*, which never asks the flute count — so the
 * one three-flute tool that could stand in is exactly the one a cap taken first
 * would drop, and no amount of narrowing on the far side of the worker boundary
 * could put it back.
 */
describe('the misses a typed bound leaves standing', () => {
  const flutes = (guid: string, DC: number, NOF: number): CatalogTool => {
    const each = tool(guid, DC)
    return { ...each, geometry: { ...each.geometry, NOF } } as CatalogTool
  }

  const feature = pocket('pocket-1')
  const demand = { demandKey: 'one', tags: [feature.featureTag] }
  // Sixty four-flute cutters that miss the pocket by a hair, and one
  // three-flute that misses it by a mile.
  const crib = {
    tools: [
      ...Array.from({ length: 60 }, (each, at) => flutes(`four-${String(at)}`, 11, 4)),
      flutes('three', 30, 3),
    ],
    holders: [],
    collets: [],
  }

  it('ranks on the rules alone while only the geometry is bounding the list', () => {
    const result = detailedMatch(context([feature]), demand, crib)

    expect(result.excludedCount).toBe(61)
    expect(result.nearMisses).toHaveLength(50)
    expect(result.nearMisses.map((each) => each.toolGuid)).not.toContain('three')
  })

  it('narrows to the bound before the nearest are taken', () => {
    const result = detailedMatch(
      { ...context([feature]), ownRanges: { NOF: { max: 3 } } },
      demand,
      crib,
    )

    expect(result.nearMisses.map((each) => each.toolGuid)).toEqual(['three'])
  })
})
