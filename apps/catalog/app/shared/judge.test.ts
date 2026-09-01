import { describe, expect, it } from 'vitest'
import type { PartFeature } from '@toolpath/part-contracts'
import type { CatalogTool } from '@toolpath/catalog-data'
import {
  closestMisses,
  compareKeys,
  foldVerdicts,
  judgeTools,
  orderVerdicts,
  removedFrom,
  standingOf,
  type Verdict,
} from './judge'
import { knobsWith, parseKnobs, parseRules } from './rules'

/**
 * The worked example from the plan: one filleted pocket — floor fillet 1.5,
 * the widest cutter that reaches every corner 10, that fits anywhere 14, 20 mm
 * deep, 28 below the part top — and eight bull-nose end mills, judged by the
 * committed sheet. Each tool exists to land at one station.
 */
const pocket = (facts: Record<string, unknown> = {}): PartFeature =>
  ({
    featureTag: 'pocket-1',
    featureType: 'FilletedPocket',
    machiningDirection: { x: 0, y: 0, z: 1 },
    regionIdxs: [1, 2, 3],
    datasheet: {
      zMin: -20,
      zMax: 0,
      // The pocket opens at the top of the part: 20 below it, which every tool
      // here reaches. Reach became a rule of its own on 2026-09-01 and this
      // example is about corner radii, not about length.
      extendedZMax: 0,
      facts: {
        kind: 'Pocket',
        filletRadius: 1.5,
        cd: { ignore: { min: 10, max: 14 }, deviate: { min: 10, max: 14 } },
        ...facts,
      },
    },
  }) as unknown as PartFeature

const tool = (
  catalogNumber: string,
  form: CatalogTool['form'],
  geometry: Record<string, number>,
  brand = 'Kennametal',
): CatalogTool =>
  ({
    guid: catalogNumber,
    catalogNumber,
    brand,
    vendor: brand,
    form,
    toolType: form === 'drill' ? 'drill' : 'endmill',
    geometry: { SFDM: geometry.DC ?? 6, OAL: 80, ...geometry },
    provenance: {},
  }) as unknown as CatalogTool

const bull = (name: string, DC: number, RE: number, LCF: number, LD: number) =>
  tool(name, 'bull nose end mill', { DC, RE, LCF, LD, LBH: LD * DC, 'shoulder-diameter': DC })

// The tightest corner admits 10 and the 5 % clearance wants 9.5: A sits at
// 9.5 with the fillet's own radius, D at 9.8 is inside the clearance, F at 12
// is past the corner but inside the 14 the feature admits anywhere, I at 16 is
// past even that. C's flutes are a millimetre short; G's nose is too big for
// the fillet; E is a long thin tool; H is a flat end mill at 9.5.
const A = bull('A', 9.5, 1.5, 22, 2.5)
const B = bull('B', 8, 1.0, 25, 3.1)
const C = bull('C', 8, 1.0, 19, 3.1)
const D = bull('D', 9.8, 1.5, 22, 2.6)
const E = bull('E', 6, 0.5, 24, 6.0)
const F = bull('F', 12, 1.5, 26, 2.3)
const G = bull('G', 10, 2.0, 22, 2.5)
const H = tool('H', 'flat end mill', {
  DC: 9.5,
  RE: 0,
  LCF: 22,
  LD: 2.5,
  LBH: 25,
  'shoulder-diameter': 9.5,
})
const I = bull('I', 16, 1.5, 30, 1.5)
const TOOLS = [A, B, C, D, E, F, G, H, I]

const by = (verdicts: ReadonlyArray<Verdict>, name: string): Verdict =>
  verdicts.find((verdict) => verdict.tool.catalogNumber === name)!

