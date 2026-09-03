import { describe, expect, it } from 'vitest'
import { CatalogBuildError, buildCatalog, undefinedGeometryCodes, withDerived } from './build.js'
import { CATALOG_VERSION } from './types.js'
import type { CatalogTool, FamilyInput } from './index.js'

const tool = (
  over: Partial<CatalogTool> & Pick<CatalogTool, 'guid' | 'familyId'>,
): CatalogTool => ({
  brand: 'WIDIA',
  vendor: 'Kennametal',
  catalogNumber: 'TDMX0500',
  materialNumber: '1234567',
  toolType: 'endmill',
  form: 'flat end mill',
  unitSystem: 'millimeters',
  geometry: { DC: 5, OAL: 50, LCF: 12, NOF: 4, RE: 0.5, SFDM: 6 },
  materialGroups: ['P'],
  productLine: null,
  productLink: null,
  provenance: { DC: 'vendor-stated' },
  ...over,
})

const family = (over: Partial<FamilyInput> & Pick<FamilyInput, 'id' | 'tools'>): FamilyInput => ({
  name: 'Test family',
  brand: 'WIDIA',
  vendor: 'Kennametal',
  unitSystem: 'millimeters',
  source: null,
  ...over,
})

describe('buildCatalog', () => {
  it('flattens families into one list and counts each family', () => {
    const catalog = buildCatalog({
      builtAt: '2026-08-27',
      families: [
        family({
          id: 'endmills',
          tools: [
            tool({ guid: 'a', familyId: 'endmills' }),
            tool({ guid: 'b', familyId: 'endmills' }),
          ],
        }),
        family({
          id: 'drills',
          tools: [tool({ guid: 'c', familyId: 'drills', toolType: 'drill' })],
        }),
      ],
    })

    expect(catalog.tools.map((each) => each.guid)).toEqual(['a', 'b', 'c'])
    expect(catalog.families.map((each) => [each.id, each.toolCount])).toEqual([
      ['endmills', 2],
      ['drills', 1],
    ])
    expect(catalog.families[1]?.toolTypes).toEqual(['drill'])
  })

  /**
   * The guid is what a URL, a saved order and a cart line all hold. Two tools
   * sharing one is a corrupt dataset, not a display problem, so it fails where
   * it is built rather than silently resolving to whichever came last.
   */
  it('refuses a duplicate guid across families', () => {
    expect(() =>
      buildCatalog({
        builtAt: '2026-08-27',
        families: [
          family({ id: 'endmills', tools: [tool({ guid: 'a', familyId: 'endmills' })] }),
          family({ id: 'drills', tools: [tool({ guid: 'a', familyId: 'drills' })] }),
        ],
      }),
    ).toThrow(CatalogBuildError)
  })

  it('refuses a tool filed under a family it does not claim', () => {
    expect(() =>
      buildCatalog({
        builtAt: '2026-08-27',
        families: [family({ id: 'drills', tools: [tool({ guid: 'a', familyId: 'endmills' })] })],
      }),
    ).toThrow(CatalogBuildError)
  })

  /*
   * The version-8 spelling, refused at the boundary rather than carried.
   *
   * `StickoutPolicy.step` is keyed on the unit system, so `metric` reaches it
   * as `undefined`, `steppedTo` divides by it, and every derived `LBH` comes
   * out `NaN` — which `JSON.stringify` writes as `null`. The document was
   * stamped version 9 either way, so the application's version check passed it
   * and the whole "below holder" column was quietly empty. `rebuild.mjs`
   * migrates the rename; this is what catches a caller that forgets to.
   */
  it('refuses a family whose unit system predates version 9', () => {
    expect(() =>
      buildCatalog({
        builtAt: '2026-08-27',
        families: [
          family({
            id: 'endmills',
            unitSystem: 'metric' as FamilyInput['unitSystem'],
            tools: [tool({ guid: 'a', familyId: 'endmills' })],
          }),
        ],
      }),
    ).toThrow(CatalogBuildError)
  })

  it('refuses a tool whose unit system predates version 9', () => {
    expect(() =>
      buildCatalog({
        builtAt: '2026-08-27',
        families: [
          family({
            id: 'endmills',
            tools: [
              tool({
                guid: 'a',
                familyId: 'endmills',
                unitSystem: 'inch' as CatalogTool['unitSystem'],
              }),
            ],
          }),
        ],
      }),
    ).toThrow(CatalogBuildError)
  })

  /*
   * The failure the refusal above replaces, pinned so it cannot come back: a
   * unit system this package knows produces a real `LBH`, not `NaN`.
   */
  it('derives a real length below the holder, never NaN', () => {
    const catalog = buildCatalog({
      builtAt: '2026-08-27',
      families: [family({ id: 'endmills', tools: [tool({ guid: 'a', familyId: 'endmills' })] })],
    })

    const { LBH } = catalog.tools[0]!.geometry
    expect(LBH).toBeTypeOf('number')
    expect(Number.isNaN(LBH)).toBe(false)
  })

  it('stamps the version and the caller’s build date rather than reading a clock', () => {
    const catalog = buildCatalog({ builtAt: '2026-08-27', families: [] })

    expect(catalog.builtAt).toBe('2026-08-27')
    // Literal on purpose: moving it is a decision, and this is where it is made.
    expect(catalog.version).toBe(CATALOG_VERSION)
    expect(catalog.tools).toEqual([])
  })
})

