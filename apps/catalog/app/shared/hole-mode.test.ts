import { describe, expect, it } from 'vitest'
import type { PartFeature } from '@toolpath/part-contracts'
import type { CatalogTool } from '@toolpath/catalog-data'
import { asRecord } from '@toolpath/part-contracts/datasheet'
import {
  PREDRILL_MILL_FORMS,
  THREADED_FORMS,
  drillsFirst,
  formsWithMills,
  millsLabel,
  millsShown,
  holeAt,
  makersFor,
  reaches,
  shortfallOf,
  tapsFor,
} from './hole-mode'
import { threadNamed } from './threads'

/**
 * A hole gets a region of its own, keyed off its tag: two features are the
 * same physical hole when they share one, which is the kernel's own answer to
 * "which surfaces is this".
 */
const regionOf = (featureTag: string): number =>
  [...featureTag].reduce((sum, letter) => sum + letter.charCodeAt(0), 0)

const hole = (
  featureTag: string,
  diameter: number,
  depth: number,
  featureType = 'BlindHole',
): PartFeature =>
  ({
    featureTag,
    featureType,
    machiningDirection: { x: 0, y: 0, z: 1 },
    regionIdxs: [regionOf(featureTag)],
    // `extendedZMax` is the top of the part this way up, which is what the
    // reach is measured from.
    datasheet: { zMin: -depth, zMax: 0, extendedZMax: 0, facts: { kind: 'Hole', diameter } },
  }) as unknown as PartFeature

const pocket = {
  featureTag: 'pocket-1',
  featureType: 'Pocket',
  datasheet: { zMin: -5, zMax: 0, facts: { kind: 'Pocket' } },
} as unknown as PartFeature

describe('a hole stood in at another diameter', () => {
  /**
   * A threaded hole is drilled at the tap drill, and the model may be drawn at
   * the minor or the nominal size — so the drill is judged against the hole
   * the shop will make.
   */
  it('changes the bore and nothing else', () => {
    const drilled = holeAt(hole('a', 4.918, 12), 5)

    expect(asRecord(drilled.datasheet?.facts)?.diameter).toBe(5)
    expect(drilled.featureTag).toBe('a')
    expect(drilled.datasheet?.zMin).toBe(-12)
  })

  /**
   * **Including the number the rules actually read** (Paul, 2026-09-01): the
   * kernel states `maxDrillDiameter` for the hole as drawn, and the sheet's
   * largest-tool rule reads it before the diameter. Left at the modelled size
   * it called every drill between the model and the tap drill "too large" — a
   * ⌀0.116 drill refused for a hole whose form tap wants ⌀0.122.
   */
  it('stands the drill limit in at the same bore', () => {
    const drawn = {
      ...hole('a', 2.79, 12),
      datasheet: {
        zMin: -12,
        zMax: 0,
        facts: { kind: 'Hole', diameter: 2.79, maxDrillDiameter: 2.79 },
      },
    } as unknown as PartFeature

    const bored = holeAt(drawn, 3.1)

    expect(asRecord(bored.datasheet?.facts)?.maxDrillDiameter).toBe(3.1)
  })

  /** Where the kernel states no limit, none is invented. */
  it('adds no drill limit to a hole that states none', () => {
    const drilled = holeAt(hole('a', 4.918, 12), 5)

    expect(asRecord(drilled.datasheet?.facts)?.maxDrillDiameter).toBeUndefined()
  })

  /**
   * **And the end mill limit with it** (Paul, 2026-09-02, asking for an end
   * mill to be usable in place of a drill).
   *
   * The kernel states `maxEndmillDiameter` short of the bore, because a mill
   * has to helix down inside it, and `largest end mill diameter` reads it.
   * Left at the modelled size, a mill would be judged against the hole as
   * drawn while every drill beside it was judged against the predrill — the
   * same defect the drill limit above exists to fix. Rescaled rather than
   * recomputed: the kernel's allowance is a proportion of the bore, and the
   * same proportion of a different bore is the same claim about it.
   */
  it('rescales the end mill limit in proportion to the bore it stands in', () => {
    const drawn = {
      ...hole('a', 6, 12),
      datasheet: {
        zMin: -12,
        zMax: 0,
        // 10/11 of a ⌀6 bore, which is what the sheet's note describes.
        facts: { kind: 'Hole', diameter: 6, maxEndmillDiameter: 5.4545 },
      },
    } as unknown as PartFeature

    const bored = holeAt(drawn, 6.6)

    expect(asRecord(bored.datasheet?.facts)?.maxEndmillDiameter).toBeCloseTo(6, 3)
  })

  it('adds no end mill limit to a hole that states none', () => {
    const drilled = holeAt(hole('a', 4.918, 12), 5)

    expect(asRecord(drilled.datasheet?.facts)?.maxEndmillDiameter).toBeUndefined()
  })
})