describe('one filleted pocket, nine tools, the committed sheet', () => {
  const verdicts = judgeTools(TOOLS, pocket(), [pocket()])

  /** Terminal finishing rules for everything, Paul's call: over the tightest corner is out, not warned. */
  it('removes what cannot finish it, and says which rule and which numbers', () => {
    expect(standingOf(by(verdicts, 'F'))).toBe('removed')
    expect(by(verdicts, 'F').removed[0]?.text).toContain(
      'diameter 12 over 10 largest tool diameter',
    )
    expect(standingOf(by(verdicts, 'I'))).toBe('removed')
    expect(standingOf(by(verdicts, 'G'))).toBe('removed')
    expect(by(verdicts, 'G').removed[0]?.text).toContain(
      'corner radius 2 over 1.50 floor fillet radius',
    )
    // Flute length is a must, by Paul's call: never rub the shank.
    expect(standingOf(by(verdicts, 'C'))).toBe('removed')
    expect(by(verdicts, 'C').removed[0]?.text).toContain('flute length 19 under 20 feature depth')
    expect(removedFrom(verdicts).map((verdict) => verdict.tool.catalogNumber)).toEqual([
      'C',
      'F',
      'G',
      'H',
      'I',
    ])
  })

  /** A flat end cannot finish a filleted floor: out. A form the defaults sheet does not list at all: out at the door. */
  it('removes a flat end mill from a filleted floor, and a form the type table does not list', () => {
    expect(standingOf(by(verdicts, 'H'))).toBe('removed')
    expect(by(verdicts, 'H').removed[0]?.text).toContain('form is flat end mill')
    const drill = tool('Z', 'drill', { DC: 8, LCF: 30, LD: 4, SIG: 118 })
    const [z] = judgeTools([drill], pocket(), [pocket()])
    expect(standingOf(z!)).toBe('removed')
    expect(z!.removed[0]?.text).toContain('not a type this feature considers')
  })

  /**
   * A tool on the tightest corner is a tool that fits.
   *
   * It was warned by a 5 %-under rule — the downsize rule — and Paul took that
   * out on 2026-09-01: a cutter that matches the feature's own geometry is the
   * match, not a fault, and it leads the list.
   */
  it('keeps a tool on the corner, unwarned', () => {
    expect(standingOf(by(verdicts, 'D'))).toBe('fits')
    expect(by(verdicts, 'D').warned).toEqual([])
  })

  /** A long thin tool that reaches is not penalised for being long: if it is needed, it is needed. */
  it('does not demote a long tool that fits', () => {
    expect(standingOf(by(verdicts, 'E'))).toBe('fits')
    expect(by(verdicts, 'E').demoted).toEqual([])
  })

  /** Widest first, then the exact fillet radius, then the smaller radii. */
  it('ranks the tool that matches the feature’s own geometry first', () => {
    expect(orderVerdicts(verdicts).map((verdict) => verdict.tool.catalogNumber)).toEqual([
      'D',
      'A',
      'B',
      'E',
    ])
    expect(standingOf(by(verdicts, 'A'))).toBe('fits')
    expect(by(verdicts, 'A').readings).toEqual([
      'bull nose end mill',
      'corner radius 1.50 = floor fillet radius',
      'diameter 9.50, 0.50 under largest tool diameter',
      'L/D 2.50',
    ])
    expect(by(verdicts, 'B').readings[1]).toBe('corner radius 1, 0.50 under floor fillet radius')
  })
})

describe('the tool’s own body against the part', () => {
  /**
   * A pocket 20 deep whose wall runs 28 above its floor — the part top. A
   * full shank with 22 mm of flute rubs that wall for 6 mm above the flutes
   * at every stickout: Paul's call (2026-08-30) is that such a tool is not
   * compatible and is not shown. A reduced shank whose neck runs to a 30 mm
   * shoulder clears it. Built into the judge beside the type table, because
   * no row can sweep.
   */
  const stepped = pocket({}) as unknown as { datasheet: Record<string, unknown> }
  stepped.datasheet.reachCurve = { horizontalOffset: [0, 5, 30], verticalOffset: [28, 28, 28] }
  const feature = stepped as unknown as PartFeature

  it('removes a tool whose shank rubs the wall above the flutes, and says what would clear it', () => {
    const full = bull('FULL', 9.5, 1.5, 22, 2.5)
    const [verdict] = judgeTools([full], feature, [feature])
    expect(standingOf(verdict!)).toBe('removed')
    expect(verdict!.removed[0]?.text).toContain('shank rubs the wall above the flutes by 6.51')
    expect(verdict!.removed[0]?.text).toContain('longer flutes or a reduced shank would')
    expect(verdict!.removed[0]?.shortfall).toBeCloseTo(6.508 / 28.508, 6)
  })

  it('keeps a reduced shank whose shoulder is past the wall', () => {
    const necked = tool('NECK', 'bull nose end mill', {
      DC: 9.5,
      RE: 1.5,
      LCF: 22,
      LD: 3.2,
      LBH: 30,
      'shoulder-diameter': 8,
      'shoulder-length': 30,
      SFDM: 10,
    })
    const [verdict] = judgeTools([necked], feature, [feature])
    expect(standingOf(verdict!)).toBe('fits')
  })

  /**
   * The wall stands half a millimetre out from the cut. A shank as wide as
   * the cut meets it only by the room the sheet wants kept sideways: with
   * the radial holder clearance at 0.1 mm the shank is inside the gap; at
   * the sheet's 0.508 it is not. The card's entered clearance is what the
   * judge sweeps by, through `knobsWith`.
   */
  it('sweeps by the radial clearance, the card’s or the sheet’s', () => {
    const ledge = pocket({}) as unknown as { datasheet: Record<string, unknown> }
    ledge.datasheet.reachCurve = {
      horizontalOffset: [0, 0.2, 0.5, 30],
      verticalOffset: [20, 20, 28, 28],
    }
    const stepped = ledge as unknown as PartFeature
    const full = bull('FULL', 9.5, 1.5, 22, 2.5)
    const [wide] = judgeTools([full], stepped, [stepped])
    expect(standingOf(wide!)).toBe('removed')
    const [narrow] = judgeTools([full], stepped, [stepped], {
      knobs: knobsWith({ 'radial holder clearance': 0.1, 'axial holder clearance': 0 }),
    })
    expect(standingOf(narrow!)).toBe('fits')
  })

  /** Without a curve nothing is known about the wall: the sweep stands down. */
  it('stands down without a reach curve', () => {
    const [verdict] = judgeTools([bull('FULL', 9.5, 1.5, 22, 2.5)], pocket(), [pocket()])
    expect(standingOf(verdict!)).toBe('fits')
  })
})