describe('undefinedGeometryCodes', () => {
  it('names codes the dictionary cannot label, so a new vendor column is loud', () => {
    const tools = [tool({ guid: 'a', familyId: 'f', geometry: { DC: 5, ZEFP: 2, WT: 1 } })]

    expect(undefinedGeometryCodes(tools)).toEqual(['WT', 'ZEFP'])
  })

  it('is empty when every code is one the catalog can explain', () => {
    expect(undefinedGeometryCodes([tool({ guid: 'a', familyId: 'f' })])).toEqual([])
  })
})

describe('what the pipeline works out for itself', () => {
  /**
   * **`LBH` is the setup length** (Justin Gray, 2026-09-03). It was the
   * ceiling — the overall length less the shank the shop keeps clamped — which
   * made it one of four unreconciled answers to how far a tool stands out, and
   * the one the drawing beside it contradicted. `stickout.ts` is the rule and
   * holds its own tests; these are that the build uses it and nothing else.
   */
  it('derives the setup stickout into LBH, and L/D from that', () => {
    // 13 mm of flute, up to the half-inch floor and onto the 3 mm step: 15,
    // and 15 ÷ 5. Its ceiling is 39, which is what this used to say.
    const derived = withDerived(
      tool({ guid: 'a', familyId: 'f', geometry: { DC: 5, SFDM: 6, LCF: 13, OAL: 57 } }),
    )

    expect(derived.geometry.LBH).toBe(15)
    expect(derived.provenance.LBH).toBe('derived')
    expect(derived.geometry.LD).toBe(3)
    expect(derived.provenance.LD).toBe('derived')
  })

  /**
   * No flute length, no head, no knowing where a setup starts — so no `LBH`
   * and no `LD`. A version-7 document gave this tool both, from `OAL` and
   * `SFDM` alone, which was only ever possible because the field meant the
   * ceiling.
   */
  it('derives no setup at all for a tool that states no flute length', () => {
    const derived = withDerived(
      tool({ guid: 'a', familyId: 'f', geometry: { DC: 5, SFDM: 6, OAL: 57 } }),
    )

    expect(derived.geometry.LBH).toBeUndefined()
    expect(derived.geometry.LD).toBeUndefined()
  })

  /**
   * Where the shop's clamping rule leaves less than the flutes, the ceiling
   * wins and the tool is drawn pushed all the way in — 3×⌀6 of a 24 mm tool
   * leaves 6, under its 13 of flute, so the setup collapses onto the flutes
   * rather than standing out to the sheet's step.
   */
  it('holds the setup under the ceiling where the rule would bury the head', () => {
    const stubby = withDerived(
      tool({ guid: 'a', familyId: 'f', geometry: { DC: 5, SFDM: 6, LCF: 13, OAL: 24 } }),
    )

    expect(stubby.geometry.LBH).toBe(13)
  })

  /** A figure this package worked out last time is replaced by what the rule says now. */
  it('re-derives its own figures on a rebuild, and keeps a vendor’s', () => {
    const rebuilt = withDerived(
      tool({
        guid: 'a',
        familyId: 'f',
        geometry: { DC: 5, SFDM: 6, LCF: 13, OAL: 57, LBH: 39, LD: 7.8 },
        provenance: { LBH: 'derived', LD: 'derived' },
      }),
    )
    expect(rebuilt.geometry.LBH).toBe(15)
    expect(rebuilt.geometry.LD).toBe(3)

    const stated = withDerived(
      tool({
        guid: 'a',
        familyId: 'f',
        geometry: { DC: 5, SFDM: 6, LCF: 13, OAL: 57, LBH: 30 },
        provenance: { LBH: 'vendor-stated' },
      }),
    )
    expect(stated.geometry.LBH).toBe(30)
    expect(stated.geometry.LD).toBe(6)
  })

  it('derives nothing without a diameter to divide by', () => {
    expect(
      withDerived(tool({ guid: 'a', familyId: 'f', geometry: { LCF: 13 } })).geometry.LD,
    ).toBeUndefined()
    expect(
      withDerived(tool({ guid: 'a', familyId: 'f', geometry: { DC: 0, LCF: 13 } })).geometry.LD,
    ).toBeUndefined()
  })

  /**
   * Derived where the dataset is built, so a column, a filter and a facet all
   * read one figure — not one formula in the table and another in the filters.
   */
  it('carries the derivation into a built catalog and its facets', () => {
    const catalog = buildCatalog({
      builtAt: '2026-08-28',
      families: [family({ id: 'f', tools: [tool({ guid: 'a', familyId: 'f' })] })],
    })

    // 12 mm of flute, already on the 3 mm step and under the 32 its shank
    // allows: set up at 12, and 12 ÷ 5.
    expect(catalog.tools[0]?.geometry.LBH).toBe(12)
    expect(catalog.tools[0]?.geometry.LD).toBe(2.4)
    expect(catalog.facets.ranges.map((axis) => axis.key)).toEqual(
      expect.arrayContaining(['LBH', 'LD']),
    )
  })
})
