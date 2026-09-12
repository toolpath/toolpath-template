import { describe, expect, it } from 'vitest'
import type { CatalogTool, Collet, Holder } from '@toolpath/catalog-data'
import {
  NOTHING_CHOSEN,
  colletGap,
  colletGapFor,
  colletNotNeeded,
  holderTakesCollet,
  holdersToOffer,
  narrowCollets,
  narrowHolders,
  narrowTools,
  byShank,
  gripsAny,
  takesAny,
  whyEmpty,
} from './assembly-narrowing'

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
const er20 = collet({
  guid: 'collet-b',
  catalogNumber: 'ER20-10',
  series: 'ER20',
  clampMin: 9,
  clampMax: 10,
})
const er16Chuck = holder({})
const er20Chuck = holder({ guid: 'holder-b', catalogNumber: 'BT30ER20', colletSeries: 'ER20' })
/** A chuck of a series the crib stocks nothing of at all. */
const er11Chuck = holder({ guid: 'holder-c', catalogNumber: 'BT30ER11', colletSeries: 'ER11' })
const collets = [er16, er20]

describe('a holder and a collet going together', () => {
  it('takes a collet of its own series', () => {
    expect(holderTakesCollet(er16Chuck, er16)).toBe(true)
  })

  it('refuses another series — an ER16 collet does not go in an ER20 nose', () => {
    expect(holderTakesCollet(er16Chuck, er20)).toBe(false)
  })

  it('refuses any collet on a holder that grips the shank itself', () => {
    const shrink = holder({ clamping: 'shrink', colletSeries: null, boreDiameter: 6 })
    expect(holderTakesCollet(shrink, er16)).toBe(false)
  })
})

describe('a holder chosen first', () => {
  it('leaves only the collets of its series', () => {
    expect(narrowCollets(collets, { tool: null, holder: er16Chuck })).toEqual([er16])
  })

  /**
   * **The tools the chuck could take, not the ones the crib can close on
   * today** — the other half of offering a holder with no collet behind it. A
   * chuck offered for want of an ER16-10 must offer the 10 mm cutters it would
   * take once one is bought, or clicking it empties the list under it.
   */
  it('leaves the tools its series could take, collet or no collet', () => {
    const shown = narrowTools(
      [tool('small', 6), tool('big', 10)],
      { holder: er16Chuck, collet: null },
      collets,
    )
    expect(shown.map((each) => each.guid)).toEqual(['small', 'big'])
  })

  it('still refuses a tool the series could never close on', () => {
    const shown = narrowTools(
      [tool('small', 6), tool('huge', 16)],
      { holder: er11Chuck, collet: null },
      collets,
    )
    expect(shown.map((each) => each.guid)).toEqual(['small'])
  })

  it('is strict again once a collet is chosen', () => {
    const shown = narrowTools(
      [tool('small', 6), tool('big', 10)],
      { holder: er16Chuck, collet: er16 },
      collets,
    )
    expect(shown.map((each) => each.guid)).toEqual(['small'])
  })
})

describe('a collet chosen first', () => {
  it('leaves only the holders of its series', () => {
    const shown = narrowHolders([er16Chuck, er20Chuck], { tool: null, collet: er20 }, collets)
    expect(shown.map((each) => each.guid)).toEqual(['holder-b'])
  })

  it('leaves only the tools whose shank it closes on', () => {
    const shown = narrowTools(
      [tool('small', 6), tool('big', 10)],
      { holder: null, collet: er20 },
      collets,
    )
    expect(shown.map((each) => each.guid)).toEqual(['big'])
  })
})

