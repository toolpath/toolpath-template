import { describe, expect, it } from 'vitest'
import {
  assembliesFor,
  canHold,
  defaultStickout,
  holdBand,
  stickoutLimits,
  withStickout,
  colletFitsHolder,
  gripRanges,
  gripsAnyShank,
  gripsShank,
  holderTakesTool,
  maxStickout,
  type Collet,
  type Holder,
} from './toolholding.js'
import { assembliesForFeatures, assemblyAgainst, unholdableTools } from './assembly-fit.js'
/** The bounds alone: no floor, no step — so a case about the caps is only about the caps. */
const BARE = { heldShare: 1 / 3, least: 0, step: { inch: 0, metric: 0 } }
import type { FeatureDemand } from './fit.js'
import type { CatalogTool } from './types.js'

const tool = (over: Partial<CatalogTool> & Pick<CatalogTool, 'guid'>): CatalogTool => ({
  familyId: 'endmills',
  brand: 'WIDIA',
  vendor: 'Kennametal',
  catalogNumber: 'TDMX0500',
  materialNumber: null,
  toolType: 'endmill',
  form: 'flat end mill',
  unitSystem: 'metric',
  geometry: { DC: 6, LCF: 20, OAL: 60, SFDM: 6, RE: 0 },
  materialGroups: ['P'],
  productLine: null,
  productLink: null,
  provenance: {},
  ...over,
})