describe('closest to eligible', () => {
  const verdicts = judgeTools(TOOLS, pocket(), [pocket()])

  /** C missed the flutes by a millimetre in twenty; F is a fifth too wide, G's nose a third too big, I sixty per cent too wide; H is the wrong kind, not close. */
  it('ranks the removed by their worst miss, nearest first, and leaves out the wrong kind', () => {
    expect(closestMisses(verdicts, 5).map((verdict) => verdict.tool.catalogNumber)).toEqual([
      'C',
      'F',
      'G',
      'I',
    ])
    expect(by(verdicts, 'C').removed[0]?.shortfall).toBeCloseTo(0.05, 6)
    const drill = tool('Z', 'drill', { DC: 8, LCF: 30, LD: 4, SIG: 118 })
    expect(closestMisses(judgeTools([drill], pocket(), [pocket()]), 5)).toEqual([])
  })
})

describe('standing down', () => {
  it('does not judge a number nobody stated, on either side', () => {
    const knobs = parseKnobs('knob,value,unit,note\n').knobs
    const { rules } = parseRules(
      [
        'feature,when,tool types,for,rule,level,note',
        '*,,*,,tip angle <= tip angle,must,',
        '*,,*,,corner radius <= floor fillet radius,must,',
      ].join('\n'),
      knobs,
    )
    const noTip = tool('N', 'bull nose end mill', { DC: 6, RE: 3, LCF: 10 })
    const [verdict] = judgeTools([noTip], pocket({ filletRadius: undefined }), [pocket()], {
      rules,
      knobs,
    })
    expect(verdict!.removed).toEqual([])
  })
})

describe('ordering and folding', () => {
  it('compares keys left to right, missing components last', () => {
    expect(compareKeys([1, 5], [1, 2])).toBe(1)
    expect(compareKeys([0], [0, 1])).toBe(1)
    expect(compareKeys([2], [2])).toBe(0)
  })

  it('folds several features: removed by any, warned by any, ordered by the first', () => {
    const shallow = pocket()
    const deep = pocket({})
    ;(deep as { datasheet: { zMin: number } }).datasheet.zMin = -30
    const folded = foldVerdicts([
      judgeTools([A, B], shallow, [shallow]),
      judgeTools([A, B], deep, [deep]),
    ])
    expect(standingOf(folded[0]!)).toBe('removed')
    expect(folded[0]!.removed[0]?.text).toContain('flute length 22 under 30')
    expect(standingOf(folded[1]!)).toBe('removed')
  })
})

describe('the order a hole puts its drills in', () => {
  const hole = {
    featureTag: 'hole-1',
    featureType: 'BlindHole',
    machiningDirection: { x: 0, y: 0, z: 1 },
    regionIdxs: [1],
    datasheet: {
      zMin: -20,
      zMax: 0,
      extendedZMax: 0,
      facts: { kind: 'Hole', diameter: 6, fullConeDeg: 118, hasPointedBottom: true },
    },
  } as unknown as PartFeature

  const drill = (catalogNumber: string, DC: number): CatalogTool =>
    ({
      guid: catalogNumber,
      catalogNumber,
      brand: 'Kennametal',
      form: 'drill',
      toolType: 'drill',
      unitSystem: 'metric',
      geometry: { DC, LCF: 40, OAL: 80, SFDM: 6, LD: 3, SIG: 118 },
      materialGroups: [],
      productLink: null,
      provenance: {},
    }) as unknown as CatalogTool

  /**
   * A hole is made at its own size, so nearest-to-the-bore leads — the 5 %
   * under rule is what a pocket corner wants, not a drill (Paul, 2026-08-31:
   * "exact match drills should be shown at the top of the list").
   */
  it('leads with the drill that is exactly the bore', () => {
    const order = orderVerdicts(
      judgeTools([drill('UNDER', 5.95), drill('EXACT', 6), drill('OVER', 6.05)], hole, [hole]),
    )

    expect(order[0]?.tool.catalogNumber).toBe('EXACT')
  })
})
