import { describe, expect, it } from 'vitest'
import type { PartFeature } from '@toolpath/part-contracts'
import type { CatalogTool } from '@toolpath/catalog-data'
import { asRecord } from '@toolpath/part-contracts/datasheet'
import {
  PREDRILL_MILL_FORMS,
  THREADED_FORMS,
  drillsFirst,
  formsAskingTaps,
  formsWithMills,
  millsLabel,
  millsShown,
  predrillFormsOf,
  holeAt,
  holesAt,
  makersFor,
  reaches,
  shortfallOf,
  tapBounds,
  tapFormsOf,
  tapsFor,
  threadedFormsWith,
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

  /**
   * **Cut and form are two lists, not one** (Paul, 2026-09-09: "these buttons
   * should filter to show only cut or form taps on the taps table"). The two
   * start from holes half a millimetre apart on an M6, so a list holding both
   * would put half its rows against a drill they cannot use.
   */
  describe('and which kind of tap the mode asks for', () => {
    const made = (catalogNumber: string, method: 'cutting' | 'forming'): CatalogTool =>
      ({ ...tap(catalogNumber, 6), threadMethod: method }) as unknown as CatalogTool
    const spec = threadNamed('M6×1')!
    const cutting = made('cut', 'cutting')
    const forming = made('form', 'forming')

    it('offers the cutting taps for a cut tap, and the forming ones for a form tap', () => {
      expect(
        tapsFor(spec, [cutting, forming], 'cutting').map((each) => each.catalogNumber),
      ).toEqual(['cut'])
      expect(
        tapsFor(spec, [cutting, forming], 'forming').map((each) => each.catalogNumber),
      ).toEqual(['form'])
    })

    /**
     * The silence a store scraped before `@toolpath/tool-scraper` 2.4.0 carries
     * on every tap in it. Read as `cutting` it would hide every tap from the
     * form list; excluded outright it would empty both — so it stays in each.
     */
    it('keeps a tap that states no method in both lists', () => {
      const silent = tap('silent', 6)

      expect(tapsFor(spec, [silent], 'cutting').map((each) => each.catalogNumber)).toEqual([
        'silent',
      ])
      expect(tapsFor(spec, [silent], 'forming').map((each) => each.catalogNumber)).toEqual([
        'silent',
      ])
    })

    /** No mode asked is every tap, which is what the bounds tests read. */
    it('offers both where nothing asked', () => {
      expect(tapsFor(spec, [cutting, forming]).map((each) => each.catalogNumber)).toEqual([
        'cut',
        'form',
      ])
    })
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

    expect(reaches(tap('SHORT', { LCF: 12, OAL: 45, SFDM: 5 }), reach)).toBe(false)
    expect(reaches(tap('LONG', { LCF: 25, OAL: 45, SFDM: 5 }), reach)).toBe(true)
  })

  /**
   * And one that cannot get down to the top of the thread.
   *
   * **The tools state their lengths rather than a length below holder**
   * (2026-09-03). These fixtures used to plant `LBH` directly, which worked
   * only while that field was the furthest a tool could stand out; it is the
   * length it is set up at now, and the reach question is asked of
   * `stickoutCeiling`. A test can no longer hand the screen the answer.
   */
  it('refuses a tap that cannot reach past the part above it', () => {
    // 33 long on a ⌀5 shank: 18 mm of ceiling, under its own 25 of flute, so
    // it goes in as far as it can and still stops 15 short of the drop.
    expect(reaches(tap('STUBBY', { LCF: 25, OAL: 33, SFDM: 5 }), { depth: 20, below: 40 })).toBe(
      false,
    )
  })

  /** A number the vendor never stated cannot refuse a tool. */
  it('lets an unstated length pass', () => {
    expect(reaches(tap('BARE', {}), { depth: 20, below: 40 })).toBe(true)
  })

  it('keeps only the ones that reach', () => {
    const { made, short } = makersFor(
      threadNamed('M6×1')!,
      'cut tap',
      [tap('SHORT', { LCF: 5, OAL: 45, SFDM: 5 }), tap('LONG', { LCF: 25, OAL: 45, SFDM: 5 })],
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
      [tap('WAY', { LCF: 5, OAL: 45, SFDM: 5 }), tap('NEAR', { LCF: 18, OAL: 45, SFDM: 5 })],
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

    expect(shortfallOf(tap('SHORT', { LCF: 12, OAL: 60, SFDM: 6 }), reach)).toEqual({
      code: 'LCF',
      by: 8,
    })
    // 33 long: a third stays in the holder, so 22 is the furthest it goes —
    // 8 short of the 30 mm drop.
    expect(shortfallOf(tap('STUBBY', { LCF: 21, OAL: 33, SFDM: 3 }), reach)).toEqual({
      code: 'LBH',
      by: 8,
    })
  })

  /** Swept against the curve it either clears or does not: no shortfall to give. */
  it('says a swept tool fouls the part rather than inventing a number', () => {
    const reach = { depth: 20, below: 30, clears: () => false }

    expect(shortfallOf(tap('FOULS', { LCF: 25, OAL: 60, SFDM: 6 }), reach)).toEqual({
      code: 'LBH',
      by: null,
    })
  })

  it('says nothing about a tool that reaches', () => {
    expect(
      shortfallOf(tap('LONG', { LCF: 25, OAL: 60, SFDM: 6 }), { depth: 20, below: 30 }),
    ).toBeNull()
    expect(shortfallOf(tap('LONG', { LCF: 25, OAL: 60, SFDM: 6 }), null)).toBeNull()
  })

  /**
   * A hole at the bottom of an open pocket: half an inch of fresh air over a
   * quarter inch of hole. The tap cannot stand out as far as that drop and it
   * reaches perfectly well anyway, because what is beside the shank up there
   * is nothing (Paul, 2026-08-31).
   */
  it('sweeps rather than measures, where there is a curve to sweep', () => {
    const stubby = tap('STUBBY', { LCF: 25, OAL: 45, SFDM: 5 })

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

/**
 * **A tapped hole is drilled, but the filter says with what** (Paul,
 * 2026-09-08: "End mills are technically a valid tool to predrill for the tap,
 * just usually not the first choice"). The list was drills plus the two forms
 * the predrill press writes, so a type asked for in the Type column was judged,
 * fitted, and then dropped on its way to the screen.
 */
describe('the forms a threaded hole\u2019s drill list shows', () => {
  it('is drills wherever the filter asks for nothing else', () => {
    expect(predrillFormsOf(['drill', 'tap right hand'])).toEqual(['drill'])
    expect(predrillFormsOf([])).toEqual(['drill'])
  })

  it('adds whatever cutter the filter asks for, taps excepted', () => {
    expect(predrillFormsOf(['drill', 'tap right hand', 'ball end mill'])).toEqual([
      'drill',
      'ball end mill',
    ])
  })

  /** The taps are the other half of the same feature and have a list of their own. */
  it('never lists a tap, however it got into the filter', () => {
    expect(predrillFormsOf(['tap left hand', 'tap right hand'])).toEqual(['drill'])
  })
})

/**
 * **What swept the list, said in the columns it swept on** (Paul, 2026-09-09:
 * "shouldn't thread diameter and thread length be applied from the thread spec
 * and model feature/group depth respectively?").
 *
 * The lockstep sensor: a number the header states and a number the sweep
 * applies have to be the same number, or a shop reads a bound off a column and
 * finds rows that break it.
 */
describe('the bounds a thread puts on a tap', () => {
  const spec = threadNamed('M6×1')!
  const tap = (guid: string, DC: number, LCF = 30): CatalogTool =>
    ({
      guid,
      catalogNumber: guid,
      brand: 'Acme',
      form: 'tap right hand',
      geometry: { DC, LCF },
    }) as unknown as CatalogTool

  it('states the diameter band the sweep actually takes', () => {
    const { DC } = tapBounds(spec, null)
    expect(DC).toBeDefined()
    const inside = tap('inside', DC!.max!)
    const outside = tap('outside', DC!.max! + 0.01)
    const listed = tapsFor(spec, [inside, outside]).map((each) => each.guid)

    expect(listed).toContain('inside')
    expect(listed).not.toContain('outside')
  })

  it('states the low edge of the band the same way', () => {
    const { DC } = tapBounds(spec, null)
    const listed = tapsFor(spec, [tap('low', DC!.min!), tap('under', DC!.min! - 0.01)]).map(
      (each) => each.guid,
    )

    expect(listed).toEqual(['low'])
  })

  /**
   * The depth of whatever is selected — a feature's or a group's worst case,
   * since `ThreadReach` is built from the reading either way. `reaches` is what
   * applies it, and this is the number the Thread length heading shows.
   */
  it('states the depth as the least thread length, and reaches agrees', () => {
    const reach = { depth: 12, below: 40 }
    expect(tapBounds(spec, reach).LCF).toEqual({ min: 12 })
    expect(reaches(tap('deep', spec.major, 12), reach)).toBe(true)
    expect(reaches(tap('short', spec.major, 11.9), reach)).toBe(false)
  })

  /** With no hole to reach there is no depth to state, and the band stands alone. */
  it('says nothing about length where there is no reach', () => {
    expect(Object.keys(tapBounds(spec, null))).toEqual(['DC'])
  })
})

/**
 * **A tick on the tap list's Type column is a tap form asked for** (Paul,
 * 2026-09-09: "when I am in the TAPs row or table, it should be filtering to
 * taps"). The tap half of the filter moves; the drill half never does, which is
 * what keeps the drill tab from emptying while somebody narrows the taps.
 */
describe('the tap half of a threaded hole’s form filter', () => {
  const threaded = ['drill', 'tap right hand', 'tap left hand']

  it('reads the taps out of the filter and nothing else', () => {
    expect(tapFormsOf(threaded)).toEqual(['tap right hand', 'tap left hand'])
    expect(tapFormsOf(['drill', 'flat end mill'])).toEqual([])
  })

  /** `predrillFormsOf` is the other half, and the two never overlap. */
  it('is disjoint from what the drill list shows', () => {
    expect(tapFormsOf(threaded).filter((form) => predrillFormsOf(threaded).includes(form))).toEqual(
      [],
    )
  })

  it('replaces the taps and leaves the drill half exactly as it was', () => {
    expect(formsAskingTaps(threaded, ['tap right hand'])).toEqual(['drill', 'tap right hand'])
    expect(predrillFormsOf(formsAskingTaps(threaded, ['tap right hand']))).toEqual(['drill'])
  })

  /**
   * Unticking every kind of tap asks for no tap, not for every tap: the drill
   * half is still naming a form, so the filter is somebody's answer rather than
   * an empty axis nobody has touched.
   */
  it('leaves the drill standing when no tap is asked for', () => {
    expect(formsAskingTaps(threaded, [])).toEqual(['drill'])
  })

  /** A mill the predrill press added is not a tap, so it stays. */
  it('keeps what the predrill press put in the filter', () => {
    expect(formsAskingTaps([...threaded, 'flat end mill'], ['tap left hand'])).toEqual([
      'drill',
      'flat end mill',
      'tap left hand',
    ])
  })
})

/**
 * **A thread applies to what is selected, and to the holes in it** (Paul,
 * 2026-09-09: "only what's selected — but I should be able to apply threads to
 * the full group in the Group dialog if desired").
 */
describe('the holes one thread choice is written to', () => {
  const part = [hole('a', 5, 12), hole('b', 5, 12), hole('c', 6, 12), pocket]

  it('takes the holes of that bore and leaves the rest of the selection alone', () => {
    expect(holesAt(part, ['a', 'b', 'c', 'pocket-1'], 5)).toEqual(['a', 'b'])
  })

  /**
   * A group holds a pocket as readily as a hole, and `threadedName` reads the
   * choice per tag — so a thread written across everything selected would have
   * named the pocket `M6×1 Pocket`.
   */
  it('never writes a thread onto something that is not a hole', () => {
    expect(holesAt(part, ['pocket-1'], 5)).toEqual([])
  })

  it('is the one hole where the one hole is all that is selected', () => {
    expect(holesAt(part, ['a'], 5)).toEqual(['a'])
  })
})

/**
 * **What a threaded hole's filter must hold, whatever a suggestion says**
 * (Paul, 2026-09-09: "the tap type is no longer automatically being enabled in
 * tapped holes. It needs to be to show the taps!"). The taps came off the form
 * axis on a write the feature triggered, and the tap list reads that axis — so
 * a hole whose question was which tap answered "no tap of that size".
 */
describe('the forms a threaded hole keeps', () => {
  it('holds the taps, so the tap list has something to read', () => {
    expect(threadedFormsWith([]).some((form) => form.startsWith('tap '))).toBe(true)
  })

  it('holds the drill that makes the hole', () => {
    expect(threadedFormsWith([])).toContain('drill')
  })

  /** Or this rule and the one that turns the mills on undo each other. */
  it('keeps a predrill mill somebody already turned on', () => {
    expect(threadedFormsWith(['flat end mill'])).toContain('flat end mill')
    expect(threadedFormsWith(['bull nose end mill'])).toContain('bull nose end mill')
  })

  /** And adds none that were not asked for: the mills are a switch, not a default. */
  it('adds no mill that is not already on', () => {
    expect(threadedFormsWith([])).not.toContain('flat end mill')
  })
})