/**
 * **A predrill is a hole, and a hole can be interpolated** (Paul, 2026-09-02:
 * "I need to be able to use an end mill on a threaded hole in place of a
 * drill… it should always show drills first by default").
 */
describe('the mills that can make a predrill', () => {
  const tool = (form: string, guid: string) => ({ form, guid })

  it('adds the two flat-bottomed forms to the filter, and takes them off again', () => {
    expect(formsWithMills(['drill', 'tap right hand'], true)).toEqual([
      'drill',
      'tap right hand',
      'flat end mill',
      'bull nose end mill',
    ])
    expect(
      formsWithMills(['drill', 'flat end mill', 'bull nose end mill', 'tap right hand'], false),
    ).toEqual(['drill', 'tap right hand'])
  })

  /** A ball nose leaves a round bottom in a hole meant to be tapped. */
  it('offers no ball nose', () => {
    expect(PREDRILL_MILL_FORMS).not.toContain('ball end mill')
  })

  /**
   * **The filter is the switch** (Paul, 2026-09-02: "end mills should also show
   * if I enable them in the top level filter, and the button should highlight —
   * if only one type is shown, it should say 'showing <flat, or whatever type>
   * end mills'"). Ticking one form on the rail is the same act as pressing the
   * button, so the button reads its state off the filter and names what is
   * actually on rather than claiming both.
   */
  it('names the mills the filter is actually showing', () => {
    expect(millsLabel(['drill', 'tap right hand'])).toBe('Show compatible endmills')
    expect(millsLabel(['drill', 'flat end mill'])).toBe('Showing flat end mills')
    expect(millsLabel(['drill', 'bull nose end mill'])).toBe('Showing bull nose end mills')
    expect(millsLabel(['drill', 'flat end mill', 'bull nose end mill'])).toBe('Showing end mills')
  })

  it('shows the mills the filter names, and only those', () => {
    expect(millsShown(['drill', 'flat end mill'])).toEqual(['flat end mill'])
    expect(millsShown(['drill'])).toEqual([])
    // In the list's own order, whatever order the filter holds them in.
    expect(millsShown(['bull nose end mill', 'flat end mill'])).toEqual([
      'flat end mill',
      'bull nose end mill',
    ])
  })

  it('adds a form the filter already holds only once', () => {
    expect(formsWithMills(['drill', 'flat end mill'], true)).toEqual([
      'drill',
      'flat end mill',
      'bull nose end mill',
    ])
  })

  /**
   * A mill that lands exactly on the predrill would outrank every drill on the
   * sheet's own "closest to the hole diameter" row, and the shop rule is that
   * a hole up to an inch is drilled.
   */
  it('keeps the drills ahead of them, each half in the order it arrived', () => {
    const listed = [
      tool('flat end mill', 'm1'),
      tool('drill', 'd1'),
      tool('bull nose end mill', 'm2'),
      tool('drill', 'd2'),
    ]

    expect(drillsFirst(listed).map((each) => each.guid)).toEqual(['d1', 'd2', 'm1', 'm2'])
  })
})

describe('the taps for a thread', () => {
  const tap = (catalogNumber: string, DC: number): CatalogTool =>
    ({
      guid: catalogNumber,
      catalogNumber,
      form: 'tap right hand',
      geometry: { DC },
    }) as unknown as CatalogTool
  const mill = {
    guid: 'm',
    catalogNumber: 'M',
    form: 'flat end mill',
    geometry: { DC: 6 },
  } as unknown as CatalogTool

  /** By size, closest first — and only taps. */
  it('offers the taps of that nominal size', () => {
    const taps = tapsFor(threadNamed('M6×1')!, [tap('T6', 6), tap('T6b', 6.1), tap('T8', 8), mill])

    expect(taps.map((each) => each.catalogNumber)).toEqual(['T6', 'T6b'])
  })

  /**
   * A tap's pitch is in its catalog number in a different shape for every
   * brand and is not a number anywhere in this dataset, so an M8×1.25 and an
   * M8×1 are both offered and the choice is the person's.
   */
  it('cannot tell one pitch from another, and offers both', () => {
    const coarse = tapsFor(threadNamed('M8×1.25')!, [tap('T8', 8)])
    const fine = tapsFor(threadNamed('M8×1')!, [tap('T8', 8)])

    expect(coarse).toEqual(fine)
  })
})