describe('a tool chosen first', () => {
  /**
   * Paul, 2026-09-09: "we should show any holder, even if there is not a collet
   * in the library that works". The ER20 chuck holds a 6 mm shank all day with
   * an ER20-6 in it; the crib not stocking one is a purchase order, not a fit.
   */
  it('leaves every holder whose series could take it', () => {
    const shown = narrowHolders(
      [er16Chuck, er20Chuck],
      { tool: tool('small', 6), collet: null },
      collets,
    )
    expect(shown.map((each) => each.guid)).toEqual(['holder-a', 'holder-b'])
  })

  it('still leaves out a chuck too small for its shank', () => {
    const shown = narrowHolders(
      [er16Chuck, er11Chuck],
      { tool: tool('huge', 16), collet: null },
      collets,
    )
    expect(shown.map((each) => each.guid)).toEqual(['holder-a'])
  })

  it('leaves only the collets that close on its shank, whatever series', () => {
    expect(narrowCollets(collets, { tool: tool('big', 10), holder: null })).toEqual([er20])
  })
})

describe('nothing chosen', () => {
  it('shows every holder in the rack rather than none', () => {
    expect(narrowHolders([er16Chuck, er20Chuck], NOTHING_CHOSEN, collets)).toHaveLength(2)
  })

  it('shows every tool', () => {
    const all = [tool('small', 6), tool('big', 10)]
    expect(narrowTools(all, NOTHING_CHOSEN, collets)).toEqual(all)
  })

  it('still honours the filters on a holder list', () => {
    const shown = narrowHolders([er16Chuck, er20Chuck], NOTHING_CHOSEN, collets, {
      colletSeries: ['ER20'],
    })
    expect(shown.map((each) => each.guid)).toEqual(['holder-b'])
  })
})

describe('the tools a feature admits, with no tool picked yet', () => {
  const small = tool('small', 6)
  const big = tool('big', 10)

  it('offers a holder that takes one of them', () => {
    expect(takesAny(er16Chuck, [small, big], collets)).toBe(true)
  })

  it('offers a holder no stocked collet closes on, where the series could', () => {
    expect(takesAny(er20Chuck, [small], collets)).toBe(true)
  })

  it('refuses a holder whose series is too small for any of them', () => {
    expect(takesAny(er11Chuck, [tool('huge', 16)], collets)).toBe(false)
  })

  it('leaves the holders that could take one of them', () => {
    const shown = narrowHolders([er16Chuck, er20Chuck], NOTHING_CHOSEN, collets, {}, [small])
    expect(shown.map((each) => each.guid)).toEqual(['holder-a', 'holder-b'])
  })

  /**
   * The feature's tools narrow the rack; they never override a pick. A holder
   * chosen for a tool the geometry does not admit is somebody's decision.
   */
  it('lets the chosen tool win over the set', () => {
    const shown = narrowHolders(
      [er11Chuck, er20Chuck],
      { tool: tool('huge', 16), collet: null },
      collets,
      {},
      [small],
    )
    expect(shown.map((each) => each.guid)).toEqual(['holder-b'])
  })

  it('asks the chosen collet and the set together', () => {
    const shown = narrowHolders([er16Chuck, er20Chuck], { tool: null, collet: er20 }, collets, {}, [
      small,
    ])
    expect(shown).toEqual([])
  })

  /** No feature is being asked, so there is no set to be compatible with. */
  it('shows every holder in the rack when the set is null', () => {
    expect(narrowHolders([er16Chuck, er20Chuck], NOTHING_CHOSEN, collets, {}, null)).toHaveLength(2)
  })

  it('offers a collet that closes on one of them', () => {
    expect(gripsAny(er16, [small, big])).toBe(true)
  })

  it('refuses a collet that closes on none of them', () => {
    expect(gripsAny(er20, [small])).toBe(false)
  })

  it('leaves only the collets that close on one of them', () => {
    expect(narrowCollets(collets, NOTHING_CHOSEN, [small])).toEqual([er16])
  })

  it('lets the chosen tool win over the set on a collet list too', () => {
    expect(narrowCollets(collets, { tool: big, holder: null }, [small])).toEqual([er20])
  })

  it('shows every collet in the crib when the set is null', () => {
    expect(narrowCollets(collets, NOTHING_CHOSEN, null)).toEqual(collets)
  })

  /** A shank nobody stated grips nothing, rather than everything. */
  it('refuses a tool whose shank the vendor never stated', () => {
    const bare = { guid: 'bare', geometry: {} } as unknown as CatalogTool
    expect(gripsAny(er16, [bare])).toBe(false)
    expect(takesAny(er16Chuck, [bare], collets)).toBe(false)
  })

  it("says an empty list is the feature's doing rather than an empty catalog", () => {
    expect(whyEmpty(0, NOTHING_CHOSEN, {}, true)).toBe(
      'Nothing here takes any of the tools that fit this feature.',
    )
    expect(whyEmpty(0, NOTHING_CHOSEN)).toBe('Nothing in the catalog to show here.')
  })
})

