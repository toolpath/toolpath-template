import { describe, expect, it } from 'vitest'
import type { PartFeature } from '@toolpath/part-contracts'
import type { CatalogTool } from '@toolpath/catalog-data'
import { asRecord } from '@toolpath/part-contracts/datasheet'
import { holeAt, makersFor, reaches, shortfallOf, tapsFor } from './hole-mode'
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
