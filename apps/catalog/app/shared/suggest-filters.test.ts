import { describe, expect, it } from 'vitest'
import type { PartFeature } from '@toolpath/part-contracts'
import { EMPTY_QUERY, queryFromSearch, searchFromQuery } from './filter'
import { applySuggestions, suggestedFlutes, suggestionsFor } from './suggest-filters'

/**
 * These run against the **committed** sheet, so a row somebody edits is a
 * row these say something about. Each case names the row it reads.
 */
const feature = (
  featureType: string,
  facts: Record<string, unknown> = {},
  sheet: Record<string, unknown> = {},
): PartFeature =>
  ({
    featureTag: featureType,
    featureType,
    regionIdxs: [],
    machiningDirection: { x: 0, y: 0, z: 1 },
    datasheet: { facts, ...sheet },
  }) as unknown as PartFeature

const hole = (facts: Record<string, unknown>, type = 'BlindHole') =>
  feature(
    type,
    { kind: 'Hole', diameter: 6, maxDrillDiameter: 6, maxEndmillDiameter: 4, ...facts },
    { zMax: 0, zMin: -20, extendedZMax: 0 },
  )

const pocket = (facts: Record<string, unknown> = {}, type = 'Pocket') =>
  feature(
    type,
    { kind: 'Pocket', cd: { ignore: { min: 6 } }, ...facts },
    { zMax: 0, zMin: -12, extendedZMax: 0 },
  )

describe('what the sheet says about a feature', () => {
  /** Row: BlindHole / flat bottom. */
  it('mills a flat-bottomed blind hole and drills a pointed one', () => {
    expect(suggestionsFor(hole({ fullConeDeg: 180 }), null).terms.form?.[0]).toBe('flat end mill')
    expect(suggestionsFor(hole({ fullConeDeg: 118 }), null).terms.form?.[0]).toBe('drill')
  })

  /** Row: Pocket / filleted — the type table, as one set. The fillet's bound is the judge's, on bull noses only. */
  it('offers a filleted pocket every type it considers, and leaves the fillet to the judge', () => {
    const { terms, ranges } = suggestionsFor(pocket({ filletRadius: 1.5 }), null, [
      pocket({ filletRadius: 1.5 }),
    ])

    expect(terms.form).toEqual(['bull nose end mill', 'flat end mill', 'ball end mill'])
    expect(ranges.RE).toBeUndefined()
  })

  /** The rules sheet's musts that apply to every tool type: diameter under the tightest corner, flutes over the depth. */
  it('bounds the diameter by what the feature admits and the flutes by its depth, from the rules', () => {
    const square = pocket({ cd: { ignore: { min: 6, max: 9 } } })
    const { terms, ranges } = suggestionsFor(square, null, [square])

    expect(terms.form).toEqual(['flat end mill', 'bull nose end mill'])
    // The tightest corner, not the widest place: terminal finishing rules for everything.
    expect(ranges.DC).toEqual({ max: 6 })
    expect(ranges.LCF).toEqual({ min: 12 })
    /**
     * Reach is a rule of its own now (Paul, 2026-09-01): what stands out of
     * the holder has to reach the bottom from the top of the part, so the
     * panel bounds it like any other must — visible, and somebody's to clear.
     */
    expect(ranges.LBH).toEqual({ min: 12 })
    // A should is still not a filter.
    expect(ranges.LD).toBeUndefined()
  })

  /** A through feature's flutes run past the bottom by the overcut knob. */
  it('adds the through overcut to the flutes a through pocket needs', () => {
    const through = pocket({ cd: { ignore: { min: 6, max: 9 } } }, 'ThroughPocket')

    expect(suggestionsFor(through, null, [through]).ranges.LCF).toEqual({ min: 12.127 })
  })

  /**
   * A filter may only say what is true of **every** form the feature
   * considers, so it takes the loosest of them.
   *
   * The **end mill's** limit is not the cap: this hole admits a ⌀4 end mill —
   * it has to helix down inside the bore — and reading that as the largest
   * tool filtered the ⌀6 drill out of the panel as well as out of the list
   * (Paul, 2026-08-31). Nor is the bore itself the cap any more: a drill is
   * allowed past it by the oversize knob, and a filter set at the bore would
   * hide exactly the drills that row exists to admit.
   */
  it('takes the loosest bound over the forms the feature considers', () => {
    const through = hole({ fullConeDeg: 180 }, 'ThroughHole')
    const { ranges } = suggestionsFor(through, null, [through])

    expect(ranges.DC).toEqual({ max: 6.102 })
    expect(ranges.LCF).toEqual({ min: 20.127 })
  })

  /** Row: Sink. */
  it('reads a sink’s cone', () => {
    const sink = feature(
      'Sink',
      { kind: 'Chamfer', bevel: { angleDeg: 45, countersink: { innerRadius: 2, outerRadius: 5 } } },
      { zMax: 0, zMin: -3, extendedZMax: 0 },
    )
    const { terms, ranges } = suggestionsFor(sink, null, [sink])

    expect(terms.form?.[0]).toBe('chamfer mill')
    expect(ranges.DC).toEqual({ max: 10 })
  })

  /** Row: ThreadedBlindHole. */
  it('taps a threaded hole', () => {
    expect(
      suggestionsFor(hole({ threading: { size: 'M6' } }, 'ThreadedBlindHole'), null).terms
        .form?.[0],
    ).toBe('tap right hand')
  })

  it('matches the kernel’s name however the report spells it', () => {
    expect(suggestionsFor(pocket({}, 'filleted_open_pocket'), null).terms.form).toEqual([
      'bull nose end mill',
      'flat end mill',
      'ball end mill',
    ])
  })

  /** The part material sets the flute count, never a term over the vendors' material tags — most of the catalog states none. */
  it('suggests nothing for a feature the sheet does not know, whatever the material', () => {
    expect(suggestionsFor(feature('Sculpture'), 'P')).toEqual({ terms: {}, ranges: {} })
  })

  it('suggests nothing with no feature selected', () => {
    expect(suggestionsFor(null, 'P')).toEqual({ terms: {}, ranges: {} })
  })
})

