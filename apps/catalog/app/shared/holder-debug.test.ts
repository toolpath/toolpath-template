import { describe, expect, it } from 'vitest'
import type { CatalogTool, Collet, Holder } from '@toolpath/catalog-data'
import { holdersToOffer } from './assembly-narrowing'
import { holderReport } from './holder-debug'

const holder = (over: Partial<Holder>): Holder =>
  ({
    guid: 'holder-a',
    familyId: 'sample-bt30-holders',
    brand: 'Kennametal',
    vendor: 'Kennametal',
    catalogNumber: 'BT30ER16060M',
    materialNumber: null,
    taper: 'BT30',
    contact: 'taper',
    clamping: 'collet',
    colletSeries: 'ER16',
    boreDiameter: null,
    gaugeLength: 60,
    noseDiameter: 34,
    noseLength: 8,
    bodyDiameter: 42,
    bodyLength: 3,
    projection: 11.6,
    flangeDiameter: 46,
    colletProtrusion: 2,
    productLink: null,
    cadModelUrl: null,
    provenance: {},
    ...over,
  }) as Holder

const collet = (over: Partial<Collet>): Collet =>
  ({
    guid: 'collet-a',
    familyId: 'sample-er16-collets',
    brand: 'Kennametal',
    vendor: 'Kennametal',
    catalogNumber: 'ER16-6',
    materialNumber: null,
    series: 'ER16',
    clampMin: 5,
    clampMax: 6,
    clampLength: 18,
    productLink: null,
    provenance: {},
    ...over,
  }) as Collet

const tool = (guid: string, shank: number): CatalogTool =>
  ({
    guid,
    catalogNumber: guid,
    brand: 'Kennametal',
    familyId: 'sample',
    form: 'square end mill',
    geometry: { DC: shank, SFDM: shank, LCF: 20, OAL: 60 },
  }) as unknown as CatalogTool

const er16 = collet({})
const er16Chuck = holder({})
/** A shrink chuck whose one bore is 6 mm, drawable. */
const shrink = holder({
  guid: 'holder-shrink',
  catalogNumber: 'BT30SF06',
  clamping: 'shrink',
  colletSeries: null,
  boreDiameter: 6,
})
/** A hydraulic chuck that publishes no silhouette from any source. */
const hydraulic = holder({
  guid: 'holder-hyd',
  catalogNumber: 'BT30HC12',
  clamping: 'hydraulic',
  colletSeries: null,
  boreDiameter: 12,
  noseDiameter: null,
})

const input = (over: Partial<Parameters<typeof holderReport>[0]> = {}) => ({
  about: 'a feature',
  dataset: '2026-09-10T00:00:00.000Z',
  holders: [er16Chuck, shrink, hydraulic],
  collets: [er16],
  tools: [tool('t6', 6)],
  chosenTool: null,
  chosenCollet: null,
  filters: {},
  canDraw: (each: Holder) => each.noseDiameter !== null,
  inQuery: () => true,
  noCollet: false,
  ...over,
})

describe('the holder report', () => {
  it('says which dataset is loaded, since the fallback looks like an empty crib', () => {
    expect(holderReport(input())).toContain('dataset: built 2026-09-10T00:00:00.000Z')
  })

  it('names the shanks being asked about', () => {
    expect(holderReport(input({ tools: [tool('t6', 6), tool('t12', 12)] }))).toContain(
      'shanks 6, 12',
    )
  })

  it('blames the bore when a shrink chuck does not match any asked shank', () => {
    const text = holderReport(input({ tools: [tool('t10', 10)] }))
    expect(text).toContain('bore 6 is none of the asked shanks (10)')
  })

  it('blames the silhouette when a holder that fits cannot be drawn', () => {
    const text = holderReport(input({ tools: [tool('t12', 12)] }))
    expect(text).toContain('no published nose diameter')
    expect(text).toContain('BT30HC12')
  })

  it('blames a crib filter before anything else, so a forgotten filter is not read as a misfit', () => {
    const text = holderReport(input({ filters: { taper: ['CAT40'] } }))
    expect(text).toContain('a crib filter excludes it')
  })

  it('says a chuck was held back for want of a collet, and which press shows it', () => {
    const text = holderReport(input({ collets: [], tools: [tool('t6', 6)], holders: [er16Chuck] }))
    expect(text).toContain('show with no collet')
  })

  /**
   * The report re-asks the rules rather than reading the page, so the one thing
   * that can go wrong is the two disagreeing. This is the lockstep check.
   */
  it('counts exactly what the table would draw', () => {
    const each = input({ tools: [tool('t6', 6)] })
    const offered = holdersToOffer(
      each.holders,
      { tool: null, collet: null },
      each.collets,
      each.filters,
      each.canDraw,
      each.tools,
      () => null,
    )
    const text = holderReport(each)
    const line = text.split('\n').find((row) => row.startsWith('match table filters'))
    expect(line?.trim().split(/\s+/).slice(3).join(' ')).toBeDefined()
    expect(Number(line?.trim().split(/\s+/)[3])).toBe(offered.stocked.length)
  })
})
