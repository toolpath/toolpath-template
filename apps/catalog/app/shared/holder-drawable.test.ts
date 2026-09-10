import type { CatalogTool, Holder } from '@toolpath/catalog-data'
import { assemblyOutline } from '@toolpath/tool-drawing/geometry'
import { describe, expect, it } from 'vitest'
import { toViewerAssembly } from 'shared/tool-drawing-input'
import { drawable } from './holder-choice'

const holder = (over: Partial<Holder> = {}): Holder =>
  ({
    guid: 'h-1',
    familyId: 'bt30',
    brand: 'REGO-FIX',
    vendor: 'REGO-FIX',
    catalogNumber: 'BT30-ER16-70',
    taper: 'BT30',
    clamping: 'collet',
    gaugeLength: 70,
    colletSeries: 'ER16',
    boreDiameter: null,
    noseDiameter: null,
    noseLength: null,
    bodyDiameter: null,
    bodyLength: null,
    projection: null,
    flangeDiameter: null,
    colletProtrusion: null,
    cadModelUrl: null,
    provenance: {},
    ...over,
  }) as unknown as Holder

const tool = {
  guid: 't',
  familyId: 'f',
  brand: 'WIDIA',
  vendor: 'Kennametal',
  catalogNumber: 'TDMX0600',
  materialNumber: null,
  toolType: 'endmill',
  form: 'flat end mill',
  unitSystem: 'millimeters',
  geometry: { DC: 6, LCF: 13, OAL: 57, SFDM: 6, RE: 0, NOF: 4 },
  materialGroups: ['P'],
  productLine: null,
  productLink: null,
  provenance: {},
} as unknown as CatalogTool

const none = () => false
const always = () => true

/** The parts `assemblyOutline` draws for the holder rather than the tool. */
const HOLDER_PARTS = new Set(['nose', 'body', 'flange', 'profile'])

/** Whether the package actually puts a holder on the page for this record. */
const packageDraws = (each: Holder): boolean => {
  const outline = assemblyOutline(toViewerAssembly({ tool, holder: each, stickout: 19 }))
  return (outline?.segments ?? []).some((segment) => HOLDER_PARTS.has(segment.part))
}

/**
 * **A holder nobody can draw is not worth offering** (Paul, 2026-09-07: "some
 * holders in the drop down don't render"). Under the record seam a
 * `HolderRecord` carries identity, taper and gauge length and no geometry, so
 * most of the rack has no silhouette at all.
 */
describe('whether a holder can be drawn', () => {
  it('takes a measured profile as the whole answer', () => {
    expect(drawable(holder(), always)).toBe(true)
  })

  /** Identity, taper and a gauge length are not a shape. */
  it('refuses a record that states no geometry at all', () => {
    expect(drawable(holder(), none)).toBe(false)
  })

  /**
   * The nose is the whole gate, and the rest of the published table is optional
   * decoration on top of it. This is the pair that made the first version of
   * `drawable` wrong: it asked whether *any* dimension was stated, so a flange
   * with no nose passed and then drew a blank panel.
   */
  it('turns on the nose diameter alone, not on any published dimension', () => {
    expect(drawable(holder({ noseDiameter: 34 }), none)).toBe(true)
    expect(drawable(holder({ flangeDiameter: 46, projection: 11.6 }), none)).toBe(false)
  })

  /** A stated null is the vendor's silence, not a dimension. */
  it('reads an explicit null as nothing stated', () => {
    expect(drawable(holder({ noseDiameter: null, bodyDiameter: 42 }), none)).toBe(false)
  })
})

/**
 * The rule checked against the package that owns it.
 *
 * `drawable` is this application's belief about when
 * `@toolpath/tool-drawing` puts a holder on the page, and a belief nobody
 * checks is worth nothing — restating the package's gate in a comment is how
 * the first version came to pass 21 holders that all drew blank panels. So
 * every shape of published record goes through the real `assemblyOutline` and
 * the two answers have to agree.
 *
 * The same lockstep `tool-drawing-input.test.ts` keeps over the drawable forms
 * and `catalog-drawing.test.tsx` over the frame, for the same reason.
 */
describe('the rule against the package that owns it', () => {
  const cases: ReadonlyArray<[string, Holder]> = [
    ['nothing published', holder()],
    ['a nose alone', holder({ noseDiameter: 34 })],
    ['a nose and a body', holder({ noseDiameter: 34, bodyDiameter: 42, bodyLength: 3 })],
    ['a flange but no nose', holder({ flangeDiameter: 46, projection: 11.6 })],
    ['a body but no nose', holder({ bodyDiameter: 42, bodyLength: 3 })],
    ['a nose length but no nose diameter', holder({ noseLength: 26 })],
    [
      'the whole published table',
      holder({
        noseDiameter: 34,
        noseLength: 8,
        bodyDiameter: 42,
        bodyLength: 3,
        projection: 11.6,
        flangeDiameter: 46,
      }),
    ],
  ]

  it.each(cases)('agrees with assemblyOutline about %s', (_what, each) => {
    expect(drawable(each, none)).toBe(packageDraws(each))
  })
})