describe('which holders are offered', () => {
  const nothing = { tool: null, collet: null }

  it('offers only the ones with a shape to draw', () => {
    const offered = holdersToOffer(
      [er16Chuck, er20Chuck],
      nothing,
      collets,
      {},
      (holder) => holder.guid === 'holder-a',
    )
    expect(offered.shown.map((each) => each.guid)).toEqual(['holder-a'])
  })

  /** The count is the whole point: a filtered-empty list is not a nothing-fits list. */
  it('counts what having no shape kept back', () => {
    const offered = holdersToOffer([er16Chuck, er20Chuck], nothing, collets, {}, () => false)
    expect(offered.shown).toEqual([])
    expect(offered.hidden).toBe(2)
  })

  it('counts nothing where every holder can be drawn', () => {
    expect(holdersToOffer([er16Chuck, er20Chuck], nothing, collets, {}, () => true).hidden).toBe(0)
  })

  it("offers only the holders that could take one of the feature's tools", () => {
    const offered = holdersToOffer([er16Chuck, er11Chuck], nothing, collets, {}, () => true, [
      tool('huge', 16),
    ])
    expect(offered.shown.map((each) => each.guid)).toEqual(['holder-a'])
    // The ER11 chuck fits nothing here, so its shape never came into it.
    expect(offered.hidden).toBe(0)
  })

  /**
   * The shape rule applies after the fit, not before it: a holder that cannot
   * hold the tool was never offered, so it is not something the drawing hid.
   */
  it('does not count a holder that did not fit in the first place', () => {
    const offered = holdersToOffer(
      [er16Chuck, er11Chuck],
      { tool: tool('huge', 16), collet: null },
      collets,
      {},
      () => true,
    )
    expect(offered.shown.map((each) => each.guid)).toEqual(['holder-a'])
    expect(offered.hidden).toBe(0)
  })
})

