import { describe, expect, it } from 'vitest'
import type { CatalogTool } from '@toolpath/catalog-data'
import { formatGeometry, geometryRows, toolHeadline } from './geometry'

const tool: CatalogTool = {
  guid: 'a',
  familyId: 'vhm-endmills',
  brand: 'WIDIA',
  vendor: 'Kennametal',
  catalogNumber: 'TDMX0500',
  materialNumber: '6694846',
  toolType: 'endmill',
  form: 'flat end mill',
  unitSystem: 'metric',
  geometry: { DC: 12.7, NOF: 4, SIG: 140, ZEFP: 2 },
  materialGroups: ['P'],
  productLink: null,
  provenance: { DC: 'vendor-stated', ZEFP: 'assumed' },
}

describe('formatGeometry', () => {
  it('converts a length into the unit being read in', () => {
    expect(formatGeometry('DC', 12.7, 'in')).toBe('0.500 in')
    expect(formatGeometry('DC', 12.7, 'mm')).toBe('12.70 mm')
  })

  /** Four flutes are four flutes in every unit system. */
  it('never converts a count', () => {
    expect(formatGeometry('NOF', 4, 'in')).toBe('4')
  })

  it('never converts an angle', () => {
    expect(formatGeometry('SIG', 140, 'in')).toBe('140.0°')
  })

  it('falls back to a length for a code it does not know', () => {
    expect(formatGeometry('ZEFP', 25.4, 'in')).toBe('1.000 in')
  })
})

describe('geometryRows', () => {
  it('labels and explains the codes the catalog defines', () => {
    const rows = geometryRows(tool, 'mm')
    const diameter = rows.find((row) => row.code === 'DC')

    expect(diameter?.label).toBe('Cutting diameter')
    expect(diameter?.value).toBe('12.70 mm')
    expect(diameter?.description).not.toBeNull()
    expect(diameter?.provenance).toBe('vendor-stated')
  })

  /**
   * Shown, because the vendor published it; unlabelled, because nobody in this
   * repository has checked what it means.
   */
  it('shows an undefined code under the vendor’s own name and invents no label', () => {
    const rows = geometryRows(tool, 'mm')
    const unknown = rows.find((row) => row.code === 'ZEFP')

    expect(unknown?.label).toBe('ZEFP')
    expect(unknown?.description).toBeNull()
  })

  it('puts the codes it can explain first', () => {
    expect(geometryRows(tool, 'mm').at(-1)?.code).toBe('ZEFP')
  })
})

describe('toolHeadline', () => {
  it('names a tool by what a shop orders and the size it is', () => {
    expect(toolHeadline(tool, 'mm')).toBe('TDMX0500 · ⌀12.70 mm')
  })

  it('falls back to the catalog number when no diameter is stated', () => {
    expect(toolHeadline({ ...tool, geometry: {} }, 'mm')).toBe('TDMX0500')
  })
})

describe('a ratio', () => {
  /** "2.6 diameters" is the same in every unit system, and is not a length. */
  it('is a bare figure whichever unit is being read in', () => {
    expect(formatGeometry('LD', 2.6, 'in')).toBe('2.6')
    expect(formatGeometry('LD', 2.6, 'mm')).toBe('2.6')
  })
})