describe('what makes the thread', () => {
  const tap = (catalogNumber: string, DC: number): CatalogTool =>
    ({
      guid: catalogNumber,
      catalogNumber,
      form: 'tap right hand',
      geometry: { DC },
    }) as unknown as CatalogTool
  const mill = (catalogNumber: string, DC: number): CatalogTool =>
    ({
      guid: catalogNumber,
      catalogNumber,
      form: 'thread mill',
      geometry: { DC },
    }) as unknown as CatalogTool

  it('is a tap for either kind of tapping', () => {
    const tools = [tap('T6', 6), mill('TM3', 3)]

    expect(
      makersFor(threadNamed('M6×1')!, 'cut tap', tools).made.map((each) => each.catalogNumber),
    ).toEqual(['T6'])
    expect(
      makersFor(threadNamed('M6×1')!, 'form tap', tools).made.map((each) => each.catalogNumber),
    ).toEqual(['T6'])
  })

  /**
   * A thread mill works from inside the hole, so what bounds it is the minor
   * diameter — an M6's is 4.918, and a ⌀5 mill does not go in.
   */
  it('is a thread mill that fits inside the minor diameter', () => {
    const { made } = makersFor(threadNamed('M6×1')!, 'thread mill', [
      mill('TM3', 3),
      mill('TM5', 5),
    ])

    expect(made.map((each) => each.catalogNumber)).toEqual(['TM3'])
  })

  it('is nothing at all for a plain hole', () => {
    expect(makersFor(threadNamed('M6×1')!, 'plain', [tap('T6', 6)]).made).toEqual([])
  })
})

describe('whether a threading tool reaches the bottom', () => {
  const tap = (catalogNumber: string, geometry: Record<string, number>): CatalogTool =>
    ({
      guid: catalogNumber,
      catalogNumber,
      form: 'tap right hand',
      geometry: { DC: 6, ...geometry },
    }) as unknown as CatalogTool

  /**
   * The drills go through the rules sheet, which measures flutes against
   * depth; taps did not, because the sheet's hole rules are about a bore and
   * every tap is wider than the hole it threads (Paul, 2026-08-31: "are we
   * checking to make sure the taps can reach the feature?").
   */
  it('refuses a tap whose thread is shorter than the hole', () => {
    const reach = { depth: 20, below: 20 }

    expect(reaches(tap('SHORT', { LCF: 12, LBH: 30 }), reach)).toBe(false)
    expect(reaches(tap('LONG', { LCF: 25, LBH: 30 }), reach)).toBe(true)
  })

  /** And one that cannot get down to the top of the thread. */
  it('refuses a tap that cannot reach past the part above it', () => {
    expect(reaches(tap('STUBBY', { LCF: 25, LBH: 15 }), { depth: 20, below: 40 })).toBe(false)
  })

  /** A number the vendor never stated cannot refuse a tool. */
  it('lets an unstated length pass', () => {
    expect(reaches(tap('BARE', {}), { depth: 20, below: 40 })).toBe(true)
  })

  it('keeps only the ones that reach', () => {
    const { made, short } = makersFor(
      threadNamed('M6×1')!,
      'cut tap',
      [tap('SHORT', { LCF: 5, LBH: 30 }), tap('LONG', { LCF: 25, LBH: 30 })],
      { depth: 20, below: 20 },
    )

    expect(made.map((each) => each.catalogNumber)).toEqual(['LONG'])
    expect(short).toBe(false)
  })

  /**
   * And when none of them reach, the nearest misses stand in rather than an
   * empty section: "here are the taps for this thread and here is how far each
   * falls short" is what somebody can act on (Paul, 2026-08-31).
   */
  it('offers the nearest misses when nothing reaches, closest first', () => {
    const { made, short } = makersFor(
      threadNamed('M6×1')!,
      'cut tap',
      [tap('WAY', { LCF: 5, LBH: 30 }), tap('NEAR', { LCF: 18, LBH: 30 })],
      { depth: 20, below: 20 },
    )

    expect(made.map((each) => each.catalogNumber)).toEqual(['NEAR', 'WAY'])
    expect(short).toBe(true)
  })
})

