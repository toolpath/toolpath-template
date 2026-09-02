import { describe, expect, it } from 'vitest'
import {
  colletsFor,
  colletsForShank,
  compareHolders,
  holderFacet,
  holderCanTake,
  holdersFor,
  holdersToShow,
  isOnSize,
  matchesFilters,
  seriesSize,
  seriesUnstocked,
} from './assembly-picking.js'
import {
  emptyBuildSelection,
  fromBuildParams,
  holderFiltersFrom,
  selectHolder,
  toBuildParams,
  toggleBuildTerm,
  writeBuildParams,
} from './assembly-selection.js'
import type { Collet, Holder } from './toolholding.js'
import type { CatalogTool } from './types.js'

const tool = (shank = 6): CatalogTool => ({
  guid: 't',
  familyId: 'f',
  brand: 'WIDIA',
  vendor: 'Kennametal',
  catalogNumber: 'TDMX0600',
  materialNumber: null,
  toolType: 'endmill',
  form: 'flat end mill',
  unitSystem: 'metric',
  geometry: { DC: shank, LCF: 13, OAL: 57, SFDM: shank, LBH: 19 },
  materialGroups: ['P'],
  productLine: null,
  productLink: null,
  provenance: {},
})

const holder = (over: Partial<Holder> & Pick<Holder, 'guid' | 'catalogNumber'>): Holder => ({
  familyId: 'bt30',
  brand: 'REGO-FIX',
  vendor: 'REGO-FIX',
  materialNumber: null,
  taper: 'BT30',
  contact: 'taper',
  clamping: 'collet',
  gaugeLength: 98.4,
  colletSeries: 'PG6',
  boreDiameter: null,
  noseDiameter: 10,
  noseLength: null,
  bodyDiameter: null,
  bodyLength: null,
  projection: null,
  flangeDiameter: null,
  colletProtrusion: null,
  productLink: null,
  cadModelUrl: null,
  provenance: {},
  ...over,
})

const collet = (over: Partial<Collet> & Pick<Collet, 'guid' | 'catalogNumber'>): Collet => ({
  familyId: 'pg6',
  brand: 'REGO-FIX',
  vendor: 'REGO-FIX',
  materialNumber: null,
  series: 'PG6',
  clampMin: 6,
  clampMax: 6,
  clampLength: null,
  productLink: null,
  provenance: {},
  ...over,
})

/** A crib: three PG 6 chucks of three lengths, a PG 10 chuck, a face-contact PG 6, and a shrink-fit bore. */
const pg6Long = holder({
  guid: 'h-pg6-long',
  catalogNumber: 'BT 30 / PG 6 x 080 H',
  gaugeLength: 128.4,
})
const pg6Short = holder({ guid: 'h-pg6', catalogNumber: 'BT 30 / PG 6 x 050' })
const pg6Face = holder({
  guid: 'h-pg6-plus',
  catalogNumber: 'BT+ 30 / PG 6 x 080 H',
  contact: 'face',
  gaugeLength: 128.4,
})
const pg10 = holder({
  guid: 'h-pg10',
  catalogNumber: 'BT 30 / PG 10 x 062',
  colletSeries: 'PG10',
  noseDiameter: 16,
  gaugeLength: 110.4,
})
const shrink = holder({
  guid: 'h-shrink',
  catalogNumber: 'BT30SF0600M',
  clamping: 'shrink',
  colletSeries: null,
  boreDiameter: 6,
  gaugeLength: 80,
})
const HOLDERS = [pg10, pg6Long, shrink, pg6Face, pg6Short]

const pg6Six = collet({ guid: 'c-pg6-6', catalogNumber: 'PG 6 Ø 6.0 mm' })
const pg6SixMql = collet({
  guid: 'c-pg6-6-mql',
  catalogNumber: 'PG 6-MQL Ø 6.0 mm',
  familyId: 'pg6-mql',
})
const pg6Four = collet({
  guid: 'c-pg6-4',
  catalogNumber: 'PG 6 Ø 4.0 mm',
  clampMin: 4,
  clampMax: 4,
})
const pg10Six = collet({ guid: 'c-pg10-6', catalogNumber: 'PG 10 Ø 6.0 mm', series: 'PG10' })
const er16 = collet({
  guid: 'c-er16',
  catalogNumber: 'ER16-6',
  series: 'ER16',
  clampMin: 5,
  clampMax: 6,
  clampLength: 18,
})
const COLLETS = [pg6Four, pg10Six, pg6SixMql, er16, pg6Six]

