import { describe, expect, it } from 'vitest'
import { colletsFrom, holdersFrom, type RegofixContext } from './regofix.js'

const context: RegofixContext = {
  guidFor: (material) => `guid-${material}`,
  productLinkFor: (material) => `https://us.rego-fix.com/${material}`,
}

/** A real row, as `scrapeHolders` produced it on 2026-08-28. */
const HOLDER = {
  'Material Number': '2130.70610',
  'ISO Catalog Number': 'BT 30 / PG 6 x 050',
  CST: 'PG6',
  contact: 'taper',
  L1_mm: '98.4',
  D2_mm: '10',
  B3_mm: '50',
  CAD_STEP_URL: 'https://static.rego-fix.com/…/213070610.stp',
  DIN_A2: '12.02',
  DIN_B1: '10.55',
  DIN_B2: '9.6',
  DIN_B3_WOA: '47.5',
}

/** Two real collet rows: one metric, one designated in inches. */
const METRIC_COLLET = {
  'Material Number': '1706.01000',
  'ISO Catalog Number': 'PG 6 Ø 1.0 mm',
  'Collet Series': 'PG6',
  unit: 'millimeters',
  o_mm: '1',
  D1_mm: '1',
  CCCN_mm: '1',
  CCCX_mm: '1',
}

const INCH_COLLET = {
  'Material Number': '1706.01591',
  'ISO Catalog Number': 'PG 6 Ø 1/16"',
  'Collet Series': 'PG6',
  unit: 'inches',
  o_mm: '1.59',
  D1_in: '0.0625',
  D1_mm: '1.5875',
  CCCN_in: '0.0625',
  CCCN_mm: '1.5875',
  CCCX_in: '0.0625',
  CCCX_mm: '1.5875',
}

describe('holders', () => {
  it('reads the pinned DIN codes and nothing else', () => {
    const [holder] = holdersFrom([HOLDER], context)

    expect(holder).toMatchObject({
      catalogNumber: 'BT 30 / PG 6 x 050',
      taper: 'BT30',
      clamping: 'collet',
      colletSeries: 'PG6',
      // L1_mm is B4, pinned as gage length.
      gaugeLength: 98.4,
      // D2_mm is A1, pinned as the diameter at the collet end.
      noseDiameter: 10,
      boreDiameter: null,
    })
  })

  /**
   * Pinned 2026-08-29 by how they vary across the series — the table is in
   * the plan document. Each is read as what it was pinned as, and nothing else.
   */
  it('reads the body the vendor states behind the nose', () => {
    const [holder] = holdersFrom([HOLDER], context)

    expect(holder).toMatchObject({
      noseLength: 10.55,
      bodyDiameter: 12.02,
      bodyLength: 9.6,
      projection: 50,
    })
  })

  /** The flange is the taper's; the collet's protrusion is the two projections' difference, to the decimal the collet sheets state. */
  it('derives the flange from the taper and the collet protrusion from the two projections', () => {
    const [holder] = holdersFrom([HOLDER], context)

    expect(holder?.flangeDiameter).toBe(46)
    expect(holder?.colletProtrusion).toBe(2.5)
    expect(holder?.provenance?.flangeDiameter).toBe('derived')
    expect(holder?.provenance?.colletProtrusion).toBe('derived')
  })

  it('reads the vendor’s contact form and its STEP model', () => {
    const [plain] = holdersFrom([HOLDER], context)
    const [dual] = holdersFrom([{ ...HOLDER, contact: 'face' }], context)
    const [unknown] = holdersFrom([{ ...HOLDER, contact: 'dual', CAD_STEP_URL: '' }], context)

    expect(plain?.contact).toBe('taper')
    expect(plain?.cadModelUrl).toBe('https://static.rego-fix.com/…/213070610.stp')
    expect(dual?.contact).toBe('face')
    expect(unknown?.contact).toBeNull()
    expect(unknown?.cadModelUrl).toBeNull()
  })

  it('leaves a body dimension the sheet does not state as unstated', () => {
    const [holder] = holdersFrom([{ ...HOLDER, DIN_B2: '', DIN_B3_WOA: '' }], context)

    expect(holder?.bodyLength).toBeNull()
    expect(holder?.colletProtrusion).toBeNull()
  })

  it('mints the guid through the scraper’s own rule', () => {
    expect(holdersFrom([HOLDER], context)[0]?.guid).toBe('guid-2130.70610')
  })

  it('skips a row with no material number rather than minting a guid off nothing', () => {
    expect(holdersFrom([{ ...HOLDER, 'Material Number': '' }], context)).toEqual([])
  })
})

describe('collets', () => {
  it('carries a powRgrip collet’s zero-width clamping range as a range', () => {
    const [collet] = colletsFrom([METRIC_COLLET], context, 'pg-standard')

    expect(collet).toMatchObject({ series: 'PG6', clampMin: 1, clampMax: 1 })
  })

  /**
   * The inch designation is what a machinist ordered; the millimetre value is
   * what fit arithmetic compares, and the scrape projects it exactly.
   */
  it('reads millimetres even from an inch-designated collet, and keeps the designation', () => {
    const [collet] = colletsFrom([INCH_COLLET], context, 'pg-standard')

    expect(collet?.clampMin).toBe(1.5875)
    expect(collet?.catalogNumber).toBe('PG 6 Ø 1/16"')
  })

  /** No grip length is published, so no stickout can be honest downstream. */
  it('states no grip length, because the vendor does not', () => {
    expect(colletsFrom([METRIC_COLLET], context, 'pg-standard')[0]?.clampLength).toBeNull()
  })

  it('writes the series exactly as designated, so PGST matches no PG holder', () => {
    const pgst = { ...METRIC_COLLET, 'Collet Series': 'PGST15' }

    expect(colletsFrom([pgst], context, 'pgst')[0]?.series).toBe('PGST15')
  })

  it('skips a row with no clamping capacity rather than defaulting one', () => {
    const { CCCN_mm, CCCX_mm, ...noCapacity } = METRIC_COLLET

    expect(colletsFrom([noCapacity], context, 'pg-standard')).toEqual([])
  })
})
