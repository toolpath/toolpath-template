import { describe, expect, it } from 'vitest'
import type { Assembly, CatalogTool, Holder } from '@toolpath/catalog-data'
import { dimensionLabel, dimensionsFor } from './tool-dimensions'

const tool = (geometry: Record<string, number>): CatalogTool =>
  ({
    guid: 'tool-1',
    familyId: 'family',
    brand: 'Kennametal',
    vendor: 'Kennametal',
    catalogNumber: 'TDMX0500',
    materialNumber: null,
    toolType: 'endmill',
    form: 'flat end mill',
    unitSystem: 'metric',
    geometry,
    materialGroups: [],
    productLink: null,
    provenance: {},
  }) as CatalogTool

/** A plain end mill: no relief behind the flutes. */
const plain = tool({ DC: 12, LCF: 30, OAL: 80, SFDM: 12, RE: 0.5 })

/** A necked one: the relief is under the shank and past the flutes. */
const necked = tool({
  DC: 6,
  LCF: 12,
  OAL: 75,
  SFDM: 6,
  'shoulder-diameter': 5.4,
  'shoulder-length': 40,
})

const holder = (gaugeLength: number | null): Holder =>
  ({
    guid: 'holder-1',
    familyId: 'regofix-bt30-pg-holders',
    brand: 'REGO-FIX',
    vendor: 'REGO-FIX',
    catalogNumber: 'BT 30 / PG 10 x 090',
    materialNumber: null,
    taper: 'BT30',
    contact: 'taper',
    clamping: 'collet',
    gaugeLength,
    colletSeries: 'PG10',
    boreDiameter: null,
    noseDiameter: 16,
    noseLength: null,
    bodyDiameter: null,
    bodyLength: null,
    projection: null,
    flangeDiameter: 46,
    colletProtrusion: null,
    productLink: null,
    cadModelUrl: null,
    provenance: {},
  }) as Holder

const codes = (dims: ReadonlyArray<{ code: string }>) => dims.map((each) => each.code)

describe('what a drawing of the tool alone dimensions', () => {
  it('measures the cut, the shank and the two lengths', () => {
    const { widths, lengths } = dimensionsFor(plain)

    expect(codes(widths)).toEqual(['DC', 'SFDM'])
    expect(codes(lengths)).toEqual(['LCF', 'OAL'])
  })

  /** Every length is measured from the tip, which is where the sheet measures from. */
  it('measures every length from the tip', () => {
    expect(dimensionsFor(plain).lengths.every((each) => each.from === 0)).toBe(true)
  })

  /**
   * Shortest innermost. Lanes assigned in the order they were listed would
   * cross the moment a tool's shoulder ran past its flutes.
   */
  it('nests the lines shortest first, so none crosses another', () => {
    const { lengths } = dimensionsFor(necked)

    expect(lengths.map((each) => [each.code, each.lane])).toEqual([
      ['LCF', 0],
      ['shoulder-length', 1],
      ['OAL', 2],
    ])
  })

  it('dimensions the relief only on a tool that has one', () => {
    expect(codes(dimensionsFor(necked).widths)).toContain('shoulder-diameter')
    expect(codes(dimensionsFor(plain).widths)).not.toContain('shoulder-diameter')
    expect(codes(dimensionsFor(plain).lengths)).not.toContain('shoulder-length')
  })

  /** A vendor's own number or nothing: a corner radius of zero is a square end, not a radius. */
  it('calls out a corner radius only where one is stated', () => {
    expect(dimensionsFor(plain).cornerRadius).toBe(0.5)
    expect(dimensionsFor(tool({ DC: 12, LCF: 30, RE: 0 })).cornerRadius).toBeNull()
  })

  it('draws nothing for a tool that states no diameter or flute length', () => {
    expect(dimensionsFor(tool({ OAL: 80 }))).toEqual({
      lengths: [],
      widths: [],
      cornerRadius: null,
    })
  })
})

describe('what the holder adds, and what it takes away', () => {
  const assembly = (stickout: number | null, gauge: number | null = 98.4): Assembly =>
    ({ tool: plain, holder: holder(gauge), collet: null, stickout, maxStickout: null }) as Assembly

  /**
   * Most of the shank is inside the holder, so a line to the end of it
   * measures to a face nobody can see.
   */
  it('drops the overall length and states the stickout instead', () => {
    const { lengths } = dimensionsFor(plain, { assembly: assembly(45) })

    expect(codes(lengths)).not.toContain('OAL')
    expect(codes(lengths)).toContain('stickout')
  })

  /**
   * Neither drawing reaches the spindle face — both stop past the flange — so
   * a gauge-length line would point at a face that is not there.
   */
  it('never dimensions the gauge length, stated or not', () => {
    expect(codes(dimensionsFor(plain, { assembly: assembly(45) }).lengths)).toEqual([
      'LCF',
      'stickout',
    ])
    expect(codes(dimensionsFor(plain, { assembly: assembly(45, null) }).lengths)).toEqual([
      'LCF',
      'stickout',
    ])
  })

  it('measures the shank above the nose, not inside the holder', () => {
    const { widths } = dimensionsFor(plain, { assembly: assembly(45) })
    const shank = widths.find((each) => each.code === 'SFDM')

    expect(shank?.at).toBeGreaterThan(30)
    expect(shank?.at).toBeLessThanOrEqual(45)
  })
})

describe('what a dimension is called', () => {
  it('keeps a code that is already a name, and names the ones that are not', () => {
    expect(dimensionLabel('LCF')).toBe('LCF')
    expect(dimensionLabel('shoulder-length')).toBe('shoulder')
  })
})