describe('why an offered holder cannot be built out of the crib', () => {
  const small = tool('small', 6)

  it('says nothing about a chuck the crib closes on', () => {
    expect(colletGap(small, er16Chuck, collets)).toBeNull()
  })

  it('says nothing about a holder that grips the shank itself', () => {
    const shrink = holder({ clamping: 'shrink', colletSeries: null, boreDiameter: 6 })
    expect(colletGap(small, shrink, collets)).toBeNull()
  })

  it('names a series the crib stocks none of', () => {
    expect(colletGap(small, er11Chuck, collets)).toBe('the crib stocks no ER11 collet')
  })

  /** Two gaps, two things to do about it: buy the drawer, or buy one collet. */
  it('separates a stocked series with no size that closes', () => {
    expect(colletGap(small, er20Chuck, collets)).toBe(
      'no ER20 collet in the crib closes on this shank',
    )
  })

  it('is silent over a set where any one of them is gripped', () => {
    expect(colletGapFor(er20Chuck, [small, tool('big', 10)], collets)).toBeNull()
  })

  it('speaks of the shanks rather than the shank over a set', () => {
    expect(colletGapFor(er20Chuck, [small, tool('other', 7)], collets)).toBe(
      'no ER20 collet in the crib closes on any of these shanks',
    )
  })

  /** With no feature there are no shanks, so only the stocking gap is left. */
  it('reports an unstocked series with no tools to ask about', () => {
    expect(colletGapFor(er11Chuck, null, collets)).toBe('the crib stocks no ER11 collet')
    expect(colletGapFor(er20Chuck, null, collets)).toBeNull()
  })

  it('puts the gap over the choices when a collet list comes back empty', () => {
    expect(
      whyEmpty(0, { tool: null, holder: er11Chuck, collet: null }, {}, true, {
        gap: 'the crib stocks no ER11 collet',
      }),
    ).toBe(
      'No collet fits this holder: the crib stocks no ER11 collet. Order the holder on its own, or choose another.',
    )
  })

  /**
   * **A holder that grips the shank is not an empty list to fix** (Paul,
   * 2026-09-11). Before this sentence, opening the collet slot under a shrink
   * fit fell through to the choices and read "Nothing fits alongside
   * BT30SF12060M. Clear one of them to widen the list" — a dead end, and an
   * instruction to undo a holder that is working as intended.
   */
  it('says a shrink fit holder needs no collet at all', () => {
    const shrink = holder({ clamping: 'shrink', colletSeries: null, boreDiameter: 12 })
    expect(colletNotNeeded(shrink)).toBe('No collet required for a shrink fit holder.')
  })

  /** The kind is named the way the Type column names it, with its own article. */
  it('names the other holders that grip the shank', () => {
    expect(colletNotNeeded(holder({ clamping: 'bore', colletSeries: null }))).toBe(
      'No collet required for an end mill holder.',
    )
    expect(colletNotNeeded(holder({ clamping: 'hydraulic', colletSeries: null }))).toBe(
      'No collet required for a hydraulic chuck.',
    )
  })

  it('says nothing about a chuck that does take one', () => {
    expect(colletNotNeeded(er16Chuck)).toBeNull()
  })

  /**
   * Over the gap as well as over the choices: a holder taking no collet is not
   * an emptiness to do something about, and the gap is null for one anyway.
   */
  it('puts it over everything else when the collet list comes back empty', () => {
    const shrink = holder({ clamping: 'shrink', colletSeries: null, boreDiameter: 12 })
    expect(
      whyEmpty(0, { tool: small, holder: shrink, collet: null }, {}, true, {
        gap: null,
        noneNeeded: colletNotNeeded(shrink),
      }),
    ).toBe('No collet required for a shrink fit holder.')
  })

  /**
   * **The narrower rack is the one the page opens on** (Paul, 2026-09-10: "by
   * default, the holders with no collet should be hidden"), which makes its
   * empty list the case the whole rule exists for: nothing fits and something
   * was hidden read the same on screen and mean opposite things.
   */
  it('says what the press is keeping off an empty rack', () => {
    expect(whyEmpty(0, NOTHING_CHOSEN, {}, true, { hidden: 4 })).toBe(
      'Nothing here can be built out of the crib as it stands. 4 holders could take it with a collet you do not stock — the press above shows them.',
    )
  })

  it('counts one holder as one', () => {
    expect(whyEmpty(0, NOTHING_CHOSEN, {}, true, { hidden: 1 })).toContain(
      '1 holder could take it with a collet you do not stock — the press above shows it.',
    )
  })

  /** Nothing hidden is the general answer again, not a sentence about none. */
  it('falls back to the general answers where the press hid nothing', () => {
    expect(whyEmpty(0, NOTHING_CHOSEN, {}, true, { hidden: 0 })).toBe(
      'Nothing here takes any of the tools that fit this feature.',
    )
  })
})