const holder = (over: Partial<Holder> & Pick<Holder, 'guid'>): Holder => ({
  familyId: 'bt30-er',
  brand: 'Kennametal',
  vendor: 'Kennametal',
  catalogNumber: 'BT30ER16060M',
  materialNumber: null,
  taper: 'BT30',
  contact: null,
  clamping: 'collet',
  gaugeLength: 60,
  colletSeries: 'ER16',
  boreDiameter: null,
  noseDiameter: 28,
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

const collet = (over: Partial<Collet> & Pick<Collet, 'guid'>): Collet => ({
  familyId: 'er16',
  brand: 'Kennametal',
  vendor: 'Kennametal',
  catalogNumber: 'ER16-6',
  materialNumber: null,
  series: 'ER16',
  clampMin: 5,
  clampMax: 6,
  clampLength: 20,
  productLink: null,
  provenance: {},
  ...over,
})

const demand = (over: Partial<FeatureDemand> = {}): FeatureDemand => ({
  featureTag: 'pocket-1',
  ...over,
})

describe('what stacks with what', () => {
  it('matches a collet to a holder by series, exactly', () => {
    expect(colletFitsHolder(collet({ guid: 'c' }), holder({ guid: 'h' }))).toBe(true)
    expect(colletFitsHolder(collet({ guid: 'c', series: 'ER20' }), holder({ guid: 'h' }))).toBe(
      false,
    )
  })

  it('grips a shank inside the collet’s range and not outside it', () => {
    const er16 = collet({ guid: 'c' })

    expect(gripsShank(er16, 6)).toBe(true)
    expect(gripsShank(er16, 5)).toBe(true)
    expect(gripsShank(er16, 4.9)).toBe(false)
    expect(gripsShank(er16, 6.1)).toBe(false)
  })

  /**
   * A shrink-fit holder bored for 12 mm does not hold a 10 mm shank at all.
   * Treating the bore as an upper bound would put a tool in a holder that drops
   * it.
   */
  it('holds a bore holder to one nominal diameter, not a range', () => {
    const shrink = holder({ guid: 'h', clamping: 'shrink', colletSeries: null, boreDiameter: 6 })

    expect(holderTakesTool(shrink, null, tool({ guid: 't' }))).toBe(true)
    expect(holderTakesTool(shrink, null, tool({ guid: 't', geometry: { SFDM: 5, OAL: 60 } }))).toBe(
      false,
    )
  })

  /** The one place an unstated measurement is refused rather than skipped. */
  it('refuses a tool whose shank the vendor does not state', () => {
    const shankless = tool({ guid: 't', geometry: { DC: 6, OAL: 60 } })

    expect(holderTakesTool(holder({ guid: 'h' }), collet({ guid: 'c' }), shankless)).toBe(false)
  })
})

describe('maxStickout', () => {
  it('is what is left of the tool once the collet has its grip', () => {
    expect(maxStickout(tool({ guid: 't' }), collet({ guid: 'c' }))).toBe(40)
  })

  /** A guessed maximum stickout is worse than an absent one. */
  it('answers null when the collet does not publish its grip length', () => {
    expect(maxStickout(tool({ guid: 't' }), collet({ guid: 'c', clampLength: null }))).toBeNull()
  })

  it('answers null when the tool is shorter than the grip', () => {
    const stub = tool({ guid: 't', geometry: { OAL: 15, SFDM: 6 } })

    expect(maxStickout(stub, collet({ guid: 'c' }))).toBeNull()
  })
})

describe('assembliesFor', () => {
  it('offers every collet that grips, shortest stickout first', () => {
    const found = assembliesFor(
      tool({ guid: 't' }),
      [holder({ guid: 'h' })],
      [
        collet({ guid: 'long', clampLength: 20 }),
        collet({ guid: 'short', catalogNumber: 'ER16-6S', clampLength: 30 }),
      ],
    )

    // Both start at the flutes; the collet with the shorter reach — the firmer grip — comes first.
    expect(found.map((each) => each.collet?.guid)).toEqual(['short', 'long'])
    // 20 mm of flute, onto the 3 mm step.
    expect(found.map((each) => each.stickout)).toEqual([21, 21])
    expect(found.map((each) => each.maxStickout)).toEqual([30, 40])
  })

  it('leaves out a holder for another spindle', () => {
    const found = assembliesFor(
      tool({ guid: 't' }),
      [holder({ guid: 'h', taper: 'CAT40' })],
      [collet({ guid: 'c' })],
      'BT30',
    )

    expect(found).toEqual([])
  })

  it('finds nothing when no collet grips the shank', () => {
    const found = assembliesFor(
      tool({ guid: 't', geometry: { SFDM: 12, OAL: 60 } }),
      [holder({ guid: 'h' })],
      [collet({ guid: 'c' })],
    )

    expect(found).toEqual([])
  })
})

describe('reach, which is what the cutter check cannot see', () => {
  const stack = {
    holder: holder({ guid: 'h' }),
    collet: collet({ guid: 'c' }),
    tool: tool({ guid: 't' }),
    stickout: 40,
    maxStickout: 40,
  }

  it('accepts a stack that clears the part top', () => {
    expect(assemblyAgainst(stack, demand({ reachBelowTop: 30 }))).toEqual([])
  })

  it('rules out a stack whose stickout does not clear the part top', () => {
    const failures = assemblyAgainst(stack, demand({ reachBelowTop: 55 }))

    expect(failures[0]?.reason).toContain('does not clear')
  })

  it('still applies every check the cutter itself has to pass', () => {
    const failures = assemblyAgainst(stack, demand({ maxToolDiameter: 4 }))

    expect(failures[0]?.reason).toContain('wider than')
  })

  it('checks no reach the datasheet does not state', () => {
    expect(assemblyAgainst(stack, demand())).toEqual([])
  })
})

describe('assembliesForFeatures', () => {
  /**
   * The case this whole module exists for: a cutter that clears the feature on
   * its own, held in the only collet that grips it, no longer reaching.
   */
  it('rejects a tool that fits but cannot be held far enough out', () => {
    const deep = demand({ reachBelowTop: 45, depth: 15 })
    const fits = assembliesForFeatures(
      [tool({ guid: 't' })],
      [holder({ guid: 'h' })],
      [collet({ guid: 'c' })],
      [deep],
    )

    expect(fits).toHaveLength(1)
    expect(fits[0]?.fits).toBe(false)
  })

  it('offers the shortest stack that works first', () => {
    const fits = assembliesForFeatures(
      [tool({ guid: 't' })],
      [holder({ guid: 'h' })],
      [collet({ guid: 'a', clampLength: 30 }), collet({ guid: 'b', clampLength: 20 })],
      [demand({ reachBelowTop: 25 })],
    )

    // Pulled out just far enough to reach, from the flutes: the same 25 in either collet.
    expect(fits.filter((each) => each.fits).map((each) => each.assembly.stickout)).toEqual([25, 25])
  })
})

describe('unholdableTools', () => {
  /**
   * A gap in the crib is a different problem from a tool being wrong, and it is
   * fixed by buying a collet rather than by choosing another cutter.
   */
  it('names a tool that cuts the feature but nothing holds', () => {
    const oddShank = tool({ guid: 't', geometry: { DC: 6, LCF: 20, OAL: 60, SFDM: 9.5 } })

    const stranded = unholdableTools(
      [oddShank],
      [holder({ guid: 'h' })],
      [collet({ guid: 'c' })],
      [demand({ depth: 10 })],
    )

    expect(stranded.map((each) => each.guid)).toEqual(['t'])
  })

  it('says nothing about a tool that does not cut the feature anyway', () => {
    const tooWide = tool({ guid: 't', geometry: { DC: 20, SFDM: 9.5, OAL: 60 } })

    expect(
      unholdableTools(
        [tooWide],
        [holder({ guid: 'h' })],
        [collet({ guid: 'c' })],
        [demand({ maxToolDiameter: 6 })],
      ),
    ).toEqual([])
  })
})

describe('the shank diameters a crib can grip', () => {
  const er16 = holder({ guid: 'h1', taper: 'BT30', clamping: 'collet', colletSeries: 'ER16' })
  const er32 = holder({ guid: 'h2', taper: 'HSK63A', clamping: 'collet', colletSeries: 'ER32' })
  const shrink = holder({ guid: 'h3', taper: 'BT30', clamping: 'shrink', boreDiameter: 12 })
  const small = collet({ guid: 'c1', series: 'ER16', clampMin: 3, clampMax: 4 })
  const large = collet({ guid: 'c2', series: 'ER32', clampMin: 10, clampMax: 12 })

  const holders = [er16, er32, shrink]
  const collets = [small, large]

  it('gathers every collet span and every bore', () => {
    const ranges = gripRanges(holders, collets)

    expect(gripsAnyShank(ranges, 3.5)).toBe(true)
    expect(gripsAnyShank(ranges, 11)).toBe(true)
    expect(gripsAnyShank(ranges, 12)).toBe(true)
    expect(gripsAnyShank(ranges, 8)).toBe(false)
  })

  it('narrows to one spindle interface', () => {
    const ranges = gripRanges(holders, collets, { taper: 'BT30' })

    expect(gripsAnyShank(ranges, 3.5)).toBe(true)
    // The ER32 holder is HSK63A, so its collets are not in this crib.
    expect(gripsAnyShank(ranges, 11)).toBe(false)
  })

  /** A bore holder takes one nominal size, so it can never answer for a series. */
  it('drops bore holders when a collet series is asked for', () => {
    const ranges = gripRanges(holders, collets, { colletSeries: 'ER16' })

    expect(gripsAnyShank(ranges, 3.5)).toBe(true)
    expect(gripsAnyShank(ranges, 12)).toBe(false)
  })

  /** The unchecked case is a cutter falling out of a spindle. */
  it('refuses a tool whose shank the vendor does not state', () => {
    const ranges = gripRanges(holders, collets)

    expect(canHold(ranges, tool({ guid: 't1', geometry: { SFDM: 3.5 } }))).toBe(true)
    expect(canHold(ranges, tool({ guid: 't2', geometry: {} }))).toBe(false)
  })
})

describe('a shank a hair off the collet’s size', () => {
  /** 3/8" is 9.525 on the collet and 9.524999999999999 on the tool: the same shank. */
  it('is still gripped', () => {
    const inch = collet({ guid: 'c', clampMin: 9.525, clampMax: 9.525 })
    expect(gripsShank(inch, 9.524999999999999)).toBe(true)
    expect(gripsShank(inch, 9.5)).toBe(false)
  })
})

describe('how far a tool stands out by default', () => {
  const gripped = collet({ guid: 'c', clampLength: 18 })
  const unpublished = collet({ guid: 'c', clampLength: null })

  /**
   * The flutes, out to the sheet's floor and onto its step — the same
   * `stickoutRange().setup` that writes `geometry.LBH`. It was the bare flute
   * length until 2026-09-03, when the default policy gained the floor and the
   * step it had always had on the page: 26 mm of flute lands on the 27 mm step.
   */
  it('starts at the flutes, floored and stepped', () => {
    expect(defaultStickout(tool({ guid: 't', geometry: { OAL: 60, LCF: 26 } }), gripped)).toBe(27)
  })

  /** REGO-FIX publishes no grip length; the default still stands, and only the ceiling is unknown. */
  it('still has a default when the collet publishes no grip length', () => {
    expect(defaultStickout(tool({ guid: 't', geometry: { OAL: 60, LCF: 26 } }), unpublished)).toBe(
      27,
    )
  })

  /**
   * A grip the tool cannot fully fill is not a reason to push the flutes into
   * the collet: the stickout stays at the flutes, the collet grips what shank
   * there is, and `stickoutLimits.gripShort` says so.
   */
  it('stays at the flutes even where the grip could not be filled', () => {
    expect(defaultStickout(tool({ guid: 't', geometry: { OAL: 40, LCF: 26 } }), gripped)).toBe(26)
    expect(
      stickoutLimits(tool({ guid: 't', geometry: { OAL: 40, LCF: 26 } }), gripped),
    ).toMatchObject({
      max: 26,
      gripShort: true,
      limitedBy: 'collet',
    })
  })

  it('falls back to the grip when the tool states no flute length', () => {
    expect(defaultStickout(tool({ guid: 't', geometry: { OAL: 60 } }), gripped)).toBe(42)
    expect(defaultStickout(tool({ guid: 't', geometry: { OAL: 60 } }), unpublished)).toBeNull()
  })

  it('holds a chosen stickout between the tool’s least and the grip’s most', () => {
    const assembly = assembliesFor(
      tool({ guid: 't', geometry: { DC: 6, OAL: 60, SFDM: 6, LCF: 26 } }),
      [holder({ guid: 'h' })],
      [gripped],
    )[0]!

    expect(assembly.stickout).toBe(27)
    expect(assembly.maxStickout).toBe(40)
    expect(withStickout(assembly, 35).stickout).toBe(35)
    expect(withStickout(assembly, 10).stickout).toBe(26)
    expect(withStickout(assembly, 90).stickout).toBe(40)
  })
})

describe('how far a tool may stand out of a holder', () => {
  const stated = collet({ guid: 'c', clampLength: 25 })
  const unpublished = collet({ guid: 'c', clampLength: null })

  /** The least is the flutes out of the collet; the most leaves a third of the tool held. */
  it('runs from the flute length to what leaves a third of the tool in the holder', () => {
    const limits = stickoutLimits(
      tool({ guid: 't', geometry: { DC: 6, OAL: 60, SFDM: 6, LCF: 19 } }),
      unpublished,
    )

    expect(limits).toMatchObject({
      min: 19,
      max: 40,
      // 19 mm of flute, onto the 3 mm step.
      setup: 21,
      grip: 41,
      wantedGrip: 20,
      gripShort: false,
      limitedBy: 'hold',
    })
  })

  it('is capped by the collet’s grip where the vendor states one, when that is stricter', () => {
    const limits = stickoutLimits(
      tool({ guid: 't', geometry: { DC: 6, OAL: 60, SFDM: 6, LCF: 19 } }),
      stated,
    )

    expect(limits?.max).toBe(35)
    expect(limits?.limitedBy).toBe('collet')
    const longGrip = collet({ guid: 'c', clampLength: 30 })
    expect(
      stickoutLimits(tool({ guid: 't', geometry: { DC: 6, OAL: 60, SFDM: 6, LCF: 19 } }), longGrip)
        ?.max,
    ).toBe(30)
  })

  /** More flute than the shop's clamping rule leaves: the rule cannot be met, the physical bound wins, and the range collapses. */
  it('collapses onto the shortest stickout when the grip rule cannot be met, and says so', () => {
    const limits = stickoutLimits(
      tool({ guid: 't', geometry: { DC: 16, OAL: 123, SFDM: 16, LCF: 89 } }),
      unpublished,
    )

    // 3×⌀16 wants 48 clamped, which is tighter than the 41 the hold share
    // would keep — and before 2026-09-03 only the hold share was ever consulted
    // here, so this said 41.
    expect(limits).toMatchObject({
      min: 89,
      max: 89,
      gripShort: true,
      grip: 34,
      wantedGrip: 48,
      limitedBy: 'clamp',
    })
  })

  /** Paul's rule: flutes plus what the holder needs, and never more than the tool allows. */
  it('starts at the flutes plus what the holder needs to clear the part', () => {
    const t = tool({ guid: 't', geometry: { DC: 6, OAL: 60, SFDM: 6, LCF: 19 } })
    expect(stickoutLimits(t, unpublished, 27)?.setup).toBe(27)
    expect(stickoutLimits(t, unpublished, 10)?.setup).toBe(21)
    expect(stickoutLimits(t, unpublished, 55)?.setup).toBe(40)
  })

  /**
   * **The two knobs, in one place.** The sheet carries `good hold` as a share
   * of the overall length and `minimum clamping length` as a length of shank,
   * and the ceiling is whichever bites first. Loosen the hold share far enough
   * and the clamping rule takes over — which is the reconciliation this module
   * exists for: before 2026-09-03 the second knob capped a number in another
   * file and this one never saw it, so a quarter answered 45.
   */
  it('takes the tighter of the sheet’s two knobs, and names it', () => {
    const t = tool({ guid: 't', geometry: { DC: 6, OAL: 60, SFDM: 6, LCF: 19 } })
    const share = (heldShare: number) => ({ heldShare, least: 0, step: { inch: 0, metric: 0 } })
    expect(stickoutLimits(t, unpublished, null, share(1 / 3))).toMatchObject({
      max: 40,
      limitedBy: 'hold',
    })
    expect(stickoutLimits(t, unpublished, null, share(1 / 4))).toMatchObject({
      max: 42,
      limitedBy: 'clamp',
    })
  })

  /** A shop that clamps more has less reach, and the same call says so. */
  it('follows the shop’s clamping rule', () => {
    const t = tool({ guid: 't', geometry: { DC: 6, OAL: 60, SFDM: 6, LCF: 19 } })
    expect(
      stickoutLimits(t, unpublished, null, BARE, { vendorSpec: true, perDiameter: 6 })?.max,
    ).toBe(24)
  })

  it('grades the hold by the share of the tool left in the holder', () => {
    const t = tool({ guid: 't', geometry: { OAL: 60 } })
    const thresholds = { good: 1 / 3, least: 1 / 4 }
    expect(holdBand(t, 40, thresholds)).toBe('good')
    expect(holdBand(t, 42, thresholds)).toBe('medium')
    expect(holdBand(t, 46, thresholds)).toBe('bad')
    expect(holdBand(tool({ guid: 't', geometry: {} }), 20, thresholds)).toBeNull()
  })

  it('has no ceiling when nothing states one, and no bounds at all for a tool with no flute length', () => {
    expect(
      stickoutLimits(tool({ guid: 't', geometry: { DC: 6, LCF: 19 } }), unpublished)?.max,
    ).toBeNull()
    expect(
      stickoutLimits(tool({ guid: 't', geometry: { DC: 6, OAL: 60 } }), unpublished),
    ).toBeNull()
  })
})

describe('the setup stickout, by the sheet', () => {
  const unpublished = collet({ guid: 'c', clampLength: null })
  /** Paul's numbers: half an inch at least, on an eighth of an inch for inch tools and 3 mm for metric ones. */
  const policy = { heldShare: 1 / 3, least: 12.7, step: { inch: 3.175, metric: 3 } }
  const inch = tool({
    guid: 'i',
    unitSystem: 'inch',
    geometry: { DC: 6.35, OAL: 76.2, SFDM: 6.35, LCF: 19.05 },
  })
  const metric = tool({
    guid: 'm',
    unitSystem: 'metric',
    geometry: { DC: 6, OAL: 60, SFDM: 6, LCF: 8 },
  })

  it('lands on the step nearest what the holder needs, never under it', () => {
    // 20.3 needed: the nearest eighth is 19.05, which is short, so the one above.
    expect(stickoutLimits(inch, unpublished, 20.3, policy)?.setup).toBe(22.23)
    // 21.5 needed: 22.225 is nearest and clears.
    expect(stickoutLimits(inch, unpublished, 21.5, policy)?.setup).toBe(22.23)
  })

  it('stands out at least the least worth setting up, on the metric step for a metric tool', () => {
    // 8 mm of flute and 10 needed: half an inch is the floor, and 12 is the 3 mm step nearest it.
    expect(stickoutLimits(metric, unpublished, 10, policy)?.setup).toBe(12)
    expect(stickoutLimits(metric, unpublished, null, policy)?.setup).toBe(12)
  })

  /**
   * A 15 mm tool on a ⌀3 shank: 3×D wants 9 clamped, which leaves exactly its
   * 6 mm of flute. The half-inch floor asks for more than the tool has, and
   * the ceiling wins — as it must, or the drawing stands a tool out further
   * than the shank behind it allows.
   */
  it('goes no further than the tool allows', () => {
    const stubby = tool({
      guid: 's',
      unitSystem: 'inch',
      geometry: { DC: 3, OAL: 15, SFDM: 3, LCF: 6 },
    })
    expect(stickoutLimits(stubby, unpublished, null, policy)).toMatchObject({
      max: 6,
      setup: 6,
      limitedBy: 'clamp',
    })
  })

  /**
   * **The default policy is the sheet's now**, so "the bounds alone" is
   * something a caller asks for rather than what it gets by omission. It was
   * the other way round until 2026-09-03, and that is precisely why `LBH` came
   * out as a bare flute length the first time this reading was tried.
   */
  it('is the bounds alone only when asked for them', () => {
    expect(stickoutLimits(inch, unpublished, 20.3, BARE)?.setup).toBe(20.3)
    expect(stickoutLimits(metric, unpublished, null, BARE)?.setup).toBe(8)
    expect(stickoutLimits(metric, unpublished)?.setup).toBe(12)
  })
})
