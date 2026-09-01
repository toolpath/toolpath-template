import { describe, expect, it } from 'vitest'
import { holdersFrom, millimetres, type MaritoolContext } from './maritool.js'

const context: MaritoolContext = {
  guidFor: (material) => `guid-${material}`,
  productLinkFor: (material) => `https://www.maritool.com/${material}`,
}

/** Real rows, as `scrapeHolders` produced them for `maritool_cat50_holders.csv` on 2026-08-31. */
const COLLET_CHUCK = {
  'Material Number': 'CAT50-ER32-3.0D',
  products_id: '20906',
  taper: 'CAT50',
  contact: 'face',
  clamping: 'collet',
  style: 'er-collet-chuck',
  CST: 'ER32',
  L1_in: '3',
  L1_mm: '',
  'Collet Size': 'ER 32',
  'Gage Length': '3.0',
  Taper: 'CAT50 Dual Contact',
}

const HYDRAULIC = {
  'Material Number': 'CAT50-HC1.0-3.0',
  taper: 'CAT50',
  contact: 'taper',
  clamping: 'hydraulic',
  style: 'hydraulic-chuck',
  L1_in: '3',
  L1_mm: '',
  'Shank Size': '1.0',
  Taper: 'CAT50',
  CAD_DXF_URL: 'https://d1hdtb64aspgjo.cloudfront.net/…/CAT50-HC.dxf',
}

describe('a cell MariTool measured', () => {
  /**
   * The vendor's own convention, from the scraper's `parseGageLength`: a metric
   * cell is marked, an imperial one is bare. A bare `3.0` read as millimetres is
   * a holder three millimetres long.
   */
  it('takes a marked cell as millimetres and a bare one as inches', () => {
    expect(millimetres('40mm')).toBe(40)
    expect(millimetres('40 MM')).toBe(40)
    expect(millimetres('3.0')).toBe(76.2)
    expect(millimetres('.750')).toBe(19.05)
    expect(millimetres('3/4')).toBe(19.05)
  })

  it('refuses a cell it cannot read rather than taking a number out of it', () => {
    expect(millimetres('.024-.875 inches')).toBeNull()
    expect(millimetres('120mm Tapered')).toBeNull()
    expect(millimetres('')).toBeNull()
    expect(millimetres(undefined)).toBeNull()
  })
})

describe('MariTool holders', () => {
  it('reads a collet chuck’s series and gage length, and gives it no bore', () => {
    const { holders } = holdersFrom([COLLET_CHUCK], context, 'maritool-cat50-holders')

    expect(holders).toHaveLength(1)
    expect(holders[0]).toMatchObject({
      guid: 'guid-CAT50-ER32-3.0D',
      catalogNumber: 'CAT50-ER32-3.0D',
      taper: 'CAT50',
      contact: 'face',
      clamping: 'collet',
      colletSeries: 'ER32',
      gaugeLength: 76.2,
      boreDiameter: null,
      unit: 'millimeters',
    })
  })

  /** A hydraulic chuck grips a plain shank in a bore, which is the catalog's `bore`. */
  it('reads a hydraulic chuck as a bore holder with the shank it takes', () => {
    const { holders } = holdersFrom([HYDRAULIC], context, 'maritool-cat50-holders')

    expect(holders[0]).toMatchObject({ clamping: 'bore', boreDiameter: 25.4, colletSeries: null })
  })

  /** The vendor publishes no `Taper` row for `BT40-ER32-60`, alone in the catalog. */
  it('leaves out a holder whose spindle interface the vendor does not state', () => {
    const { holders, notes } = holdersFrom(
      [{ ...COLLET_CHUCK, taper: '' }],
      context,
      'maritool-bt40-holders',
    )

    expect(holders).toHaveLength(0)
    expect(notes).toEqual([
      { materialNumber: 'CAT50-ER32-3.0D', reason: 'the vendor publishes no taper' },
    ])
  })

  /**
   * `ingest` refuses a bore holder that states no bore, so refusing it here is
   * what keeps a family's ingest from failing on one row.
   */
  it('leaves out a bore holder whose shank size it cannot read, and says so', () => {
    const { holders, notes } = holdersFrom(
      [{ ...HYDRAULIC, 'Shank Size': '' }],
      context,
      'maritool-cat50-holders',
    )

    expect(holders).toHaveLength(0)
    expect(notes).toEqual([
      { materialNumber: 'CAT50-HC1.0-3.0', reason: 'no Shank Size this can read' },
    ])
  })
})
