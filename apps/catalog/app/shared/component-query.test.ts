import { describe, expect, it } from 'vitest'
import type { Holder } from '@toolpath/catalog-data'
import {
  NO_QUERY,
  countTerms,
  filterComponents,
  isEmptyQuery,
  matchesQuery,
  optionsOn,
  setBound,
  termOn,
  toggleTerm,
} from './component-query'

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

const kennametal = holder({})
const regofix = holder({
  guid: 'holder-b',
  brand: 'REGO-FIX',
  vendor: 'REGO-FIX',
  taper: 'CAT40',
  gaugeLength: 90,
  familyId: 'regofix-powrgrip',
})
const rack = [kennametal, regofix]

describe('terms', () => {
  it('narrows to the brand asked for', () => {
    const query = toggleTerm(NO_QUERY, 'brand', 'REGO-FIX')
    expect(filterComponents('holder', rack, query)).toEqual([regofix])
  })

  it('reads several values on one axis as an or', () => {
    const query = toggleTerm(toggleTerm(NO_QUERY, 'taper', 'BT30'), 'taper', 'CAT40')
    expect(filterComponents('holder', rack, query)).toHaveLength(2)
  })

  it('reads two axes as an and', () => {
    const query = toggleTerm(toggleTerm(NO_QUERY, 'taper', 'BT30'), 'brand', 'REGO-FIX')
    expect(filterComponents('holder', rack, query)).toEqual([])
  })

  it('takes a value off when it is picked again', () => {
    const on = toggleTerm(NO_QUERY, 'brand', 'REGO-FIX')
    expect(isEmptyQuery(toggleTerm(on, 'brand', 'REGO-FIX'))).toBe(true)
  })

  it('answers the family axis with the words the filter offered', () => {
    expect(termOn('holder', regofix, 'familyId')).toBe('Regofix Powrgrip')
  })

  it('refuses a holder that states nothing on a constrained axis', () => {
    const shrink = holder({ guid: 'holder-c', clamping: 'shrink', colletSeries: null })
    const query = toggleTerm(NO_QUERY, 'colletSeries', 'ER16')
    expect(matchesQuery('holder', shrink, query)).toBe(false)
  })
})

describe('bounds', () => {
  it('narrows on a number', () => {
    const query = setBound(NO_QUERY, 'gaugeLength', { max: 70 })
    expect(filterComponents('holder', rack, query)).toEqual([kennametal])
  })

  it('refuses a holder that states no such number', () => {
    const vague = holder({ guid: 'holder-d', gaugeLength: null })
    expect(matchesQuery('holder', vague, setBound(NO_QUERY, 'gaugeLength', { max: 70 }))).toBe(
      false,
    )
  })

  it('clears a bound set back to nothing', () => {
    const set = setBound(NO_QUERY, 'gaugeLength', { max: 70 })
    expect(isEmptyQuery(setBound(set, 'gaugeLength', undefined))).toBe(true)
  })

  it('counts what is narrowed, for the badge', () => {
    const query = setBound(toggleTerm(NO_QUERY, 'brand', 'REGO-FIX'), 'gaugeLength', { max: 70 })
    expect(countTerms(query)).toBe(2)
  })
})

describe('what a filter offers', () => {
  it('offers the values that are there, with counts', () => {
    expect(optionsOn('holder', rack, 'taper')).toEqual([
      { value: 'BT30', count: 1 },
      { value: 'CAT40', count: 1 },
    ])
  })

  it('offers nothing for an axis nothing states', () => {
    expect(optionsOn('holder', rack, 'nonsense')).toEqual([])
  })
})