describe('which holders will take a tool', () => {
  it('offers every holder that can hold the shank, least overhang first, and says which is first', () => {
    const found = holdersFor(tool(6), HOLDERS, COLLETS)

    // Smallest series first (the shrink-fit bore sorts with it), then shortest gauge.
    expect(found.map((each) => each.guid)).toEqual([
      'h-shrink',
      'h-pg6',
      'h-pg6-long',
      'h-pg6-plus',
      'h-pg10',
    ])
  })

  /** A PG 6 chuck for a 10 mm shank would only fail at the collet step; it is not offered. */
  it('offers a collet chuck only when a collet of its series closes on the shank', () => {
    expect(holdersFor(tool(10), HOLDERS, COLLETS).map((each) => each.guid)).toEqual([])
    expect(holdersFor(tool(4), HOLDERS, COLLETS).map((each) => each.guid)).toEqual([
      'h-pg6',
      'h-pg6-long',
      'h-pg6-plus',
    ])
  })

  /**
   * The collets are grouped by series once and the grouping is cached against
   * the array — so a second list must not be answered out of the first's index.
   * The failure a cache introduces, pinned before it can happen.
   */
  it('answers each collet list from its own collets', () => {
    const onlyPg10 = COLLETS.filter((each) => each.series === 'PG10')

    expect(holdersFor(tool(4), HOLDERS, onlyPg10)).toEqual([])
    expect(holdersFor(tool(4), HOLDERS, COLLETS).map((each) => each.guid)).toEqual([
      'h-pg6',
      'h-pg6-long',
      'h-pg6-plus',
    ])
  })

  it('narrows by the filter axes, AND across them', () => {
    expect(
      holdersFor(tool(6), HOLDERS, COLLETS, { contact: ['face'] }).map((each) => each.guid),
    ).toEqual(['h-pg6-plus'])
    expect(
      holdersFor(tool(6), HOLDERS, COLLETS, { colletSeries: ['PG6'], contact: ['taper'] }).map(
        (each) => each.guid,
      ),
    ).toEqual(['h-pg6', 'h-pg6-long'])
  })

  /** A series filter must not match a shrink-fit chuck, which has no series. */
  it('never matches a holder that has no value on a constrained axis', () => {
    expect(matchesFilters(shrink, { colletSeries: ['PG6'] })).toBe(false)
    expect(matchesFilters(shrink, {})).toBe(true)
  })

  it('reads a series size off its name', () => {
    expect(seriesSize('PG6')).toBe(6)
    expect(seriesSize('ER32')).toBe(32)
    expect(seriesSize(null)).toBeNull()
    expect(compareHolders(pg6Short, pg10)).toBeLessThan(0)
  })
})

describe('which collets go in a holder', () => {
  it('lists the series that closes on the shank, on-size first, and none for a bore', () => {
    const found = colletsFor(tool(6), pg6Short, COLLETS)

    expect(found.map((each) => each.guid)).toEqual(['c-pg6-6', 'c-pg6-6-mql'])
    expect(found.every((each) => isOnSize(each, 6))).toBe(true)
    expect(colletsFor(tool(6), shrink, COLLETS)).toEqual([])
  })

  it('ranks closest to on-size first where a collet closes over a range', () => {
    const chuck = holder({ guid: 'h-er16', catalogNumber: 'ER16 chuck', colletSeries: 'ER16' })
    const wide = collet({
      guid: 'c-er16-wide',
      catalogNumber: 'ER16-7',
      series: 'ER16',
      clampMin: 6,
      clampMax: 7,
    })

    expect(colletsFor(tool(6), chuck, [wide, er16]).map((each) => each.guid)).toEqual([
      'c-er16',
      'c-er16-wide',
    ])
    expect(isOnSize(wide, 6)).toBe(false)
  })
})

/**
 * **The other order** (Paul, 2026-09-01: "I should be able to select a collet
 * without selecting a holder… every collet that grips the tool's shank"). The
 * holder-first list needs a series to narrow by; this one has no holder yet, so
 * every series is in play and the shank is the whole question.
 */
describe('which collets grip a shank, before any holder is chosen', () => {
  it('offers every series that closes on it, closest to on-size first', () => {
    const found = colletsForShank(tool(6), COLLETS)

    expect(found.map((each) => each.guid)).toEqual(['c-er16', 'c-pg6-6', 'c-pg6-6-mql', 'c-pg10-6'])
    expect(found.every((each) => each.clampMax >= 6 && each.clampMin <= 6)).toBe(true)
  })

  it('offers none for a shank nothing closes on, or a tool that states none', () => {
    expect(colletsForShank(tool(25), COLLETS)).toEqual([])
    expect(colletsForShank({ ...tool(6), geometry: {} }, COLLETS)).toEqual([])
  })
})

