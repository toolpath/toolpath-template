import { describe, expect, it } from 'vitest'
import {
  NO_PREFERENCES,
  materialStanding,
  preferredFor,
  recommend,
  recommended,
  togglePreferred,
} from './preferences.js'
import type { CatalogTool } from './types.js'

const tool = (guid: string, materialGroups: ReadonlyArray<string> = []): CatalogTool =>
  ({
    guid,
    familyId: 'f',
    brand: 'WIDIA',
    vendor: 'Kennametal',
    catalogNumber: guid.toUpperCase(),
    materialNumber: null,
    toolType: 'endmill',
    form: 'flat end mill',
    unitSystem: 'metric',
    geometry: { DC: 6 },
    materialGroups,
    productLink: null,
    provenance: {},
  }) as CatalogTool

describe('nominating a tool', () => {
  it('keeps roughing and finishing lists apart', () => {
    const preferences = togglePreferred(NO_PREFERENCES, 'rough', 'a')

    expect(preferredFor(preferences, 'rough')).toEqual(['a'])
    expect(preferredFor(preferences, 'finish')).toEqual([])
  })

  /** The tool somebody just nominated is the one they mean. */
  it('puts the newest nomination first', () => {
    const preferences = togglePreferred(togglePreferred(NO_PREFERENCES, 'rough', 'a'), 'rough', 'b')

    expect(preferences.rough).toEqual(['b', 'a'])
  })

  it('takes a tool back off', () => {
    const on = togglePreferred(NO_PREFERENCES, 'finish', 'a')

    expect(togglePreferred(on, 'finish', 'a').finish).toEqual([])
  })
})

describe('material standing', () => {
  /**
   * Three answers rather than two: "the vendor says this is for stainless" and
   * "the vendor indexes it under nothing" are different facts, and only the
   * first can rule a tool out.
   */
  it('separates stated, unstated and excluded', () => {
    expect(materialStanding(tool('a', ['P', 'M']), 'P')).toBe('stated')
    expect(materialStanding(tool('a', ['P', 'M']), 'S')).toBe('excluded')
    expect(materialStanding(tool('a', []), 'P')).toBe('unstated')
  })

  it('says nothing when the part has no material set', () => {
    expect(materialStanding(tool('a', ['P']), null)).toBe('unstated')
  })
})

describe('recommend', () => {
  const tools = [tool('plain'), tool('steel', ['P']), tool('stainless', ['M'])]

  it('leaves everything in catalog order when nothing is preferred or set', () => {
    expect(recommend(tools, NO_PREFERENCES, 'rough').map((each) => each.tool.guid)).toEqual([
      'plain',
      'steel',
      'stainless',
    ])
  })

  /** The vendor's own claim, not this package's inference — the one exclusion. */
  it('drops a tool the vendor indexes for other materials only', () => {
    expect(recommend(tools, NO_PREFERENCES, 'rough', 'P').map((each) => each.tool.guid)).toEqual([
      'steel',
      'plain',
    ])
  })

  it('puts a tool the vendor indexes for the material above one nobody has spoken for', () => {
    const ranked = recommend(tools, NO_PREFERENCES, 'rough', 'P')

    expect(ranked[0]?.standing).toBe('stated')
    expect(ranked[1]?.standing).toBe('unstated')
  })

  it('puts the shop’s own list first, in the shop’s order', () => {
    const preferences = { rough: ['stainless', 'plain'], finish: [] }
    const ranked = recommend(tools, preferences, 'rough')

    expect(ranked.map((each) => each.tool.guid)).toEqual(['stainless', 'plain', 'steel'])
    expect(ranked[0]?.preferredAt).toBe(0)
  })

  it('reads the list belonging to the pass being asked about', () => {
    const preferences = { rough: ['stainless'], finish: ['steel'] }

    expect(recommend(tools, preferences, 'finish')[0]?.tool.guid).toBe('steel')
  })

  /** Preferences order; they never hide a tool that fits. */
  it('still offers everything that fits', () => {
    const preferences = { rough: ['steel'], finish: [] }

    expect(recommend(tools, preferences, 'rough')).toHaveLength(3)
  })
})

describe('recommended', () => {
  it('names the shop’s first choice', () => {
    const preferences = { rough: ['stainless'], finish: [] }

    expect(recommended([tool('plain'), tool('stainless', ['M'])], preferences, 'rough')?.guid).toBe(
      'stainless',
    )
  })

  it('names the tool the vendor indexes for the material when nothing is preferred', () => {
    expect(
      recommended([tool('plain'), tool('steel', ['P'])], NO_PREFERENCES, 'rough', 'P')?.guid,
    ).toBe('steel')
  })

  /**
   * An arbitrary first row presented as a recommendation is how a shop stops
   * trusting the recommendations.
   */
  it('recommends nothing when nobody has said anything', () => {
    expect(recommended([tool('plain'), tool('other')], NO_PREFERENCES, 'rough')).toBeNull()
  })

  it('recommends nothing out of an empty list', () => {
    expect(recommended([], NO_PREFERENCES, 'rough')).toBeNull()
  })
})
