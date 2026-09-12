import { describe, expect, it } from 'vitest'
import type { CatalogTool } from '@toolpath/catalog-data'
import type { Verdict } from './judge'
import type { Rule } from './rules'
import type { PartFeature } from '@toolpath/part-contracts'
import {
  closeCandidates,
  distinctQuestions,
  fittingTools,
  overridableCount,
  overridableTally,
  overridableTools,
} from './tool-fit'
import { standingOf } from './judge'

/**
 * The removed half of a verdict, which is all an override reads.
 *
 * Built from literals rather than judged, the way `judge.ts` is tested: what is
 * under test is which removals a column may forgive, and that is a question
 * about the reasons rather than about the tools.
 */
const bound = (field: string): Rule =>
  ({
    line: 1,
    stage: 'tool',
    level: 'must',
    toolTypes: ['*'],
    test: { kind: 'bound', field, operator: '<=', base: { kind: 'feature' } },
    text: `${field} rule`,
    note: '',
  }) as unknown as Rule

const removed = (
  guid: string,
  fields: ReadonlyArray<string>,
  miss: number,
  geometry: Readonly<Record<string, number>> = {},
): Verdict =>
  ({
    tool: { guid, geometry } as unknown as CatalogTool,
    removed: fields.map((field) => ({
      rule: bound(field),
      text: `${field} over`,
      shortfall: miss,
    })),
    warned: [],
    demoted: [],
    key: [],
    readings: [],
  }) as unknown as Verdict

/** Removed for something no column asks: the wrong kind of tool for the feature. */
const wrongKind = (guid: string): Verdict =>
  ({
    tool: { guid, geometry: {} } as unknown as CatalogTool,
    removed: [{ rule: null, text: 'the tool types this feature considers' }],
    warned: [],
    demoted: [],
    key: [],
    readings: [],
  }) as unknown as Verdict

const all = (...guids: ReadonlyArray<string>) => new Set(guids)

describe('what a column offers to forgive', () => {
  it('counts a tool that only this column turns down', () => {
    const excluded = [removed('a', ['diameter'], 1), removed('b', ['flute length'], 1)]

    expect(overridableTally(excluded, all('a', 'b'))).toEqual({ DC: 1, LCF: 1 })
  })

  /**
   * A cutter turned down on both is not brought back by forgiving either, so
   * counting it under both would promise a row that never appears.
   */
  it('counts a tool two columns turn down under neither', () => {
    const excluded = [removed('a', ['diameter', 'flute length'], 1)]

    expect(overridableTally(excluded, all('a'))).toEqual({})
  })

  it('leaves out what the filters do not admit in the first place', () => {
    expect(overridableTally([removed('a', ['diameter'], 1)], all())).toEqual({})
  })

  /** No filter asks "is this the right kind of tool", so no filter forgives it. */
  it('offers nothing for a removal no column asks about', () => {
    expect(overridableTally([wrongKind('a')], all('a'))).toEqual({})
    expect(overridableTools([wrongKind('a')], all('a'), ['DC'], 10)).toEqual([])
  })
})

describe('what a forgiven column puts back', () => {
  it('forgives only the columns named', () => {
    const excluded = [removed('wide', ['diameter'], 1), removed('short', ['flute length'], 1)]

    expect(overridableTools(excluded, all('wide', 'short'), ['DC'], 10).map((v) => v.tool.guid)) //
      .toEqual(['wide'])
  })

  it('forgives a tool two columns turn down once both are named', () => {
    const excluded = [removed('both', ['diameter', 'flute length'], 1)]

    expect(overridableTools(excluded, all('both'), ['DC'], 10)).toEqual([])
    expect(
      overridableTools(excluded, all('both'), ['DC', 'LCF'], 10).map((v) => v.tool.guid),
    ).toEqual(['both'])
  })

  it('forgives nothing while nothing is named', () => {
    expect(overridableTools([removed('a', ['diameter'], 1)], all('a'), [], 10)).toEqual([])
  })

  /**
   * **A cap that hides the end of the range somebody widened *to* is worse than
   * no override at all** (Paul, 2026-09-08: "it still doesn't seem to be going
   * up to the bounds — I'm sure there are 1/2 inch tools with greater than
   * 0.980 inch flute length in this library"). The list is nearest first, so a
   * cap fills every slot with the tools that miss by the least; against a
   * 38,000-tool catalog a cap of 200 was entirely ⌀12 mm cutters and never
   * reached the 663 half-inch ones the filter had been typed to find.
   *
   * The cap is the table's own row cap now. What it still drops is counted, so
   * the list can say it rather than read as the whole answer.
   */
  it('takes the nearest first, and counts what the cap dropped', () => {
    const excluded = [3, 1, 2, 4].map((miss) => removed(`miss-${String(miss)}`, ['diameter'], miss))

    expect(overridableTools(excluded, all(...excluded.map((v) => v.tool.guid)), ['DC'], 2)) //
      .toEqual([excluded[1], excluded[2]])
    expect(overridableCount(excluded, all(...excluded.map((v) => v.tool.guid)), ['DC'])).toBe(4)
  })

  /**
   * **The cap may not hide the end of the range somebody typed** — the same
   * defect as the test above, come back the way raising a cap always lets it
   * (Paul, 2026-09-09: a ⌀0.125 in pocket widened to ⌀0.5 in "shows tools only
   * up to a random diameter … it should show tools up to 0.5 in"). The cap had
   * been raised from 200 to 2,000 the day before; on the scraped catalog 5,734
   * tools were forgiven, and nearest-first spent all 2,000 slots on the sizes
   * just past the rule and stopped at ⌀0.25 in.
   *
   * So this is written against the *shape* of the answer rather than against a
   * number: whatever the cap is, every value the forgiven column takes is on
   * the list before any value is listed twice. A cap of four over four sizes is
   * the whole range or it is the bug — and no future cap can pass this by being
   * larger.
   */
  it('reaches every value the forgiven column takes, whatever the cap', () => {
    const excluded = [3, 6, 9, 12].flatMap((DC) =>
      [0, 1, 2, 3, 4].map((each) =>
        removed(`d${String(DC)}-${String(each)}`, ['diameter'], DC + each / 10, { DC }),
      ),
    )
    const admitted = all(...excluded.map((verdict) => verdict.tool.guid))

    const four = overridableTools(excluded, admitted, ['DC'], 4)
    expect(four.map((verdict) => verdict.tool.geometry.DC)).toEqual([3, 6, 9, 12])
    // Nearest first inside each size, so the head of the list is still the
    // closest tool of every size the filter admits.
    expect(four.map((verdict) => verdict.tool.guid)).toEqual(['d3-0', 'd6-0', 'd9-0', 'd12-0'])

    const six = overridableTools(excluded, admitted, ['DC'], 6)
    expect(new Set(six.map((verdict) => verdict.tool.geometry.DC))).toEqual(new Set([3, 6, 9, 12]))
    expect(six).toHaveLength(6)

    // Uncapped is still every one of them, and the count says so.
    expect(overridableTools(excluded, admitted, ['DC'], 100)).toHaveLength(20)
    expect(overridableCount(excluded, admitted, ['DC'])).toBe(20)
  })
})