describe('how many flutes the material wants', () => {
  it('gives aluminium the chip room of two or three, and steel the edges of four', () => {
    expect(suggestedFlutes('N', 'flat end mill')).toEqual({ max: 3 })
    expect(suggestedFlutes('P', 'bull nose end mill')).toEqual({ min: 4 })
  })

  /** A drill has the flutes it has. */
  it('says nothing about a tool that does not mill, or without a material', () => {
    expect(suggestedFlutes('N', 'drill')).toBeNull()
    expect(suggestedFlutes(null, 'flat end mill')).toBeNull()
  })

  /** Row: Pocket says `by material`; ThroughHole says nothing. */
  it('applies the sheet’s flutes rule through the material', () => {
    expect(suggestionsFor(pocket(), 'N').ranges.NOF).toEqual({ max: 3 })
    expect(suggestionsFor(hole({}, 'ThroughHole'), 'N').ranges.NOF).toBeUndefined()
  })
})

describe('a suggestion the last feature made is not somebody’s answer', () => {
  const drilled = hole({ fullConeDeg: 118 })
  const filleted = pocket({ filletRadius: 1 })

  /**
   * The bug this rule exists for: click a hole, then a pocket, and the tool
   * list stayed full of drills. Filling only blanks meant the hole's own
   * suggestion blocked the pocket's, because it was no longer blank.
   */
  it('replaces what the last feature suggested', () => {
    const first = applySuggestions(EMPTY_QUERY, suggestionsFor(null, null), drilled, 'N', [drilled])
    expect(first.terms.form?.[0]).toBe('drill')
    expect(first.ranges.LCF).toEqual({ min: 20 })

    const second = applySuggestions(first, suggestionsFor(drilled, 'N', [drilled]), filleted, 'N', [
      filleted,
    ])
    expect(second.terms.form?.[0]).toBe('bull nose end mill')
    expect(second.ranges.LCF).toEqual({ min: 12 })
    expect(second.ranges.NOF).toEqual({ max: 3 })
  })

  /**
   * **Through the URL, which is the only way the application ever runs it.**
   *
   * The query is held in the query string, so what `applySuggestions` is handed
   * on the next feature is not what it returned — it is what came back out of
   * the URL. Everything above tests the round trip's two ends and none of its
   * middle, which is how the carry-over of 2026-08-30 shipped: the writer
   * sorted a term's values, the suggestion came back in a different order, and
   * every feature after the first read the one before it as somebody's answer
   * and kept its filters.
   */
  it('replaces the last feature’s suggestion after it has been through the URL', () => {
    const first = applySuggestions(EMPTY_QUERY, suggestionsFor(null, null), drilled, 'N', [drilled])
    const held = queryFromSearch(searchFromQuery(first))
    expect(held.terms.form).toEqual(first.terms.form)

    const second = applySuggestions(held, suggestionsFor(drilled, 'N', [drilled]), filleted, 'N', [
      filleted,
    ])

    expect(second.terms.form).toEqual(suggestionsFor(filleted, 'N', [filleted]).terms.form)
    expect(second.ranges.LCF).toEqual({ min: 12 })
  })

  /**
   * Changed by hand, it is theirs — whatever the next feature would have said.
   * Every filter but one: see below.
   */
  it('leaves an answer somebody set themselves', () => {
    const mine = {
      ...EMPTY_QUERY,
      terms: { brand: ['Kennametal'] },
      ranges: { DC: { max: 3 }, NOF: { min: 6 } },
    }

    const next = applySuggestions(mine, suggestionsFor(drilled, 'N', [drilled]), filleted, 'N', [
      filleted,
    ])

    expect(next.terms.brand).toEqual(['Kennametal'])
    expect(next.ranges.DC).toEqual({ max: 3 })
    expect(next.ranges.NOF).toEqual({ min: 6 })
  })

  /**
   * **The tool type is the feature's to say.**
   *
   * Which forms can cut a thing is a fact about the thing, so a type chosen
   * for the last feature — by hand as much as by the sheet — is not an answer
   * about this one, and a tap left ticked from a hole made a filleted pocket
   * list taps (Paul, 2026-08-31).
   */
  it('overrules a tool type somebody set, and only that', () => {
    const mine = {
      ...EMPTY_QUERY,
      terms: { form: ['tap right hand'], brand: ['Kennametal'] },
      ranges: { DC: { max: 3 } },
    }

    const next = applySuggestions(mine, suggestionsFor(drilled, 'N', [drilled]), filleted, 'N', [
      filleted,
    ])

    expect(next.terms.form).toEqual(suggestionsFor(filleted, 'N', [filleted]).terms.form)
    expect(next.terms.brand).toEqual(['Kennametal'])
    expect(next.ranges.DC).toEqual({ max: 3 })
  })

  /** With no feature to say otherwise, a type somebody set is still theirs. */
  it('keeps a tool type somebody set when nothing is selected', () => {
    const mine = { ...EMPTY_QUERY, terms: { form: ['tap right hand'] } }

    expect(
      applySuggestions(mine, suggestionsFor(drilled, 'N', [drilled]), null, 'N', []).terms.form,
    ).toEqual(['tap right hand'])
  })

  /** Nothing selected takes the suggestions away rather than leaving them standing. */
  it('drops its own suggestions when the selection is put down', () => {
    const set = applySuggestions(EMPTY_QUERY, suggestionsFor(null, null), filleted, 'P', [filleted])

    const cleared = applySuggestions(set, suggestionsFor(filleted, 'P', [filleted]), null, null)

    expect(cleared.terms).toEqual({})
    expect(cleared.ranges).toEqual({})
  })
})