describe('the rack with and without the chucks that have no collet', () => {
  const nothing = { tool: null, collet: null }

  /**
   * **Both lists at once** (Paul, 2026-09-10, asking for a press in the
   * chrome): whichever one the table draws, the press over it counts the other,
   * and a flag would have made the count a second question.
   */
  it('answers the same list twice, one of them without the gapped chucks', () => {
    const offered = holdersToOffer(
      [er16Chuck, er20Chuck],
      nothing,
      collets,
      {},
      () => true,
      [tool('small', 6)],
      (holder) => colletGapFor(holder, [tool('small', 6)], collets),
    )
    // The ER16 closes on 6 mm; nothing in the crib closes on 6 in an ER20.
    expect(offered.shown.map((each) => each.guid)).toEqual(['holder-a', 'holder-b'])
    expect(offered.stocked.map((each) => each.guid)).toEqual(['holder-a'])
  })

  it('leaves the two lists identical where every chuck can be built', () => {
    const offered = holdersToOffer(
      [er16Chuck, er20Chuck],
      nothing,
      collets,
      {},
      () => true,
      [tool('small', 6), tool('big', 10)],
      (holder) => colletGapFor(holder, [tool('small', 6), tool('big', 10)], collets),
    )
    expect(offered.stocked).toEqual(offered.shown)
  })

  /** The shape rule is the other list's, and counts what it hid either way. */
  it('keeps the undrawable count about the drawing alone', () => {
    const offered = holdersToOffer(
      [er16Chuck, er20Chuck],
      nothing,
      collets,
      {},
      (holder) => holder.guid === 'holder-a',
      [tool('small', 6)],
      (holder) => colletGapFor(holder, [tool('small', 6)], collets),
    )
    expect(offered.shown.map((each) => each.guid)).toEqual(['holder-a'])
    expect(offered.stocked.map((each) => each.guid)).toEqual(['holder-a'])
    expect(offered.hidden).toBe(1)
  })

  /** Nothing handed in, nothing hidden: the old callers are unchanged. */
  it('treats every holder as stocked when nobody asks about collets', () => {
    const offered = holdersToOffer([er16Chuck, er20Chuck], nothing, collets, {}, () => true)
    expect(offered.stocked).toEqual(offered.shown)
  })
})

describe('why a list is empty', () => {
  it('says nothing at all where the list has rows', () => {
    expect(whyEmpty(3, NOTHING_CHOSEN)).toBeNull()
  })

  it('names the choice that ruled everything out', () => {
    expect(whyEmpty(0, { tool: null, holder: er16Chuck, collet: null })).toContain('BT30ER16060M')
  })

  it('says the catalog is empty where nothing was chosen', () => {
    expect(whyEmpty(0, NOTHING_CHOSEN)).toBe('Nothing in the catalog to show here.')
  })
})

/**
 * **A rack is graded against shanks, not against tools** (Paul, 2026-09-07:
 * "everything is quite laggy now"). Every rule that asks a set of tools whether
 * any of them fits reads `geometry.SFDM` and nothing else, so the set worth
 * asking is one tool per distinct shank — on the full scrape that is twenty
 * questions rather than two thousand.
 */
describe('one tool per shank', () => {
  const on = (shank: number | undefined, guid: string): CatalogTool =>
    ({ guid, geometry: { SFDM: shank } }) as unknown as CatalogTool

  it('keeps the first of each shank, in order', () => {
    expect(
      byShank([on(6, 'a'), on(12, 'b'), on(6, 'c'), on(8, 'd')]).map((each) => each.guid),
    ).toEqual(['a', 'b', 'd'])
  })

  /** Both predicates refuse a tool that states none, so it can never decide one. */
  it('drops a tool whose shank the vendor did not state', () => {
    expect(byShank([on(undefined, 'a'), on(6, 'b')]).map((each) => each.guid)).toEqual(['b'])
  })

  it('answers the same as the full list would', () => {
    const shrink = holder({ clamping: 'shrink', boreDiameter: 12, colletSeries: null })
    const many = [on(6, 'a'), on(12, 'b'), on(12, 'c')]
    expect(takesAny(shrink, byShank(many), [])).toBe(takesAny(shrink, many, []))
    expect(takesAny(shrink, byShank(many), [])).toBe(true)
  })
})