/**
 * **A group of identical holes is one question, and was being asked once per
 * hole** (Paul, 2026-09-08: "they are taking a bit to come in … this is a 42
 * tool group. We should optimize for up to 150 or so"). Judging is proportional
 * to the tools in the catalog, so a 42-hole bolt circle ran 42 full passes over
 * ~9,000 tools and a 150-hole one ran out of memory holding every pass's
 * verdicts to fold at the end.
 */
const holeAt = (tag: string, depth: number, diameter = 8): PartFeature =>
  ({
    featureTag: tag,
    featureType: 'ThroughHole',
    machiningDirection: { x: 0, y: 0, z: 1 },
    regionIdxs: [1],
    datasheet: {
      zMin: -depth,
      zMax: 0,
      extendedZMax: 0,
      facts: { kind: 'Hole', diameter, cd: { ignore: { min: diameter, max: diameter } } },
    },
  }) as unknown as PartFeature

const cutter = (guid: string, DC: number, LCF: number): CatalogTool =>
  ({
    guid,
    catalogNumber: guid,
    brand: 'Test',
    vendor: 'Test',
    form: 'flat end mill',
    toolType: 'endmill',
    unitSystem: 'millimeters',
    geometry: { DC, SFDM: DC, LCF, OAL: 60, LD: 4, RE: 0, NOF: 4, 'shoulder-diameter': DC },
    materialGroups: [],
    productLink: null,
    provenance: {},
  }) as unknown as CatalogTool

describe('how many questions a group actually asks', () => {
  it('asks once for holes that read the same', () => {
    const group = [holeAt('a', 10), holeAt('b', 10), holeAt('c', 10)]

    expect(distinctQuestions(group, group).map((each) => each.featureTag)).toEqual(['a'])
  })

  /** A group built by hand out of different features still judges each of them. */
  it('asks again where anything a rule reads differs', () => {
    const group = [holeAt('a', 10), holeAt('b', 12), holeAt('c', 10, 6)]

    expect(distinctQuestions(group, group).map((each) => each.featureTag)).toEqual(['a', 'b', 'c'])
  })

  /** The answer is the answer: folding as it judges is the same fold. */
  it('answers a repeated feature exactly as it answers one', () => {
    const one = [holeAt('a', 10)]
    const four = [holeAt('a', 10), holeAt('b', 10), holeAt('c', 10), holeAt('d', 10)]
    const crib = [cutter('FITS', 8, 14), cutter('SHORT', 8, 4), cutter('WIDE', 12, 14)]

    const single = fittingTools(one, one, crib)
    const group = fittingTools(four, four, crib)

    expect(group.fitting.map((each) => each.tool.guid)).toEqual(
      single.fitting.map((each) => each.tool.guid),
    )
    expect(group.excluded.map((each) => each.tool.guid)).toEqual(
      single.excluded.map((each) => each.tool.guid),
    )
  })

  /**
   * **A tool removed by one feature is removed**, and the rest of the group does
   * not re-judge it — which is what keeps a 150-hole group from judging the
   * whole catalog 150 times. The reason it carries is the one that removed it.
   */
  it('keeps a tool only where every distinct question keeps it', () => {
    const mixed = [holeAt('a', 10), holeAt('b', 20)]
    const crib = [cutter('BOTH', 8, 24), cutter('SHALLOW', 8, 14)]

    const answer = fittingTools(mixed, mixed, crib)

    expect(answer.fitting.map((each) => each.tool.guid)).toEqual(['BOTH'])
    expect(standingOf(answer.excluded[0]!)).toBe('removed')
    expect(answer.excluded[0]?.tool.guid).toBe('SHALLOW')
    expect(answer.excluded[0]?.removed[0]?.text).toContain('flute length')
  })
})

