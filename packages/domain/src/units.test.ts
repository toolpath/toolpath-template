import { describe, expect, it } from 'vitest'
import {
  convertArea,
  convertLength,
  formatArea,
  formatLength,
  loadUnit,
  saveUnit,
} from './units.js'

describe('converting', () => {
  it('reads Toolpath’s millimetres as inches', () => {
    expect(convertLength(25.4, 'mm', 'in')).toBeCloseTo(1, 12)
    expect(convertLength(1, 'in', 'mm')).toBeCloseTo(25.4, 12)
  })

  it('squares the conversion for an area', () => {
    // 1 in² is 645.16 mm², not 25.4 — the mistake this exists to stop.
    expect(convertArea(645.16, 'mm', 'in')).toBeCloseTo(1, 9)
  })

  it('leaves a value alone when the units match', () => {
    expect(convertLength(8.89, 'mm', 'mm')).toBe(8.89)
  })
})

describe('formatting', () => {
  /**
   * A thousandth of an inch and a hundredth of a millimetre are about the same
   * distance, so each unit gets the precision a machinist reads rather than a
   * fixed number of decimals that is noise in one and useless in the other.
   */
  it('gives each unit the precision it is read at', () => {
    expect(formatLength(8.89, 'in')).toBe('0.350 in')
    expect(formatLength(8.89, 'mm')).toBe('8.89 mm')
  })

  it('names an area as an area', () => {
    expect(formatArea(806.45, 'in')).toBe('1.250 in²')
    expect(formatArea(806.45, 'mm')).toBe('806.45 mm²')
  })
})

describe('remembering the unit', () => {
  it('round-trips, and defaults to the unit the report is in', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    }

    expect(loadUnit(storage, 'app.unit')).toBe('mm')
    saveUnit(storage, 'app.unit', 'in')
    expect(loadUnit(storage, 'app.unit')).toBe('in')
  })

  it('survives having no storage', () => {
    expect(loadUnit(null, 'app.unit')).toBe('mm')
    expect(() => saveUnit(null, 'app.unit', 'in')).not.toThrow()
  })
})

describe('keying the stored preference', () => {
  /**
   * Two applications on one origin must be able to hold different units, so
   * the key is the caller's rather than this module's.
   */
  it('keeps one application’s unit out of another’s', () => {
    const store = new Map<string, string>()
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    }

    saveUnit(storage, 'dfm.unit', 'in')

    expect(loadUnit(storage, 'dfm.unit')).toBe('in')
    expect(loadUnit(storage, 'catalog.unit')).toBe('mm')
  })
})
