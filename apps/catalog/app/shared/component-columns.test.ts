import { describe, expect, it } from 'vitest'
import type { Collet, Holder } from '@toolpath/catalog-data'
import {
  COLLET_COLUMNS,
  HOLDER_COLUMNS,
  colletTypeLabel,
  colletValue,
  familyLabel,
  formatValue,
  hiddenByDefault,
  holderTypeLabel,
  holderValue,
  valuesOn,
} from './component-columns'

const holder = (over: Partial<Holder>): Holder =>
  ({
    guid: 'holder-a',
    familyId: 'regofix-powrgrip-chucks',
    brand: 'REGO-FIX',
    vendor: 'REGO-FIX',
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

describe('what a holder is called', () => {
  it('says the taper, the series and how it grips', () => {
    expect(holderTypeLabel(holder({}))).toBe('BT30 ER16 collet chuck')
  })

  it('leaves the series off a holder that grips the shank itself', () => {
    expect(holderTypeLabel(holder({ clamping: 'shrink', colletSeries: null }))).toBe(
      'BT30 shrink fit',
    )
  })

  it('names a collet by its series', () => {
    expect(colletTypeLabel({ series: 'ER20' } as Collet)).toBe('ER20 collet')
  })

  /** No family record exists for toolholding, so the id is read as words. */
  it('reads a family id as words rather than inventing a name', () => {
    expect(familyLabel('regofix-powrgrip-chucks')).toBe('Regofix Powrgrip Chucks')
  })
})

describe('reading a value', () => {
  it('reads a number off the record', () => {
    expect(holderValue(holder({}), 'gaugeLength')).toBe(60)
  })

  it('reads how it grips in the words a shop uses', () => {
    expect(holderValue(holder({}), 'clamping')).toBe('collet chuck')
  })

  it('answers nothing for a code the record has no field for', () => {
    expect(holderValue(holder({}), 'nonsense')).toBeNull()
  })

  it('reads a collet grip range', () => {
    expect(colletValue({ clampMin: 5, clampMax: 6 } as Collet, 'clampMin')).toBe(5)
  })

  /** An absent number is not a zero: a holder with no stated body has no body diameter. */
  it('draws what nobody stated as an em dash', () => {
    expect(formatValue(null, 'length', 'millimeters')).toBe('—')
  })

  it('converts a length into the unit being worked in', () => {
    expect(formatValue(25.4, 'length', 'inches')).toContain('1.0')
  })

  it('leaves a word alone in any unit', () => {
    expect(formatValue('BT30', 'text', 'inches')).toBe('BT30')
  })
})

describe('columns', () => {
  it('hides the ones that are read only when something does not clear', () => {
    expect(hiddenByDefault(HOLDER_COLUMNS)).toContain('flangeDiameter')
    expect(hiddenByDefault(HOLDER_COLUMNS)).not.toContain('gaugeLength')
  })

  it('shows every collet column by default — there are four of them', () => {
    expect(hiddenByDefault(COLLET_COLUMNS)).toEqual([])
  })

  it('offers the values that are there, sorted, and no blank', () => {
    const rack = [holder({}), holder({ guid: 'b', taper: 'CAT40' }), holder({ guid: 'c' })]
    expect(valuesOn('holder', rack, 'taper')).toEqual(['BT30', 'CAT40'])
  })
})