/**
 * **A filter is obeyed by the list that stands in for one** (Paul, 2026-09-10:
 * at most three flutes, then Kennametal, and four-flute tools on the list —
 * "they should not be … we should see 'no tools meet these filters'"). Nothing
 * fits, so the closest misses stand in, and they were drawn without the ranges
 * at all: a bound somebody typed was a bound the fill ignored.
 *
 * The one bound a near miss may be outside is **the bound it missed on**, and
 * only while that bound still reads what the geometry asked for. Forgiving
 * every suggested bound instead put ⌀0.750 in cutters on a group capped at
 * ⌀0.286 in (Paul, 2026-09-11): those tools were removed for reach, so the
 * diameter question was never put to them at all. `nearEnough` is the rule.
 */
describe('the misses that may stand in when nothing fits', () => {
  const miss = (guid: string, brand: string, geometry: Readonly<Record<string, number>>): Verdict =>
    ({
      tool: { guid, brand, geometry } as unknown as CatalogTool,
      removed: [{ rule: bound('flute length'), text: 'flute length over', shortfall: 1 }],
      warned: [],
      demoted: [],
      key: [],
      readings: [],
    }) as unknown as Verdict

  const excluded = [
    miss('THREE', 'Kennametal', { NOF: 3, LCF: 10 }),
    miss('FOUR', 'Kennametal', { NOF: 4, LCF: 10 }),
    miss('OTHER', 'WIDIA', { NOF: 3, LCF: 10 }),
  ]

  const asking = (ranges: Record<string, { min?: number; max?: number }>) => ({
    text: '',
    terms: { brand: ['Kennametal'] },
    ranges,
  })

  it('obeys a bound somebody set themselves', () => {
    const kept = closeCandidates(excluded, asking({ NOF: { max: 3 } }), {})

    expect(kept.map((each) => each.tool.guid)).toEqual(['THREE'])
  })

  /**
   * The bound the rules wrote on the column these tools missed on is what
   * "close" is measured against, not a filter: every one of them is a flute
   * length short, which is the whole of what the list is standing in to say.
   */
  it("forgives the geometry's bound on the column the tool missed on", () => {
    const kept = closeCandidates(excluded, asking({ LCF: { min: 50 } }), { LCF: { min: 50 } })

    expect(kept.map((each) => each.tool.guid)).toEqual(['THREE', 'FOUR'])
  })

  /**
   * **And obeys it everywhere else** (Paul, 2026-09-11). A tool removed before
   * anything asked about its flutes is not close to a question it was never
   * put.
   */
  it("obeys the geometry's bound on a column the tool did not miss on", () => {
    const kept = closeCandidates(excluded, asking({ NOF: { max: 3 } }), { NOF: { max: 3 } })

    expect(kept.map((each) => each.tool.guid)).toEqual(['THREE'])
  })

  /**
   * A widened bound is somebody's own answer, on the missed column like any
   * other — the override beside it is what says how far the rules bend, and the
   * number is the last word on what is listed.
   */
  it('obeys a bound widened past what the geometry asked for', () => {
    const kept = closeCandidates(excluded, asking({ LCF: { min: 20 } }), { LCF: { min: 50 } })

    expect(kept.map((each) => each.tool.guid)).toEqual([])
  })

  it('still leaves out what the discrete filters do not admit', () => {
    const kept = closeCandidates(excluded, asking({}), {})

    expect(kept.map((each) => each.tool.guid)).not.toContain('OTHER')
  })

  /**
   * **The reach rules are no column's question at all** (Paul, 2026-09-11), so
   * nothing about a tool they removed is forgiven: it is as far outside the
   * feature's diameter as it ever was, and `furthest below holder` is
   * deliberately on no column — `suggest-filters.ts` § `CODES` says why.
   */
  it('forgives nothing for a tool removed by a rule no column asks', () => {
    const reach = [
      miss('SMALL', 'Kennametal', { NOF: 3, LCF: 10, DC: 6 }),
      miss('WIDE', 'Kennametal', { NOF: 3, LCF: 10, DC: 19 }),
    ].map((verdict) => ({
      ...verdict,
      removed: [{ rule: bound('furthest below holder'), text: 'too short', shortfall: 1 }],
    })) as unknown as Array<Verdict>

    const kept = closeCandidates(reach, asking({ DC: { max: 7.264 } }), { DC: { max: 7.264 } })

    expect(kept.map((each) => each.tool.guid)).toEqual(['SMALL'])
  })
})