describe('why a threading tool is not on the list', () => {
  const tap = (catalogNumber: string, geometry: Record<string, number>): CatalogTool =>
    ({
      guid: catalogNumber,
      catalogNumber,
      form: 'tap right hand',
      geometry: { DC: 6, ...geometry },
    }) as unknown as CatalogTool

  /**
   * "None reach the bottom" over a table of plain grey numbers says nothing
   * anybody can act on; the length that falls short is the one to paint
   * (Paul, 2026-08-31).
   */
  it('names the length that falls short, and by how much', () => {
    const reach = { depth: 20, below: 30 }

    expect(shortfallOf(tap('SHORT', { LCF: 12, LBH: 40 }), reach)).toEqual({ code: 'LCF', by: 8 })
    expect(shortfallOf(tap('STUBBY', { LCF: 25, LBH: 22 }), reach)).toEqual({
      code: 'LBH',
      by: 8,
    })
  })

  /** Swept against the curve it either clears or does not: no shortfall to give. */
  it('says a swept tool fouls the part rather than inventing a number', () => {
    const reach = { depth: 20, below: 30, clears: () => false }

    expect(shortfallOf(tap('FOULS', { LCF: 25, LBH: 40 }), reach)).toEqual({
      code: 'LBH',
      by: null,
    })
  })

  it('says nothing about a tool that reaches', () => {
    expect(shortfallOf(tap('LONG', { LCF: 25, LBH: 40 }), { depth: 20, below: 30 })).toBeNull()
    expect(shortfallOf(tap('LONG', { LCF: 25, LBH: 40 }), null)).toBeNull()
  })

  /**
   * A hole at the bottom of an open pocket: half an inch of fresh air over a
   * quarter inch of hole. The tap's derived length below the holder is shorter
   * than that drop and it reaches perfectly well, because what is beside the
   * shank up there is nothing (Paul, 2026-08-31).
   */
  it('sweeps rather than measures, where there is a curve to sweep', () => {
    const stubby = tap('STUBBY', { LCF: 25, LBH: 18 })

    expect(reaches(stubby, { depth: 20, below: 40 })).toBe(false)
    expect(reaches(stubby, { depth: 20, below: 40, clears: () => true })).toBe(true)
  })
})

/**
 * **Saying a hole is threaded says which tools it takes** (Paul, 2026-09-02:
 * "tap is not automatically added to tool type filter when I define a hole as
 * threaded. It should be. So, when I enable cut or form tap on a feature,
 * Right and Left Hand Taps should be automatically added as eligible tool
 * types"). The choice used to write `drill` into the type filter and nothing
 * else, which admitted the tool that makes the hole and not the one that cuts
 * the thread.
 */
describe('the tool forms a threaded hole takes', () => {
  it('is the drill and both hands of tap', () => {
    expect([...THREADED_FORMS].sort()).toEqual(['drill', 'tap left hand', 'tap right hand'])
  })

  /**
   * The same rule the tap list itself uses, so the two cannot drift apart —
   * and neither takes a **tapered mill** for a tap, which `startsWith('tap')`
   * did until this was written.
   */
  it('admits every form the taps for a thread are drawn from, and no milling cutter', () => {
    const spec = threadNamed('M6×1')!
    const handed = (catalogNumber: string, form: string): CatalogTool =>
      ({ guid: catalogNumber, catalogNumber, form, geometry: { DC: 6 } }) as unknown as CatalogTool
    const taps = tapsFor(spec, [
      handed('RH', 'tap right hand'),
      handed('LH', 'tap left hand'),
      handed('TAPER', 'tapered mill'),
    ])

    expect(taps.map((each) => each.catalogNumber).sort()).toEqual(['LH', 'RH'])
    for (const tap of taps) {
      expect(THREADED_FORMS).toContain(tap.form)
    }
    expect(THREADED_FORMS).not.toContain('tapered mill')
  })
})
