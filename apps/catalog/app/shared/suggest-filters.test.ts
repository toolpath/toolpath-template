import { describe, expect, it } from 'vitest'
import type { PartFeature } from '@toolpath/part-contracts'
import { EMPTY_QUERY } from './filter'
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
    // A should is not a filter, and reach is the holder's.
    expect(ranges.LD).toBeUndefined()
    expect(ranges.LBH).toBeUndefined()
  })

  /** A through feature's flutes run past the bottom by the overcut knob. */
  it('adds the through overcut to the flutes a through pocket needs', () => {
    const through = pocket({ cd: { ignore: { min: 6, max: 9 } } }, 'ThroughPocket')

    expect(suggestionsFor(through, null, [through]).ranges.LCF).toEqual({ min: 12.127 })
  })

  /** A drill's own bound is a row for drills, not a range over every tool. */
  it('does not turn a drill-only rule into a filter over end mills', () => {
    const through = hole({ fullConeDeg: 180 }, 'ThroughHole')
    const { ranges } = suggestionsFor(through, null, [through])

    expect(ranges.DC).toEqual({ max: 4 })
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

  /** Changed by hand, it is theirs — whatever the next feature would have said. */
  it('leaves an answer somebody set themselves', () => {
    const mine = {
      ...EMPTY_QUERY,
      terms: { form: ['tap right hand'] },
      ranges: { DC: { max: 3 }, NOF: { min: 6 } },
    }

    const next = applySuggestions(mine, suggestionsFor(drilled, 'N', [drilled]), filleted, 'N', [
      filleted,
    ])

    expect(next.terms.form).toEqual(['tap right hand'])
    expect(next.ranges.DC).toEqual({ max: 3 })
    expect(next.ranges.NOF).toEqual({ min: 6 })
  })

  /** Nothing selected takes the suggestions away rather than leaving them standing. */
  it('drops its own suggestions when the selection is put down', () => {
    const set = applySuggestions(EMPTY_QUERY, suggestionsFor(null, null), filleted, 'P', [filleted])

    const cleared = applySuggestions(set, suggestionsFor(filleted, 'P', [filleted]), null, null)

    expect(cleared.terms).toEqual({})
    expect(cleared.ranges).toEqual({})
  })
})