describe('the chips: what each value would return', () => {
  it('counts each value alone against the rest of the filters, from a vocabulary that stays put', () => {
    const facet = holderFacet(HOLDERS, { contact: ['face'] }, 'colletSeries')

    expect(facet).toEqual([
      { value: 'PG10', count: 0 },
      { value: 'PG6', count: 1 },
    ])
  })

  /**
   * Clicking a bore style drops the series, so a bore chuck counts as what it
   * really returns; a collet style keeps it, so only the PG 6 chucks count.
   */
  it('counts through the interpretation, so a locked axis cannot hide the bore chucks', () => {
    const facet = holderFacet(HOLDERS, { colletSeries: ['PG6'] }, 'clamping')

    expect(facet).toEqual([
      { value: 'collet', count: 3 },
      { value: 'shrink', count: 1 },
    ])
  })
})

describe('a selection and its URL', () => {
  it('round-trips through a query string, leaving other params alone', () => {
    const selection = {
      ...emptyBuildSelection(),
      holder: 'h-pg6',
      collet: 'c-pg6-6',
      stickout: 30,
      contact: ['face' as const],
      colletSeries: ['PG6'],
    }
    const params = writeBuildParams(new URLSearchParams('job=job-1&holder=stale'), selection)

    expect(params.get('job')).toBe('job-1')
    expect(fromBuildParams(params)).toEqual(selection)
    expect(toBuildParams(emptyBuildSelection()).toString()).toBe('')
  })

  it('drops a mode a hand-edited URL invents, and keeps an open vendor string', () => {
    const parsed = fromBuildParams(
      new URLSearchParams('clamping=magnet&contact=face&series=PG99&stickout=-3'),
    )

    expect(parsed.clamping).toEqual([])
    expect(parsed.contact).toEqual(['face'])
    expect(parsed.colletSeries).toEqual(['PG99'])
    expect(parsed.stickout).toBeNull()
  })

  it('namespaces one page’s two assemblies by prefix', () => {
    const params = writeBuildParams(
      new URLSearchParams('holder=tap'),
      { ...emptyBuildSelection(), holder: 'drill' },
      'drill',
    )

    expect(params.get('holder')).toBe('tap')
    expect(params.get('drill-holder')).toBe('drill')
  })

  /** A selection that survived its own filter being narrowed away would show a holder not in the list beneath it. */
  it('clears the holder and collet when a filter changes, and the series when it is locked out', () => {
    const chosen = {
      ...emptyBuildSelection(),
      holder: 'h-pg6',
      collet: 'c-pg6-6',
      colletSeries: ['PG6'],
    }

    const filtered = toggleBuildTerm(chosen, 'contact', 'face')
    expect(filtered.holder).toBeNull()
    expect(filtered.collet).toBeNull()
    expect(filtered.colletSeries).toEqual(['PG6'])

    const bored = toggleBuildTerm(chosen, 'clamping', 'shrink')
    expect(bored.colletSeries).toEqual([])
    expect(holderFiltersFrom({ ...chosen, clamping: ['shrink'] }).colletSeries).toEqual([])
  })

  it('clears the collet when the holder changes: a collet belongs to a series', () => {
    expect(
      selectHolder({ ...emptyBuildSelection(), collet: 'c-pg6-6' }, 'h-pg10').collet,
    ).toBeNull()
  })
})

describe('holders the crib stocks no collet for', () => {
  const chuck = holder({
    guid: 'h-chuck',
    catalogNumber: 'CAT40-ER32-3.0',
    clamping: 'collet',
    colletSeries: 'ER32',
    boreDiameter: null,
  })
  const bore = holder({
    guid: 'h-bore',
    catalogNumber: 'CAT40-SF.250',
    clamping: 'shrink',
    colletSeries: null,
    boreDiameter: 6,
  })

  it('tells an unstocked series from a series that simply does not fit', () => {
    // Two different answers: nobody has bought an ER32 collet, versus the crib
    // has them and none closes on this shank. The first is a purchasing
    // problem and the second is a sizing one.
    const wrongSize = collet({ guid: 'c-1', catalogNumber: 'ER32-20', series: 'ER32' })

    expect(seriesUnstocked(chuck, [])).toBe(true)
    expect(seriesUnstocked(chuck, [wrongSize])).toBe(false)
    expect(seriesUnstocked(bore, [])).toBe(false)
  })

  it('shows them apart from the holders that can hold the tool', () => {
    const shown = holdersToShow(tool(6), [chuck, bore], [])

    expect(shown.holding).toEqual([bore])
    expect(shown.unstocked).toEqual([chuck])
  })

  it('never moves a holder into the list that says it holds the tool', () => {
    const shown = holdersToShow(tool(6), [chuck, bore], [])

    for (const each of shown.unstocked) {
      expect(holderCanTake(tool(6), each, [])).toBe(false)
    }
  })
})
