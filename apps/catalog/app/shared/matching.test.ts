import { describe, expect, it } from 'vitest'
import type { PartFeature } from '@toolpath/part-contracts'
import type { CatalogTool } from '@toolpath/catalog-data'
import { standingOf } from './judge'
import { fittingTools } from './tool-fit'

/**
 * The matching, as it behaves — one case per kind of feature.
 *
 * Paul's word on 2026-08-30: "tool matching is working pretty well right now
 * so let's make sure we keep the behavior." These tests are that promise. They
 * are deliberately whole-answer rather than one rule at a time: the order and
 * the standing of every tool, for a fixed crib against a fixed feature. A
 * change to a sheet row, a knob, the standing precedence, or the judge shows
 * up here as a named tool moving, which is exactly the review anybody would
 * want before the list changes under a machinist.
 *
 * `judge.test.ts` covers the rules one at a time and says why each exists.
 * This file says what they add up to. When a change here is intended, read the
 * diff as the release note it is.
 */

const tool = (
  catalogNumber: string,
  form: string,
  geometry: Record<string, number>,
  brand = 'Kennametal',
): CatalogTool =>
  ({
    guid: catalogNumber,
    catalogNumber,
    brand,
    vendor: brand,
    form,
    toolType:
      form === 'drill' || form === 'spot drill'
        ? 'drill'
        : form.includes('tap')
          ? 'tap'
          : 'endmill',
    unitSystem: 'metric',
    geometry: {
      SFDM: geometry.DC ?? 6,
      OAL: 90,
      'shoulder-diameter': geometry.DC ?? 6,
      ...geometry,
    },
    materialGroups: [],
    productLink: null,
    provenance: {},
  }) as unknown as CatalogTool

/**
 * One crib, judged against every feature below: three flat end mills, three
 * bull noses (one with the fillet's own radius, one a hair over, one nearly
 * sharp), two balls, two drills, a spot drill, a tap, a chamfer mill, and a
 * reduced-shank tool with a real relief.
 */
const CRIB: ReadonlyArray<CatalogTool> = [
  tool('FLAT-6', 'flat end mill', { DC: 6, RE: 0, LCF: 24, LD: 4, NOF: 4 }),
  tool('FLAT-8', 'flat end mill', { DC: 8, RE: 0, LCF: 30, LD: 3.8, NOF: 4 }),
  tool('FLAT-10', 'flat end mill', { DC: 10, RE: 0, LCF: 32, LD: 3.2, NOF: 4 }),
  tool('BULL-8-R1', 'bull nose end mill', { DC: 8, RE: 1, LCF: 30, LD: 3.8, NOF: 4 }),
  tool('BULL-9.5-R1.5', 'bull nose end mill', { DC: 9.5, RE: 1.5, LCF: 30, LD: 3.2, NOF: 4 }),
  tool('BULL-10-R0.5', 'bull nose end mill', { DC: 10, RE: 0.5, LCF: 32, LD: 3.2, NOF: 4 }),
  tool('BALL-6', 'ball end mill', { DC: 6, RE: 3, LCF: 24, LD: 4, NOF: 2 }),
  tool('BALL-8', 'ball end mill', { DC: 8, RE: 4, LCF: 30, LD: 3.8, NOF: 2 }),
  tool('DRILL-8', 'drill', { DC: 8, LCF: 40, LD: 5, SIG: 140 }),
  tool('DRILL-10', 'drill', { DC: 10, LCF: 45, LD: 4.5, SIG: 140 }),
  tool('SPOT-10', 'spot drill', { DC: 10, LCF: 12, LD: 1.2, SIG: 90 }),
  tool('TAP-M8', 'tap right hand', { DC: 8, LCF: 20, LD: 2.5 }),
  tool('CHAMFER-10', 'chamfer mill', { DC: 10, LCF: 10, LD: 1, SIG: 90 }),
  tool('NECK-6', 'bull nose end mill', {
    DC: 6,
    RE: 0.5,
    LCF: 12,
    LD: 5,
    SFDM: 8,
    'shoulder-diameter': 5.6,
    'shoulder-length': 30,
  }),
]

const feature = (featureType: string, facts: Record<string, unknown>, depth = 12): PartFeature =>
  ({
    featureTag: `${featureType}-1`,
    featureType,
    machiningDirection: { x: 0, y: 0, z: 1 },
    regionIdxs: [1],
    datasheet: { zMin: -depth, zMax: 0, extendedZMax: 0, facts },
  }) as unknown as PartFeature

/** What the list shows, top to bottom: each tool with the standing beside it. */
const listFor = (subject: PartFeature): Array<string> =>
  fittingTools([subject], [subject], CRIB).fitting.map(
    (verdict) => `${verdict.tool.catalogNumber} ${standingOf(verdict)}`,
  )

/** Why each tool is out, by the first rule that removed it. */
const outFor = (subject: PartFeature): Record<string, string> =>
  Object.fromEntries(
    fittingTools([subject], [subject], CRIB).excluded.map((verdict) => [
      verdict.tool.catalogNumber,
      verdict.removed[0]?.text.split(' — ')[0] ?? '',
    ]),
  )

describe('a filleted pocket', () => {
  const pocket = feature('FilletedPocket', {
    kind: 'Pocket',
    filletRadius: 1,
    cd: { ignore: { min: 10, max: 14 } },
    hasFloor: true,
    hasWall: true,
  })

  /**
   * The exact fillet match leads, then the smaller radii; a ball is usable and
   * ranked last; a tool at the tightest corner is warned rather than first.
   */
  it('leads with the bull nose whose nose is the fillet, and ranks the balls last', () => {
    expect(listFor(pocket)).toEqual([
      'BULL-8-R1 fits',
      'NECK-6 fits',
      'BALL-6 fits',
      'BALL-8 fits',
      'BULL-10-R0.5 warned',
    ])
  })

  /** Terminal finishing: no flat end on a filleted floor, and no nose bigger than the fillet. */
  it('removes every flat end and any nose over the fillet', () => {
    const out = outFor(pocket)
    expect(out['FLAT-6']).toContain('form is flat end mill, wanted not flat end mill')
    expect(out['BULL-9.5-R1.5']).toContain('corner radius 1.50 over 1 floor fillet radius')
    expect(out['DRILL-8']).toContain('drill is not a type this feature considers')
  })
})

describe('a pocket with a sharp floor', () => {
  const pocket = feature('Pocket', {
    kind: 'Pocket',
    filletRadius: 0,
    cd: { ignore: { min: 10, max: 14 } },
    hasFloor: true,
    hasWall: true,
  })

  /**
   * A sharp floor wants a flat end, nearest to 5 % under the tightest corner:
   * ⌀8 before ⌀6, and ⌀10 — on the corner — warned rather than first. Every
   * bull nose is warned, because its nose leaves a radius the model draws
   * sharp; a ball is not a type this feature considers.
   */
  it('leads with the flat ends and warns what leaves a radius', () => {
    expect(listFor(pocket)).toEqual([
      'FLAT-8 fits',
      'FLAT-6 fits',
      'FLAT-10 warned',
      'BULL-9.5-R1.5 warned',
      'BULL-10-R0.5 warned',
      'BULL-8-R1 warned',
      'NECK-6 warned',
    ])
    expect(outFor(pocket)['BALL-8']).toContain('ball end mill is not a type this feature considers')
  })
})

describe('a hole', () => {
  const pointed = feature('BlindHole', {
    kind: 'Hole',
    diameter: 8,
    fullConeDeg: 140,
    cd: { ignore: { min: 8, max: 8 } },
  })
  const flatBottomed = feature('BlindHole', {
    kind: 'Hole',
    diameter: 10,
    fullConeDeg: 180,
    cd: { ignore: { min: 10, max: 10 } },
  })
  const through = feature('ThroughHole', {
    kind: 'Hole',
    diameter: 8,
    cd: { ignore: { min: 8, max: 8 } },
  })

  /** A drill is preferred on a pointed blind hole; the mills that could bore it are demoted or warned. */
  it('prefers the drill on a pointed blind hole', () => {
    expect(listFor(pointed)).toEqual([
      'DRILL-8 fits',
      'FLAT-6 demoted',
      'BALL-6 demoted',
      'FLAT-8 warned',
      'BULL-8-R1 warned',
      'NECK-6 warned',
      'BALL-8 warned',
    ])
  })

  /**
   * And on a through hole, where the flutes must also carry the overcut —
   * measured **below the tool's corner**, because that is what has to clear
   * the far side (Justin Mimbs' reach-curve note, 2026-08-31). NECK-6 is a
   * bull nose with a 0.5 radius on 12 of flute, so it is 11.50 below the
   * corner — short of the 12.13 the far side asks for by its radius as much
   * as by the overcut. A flat end of the same length reads its whole 12.
   */
  it('prefers the drill through, and wants the flutes past the far side', () => {
    expect(listFor(through)).toEqual([
      'DRILL-8 fits',
      'FLAT-6 demoted',
      'BALL-6 demoted',
      'FLAT-8 warned',
      'BULL-8-R1 warned',
      'BALL-8 warned',
    ])
    expect(outFor(through)['NECK-6']).toContain(
      'flute length past the corner 11.50 under 12.13 (feature depth + through overcut)',
    )
  })

  /** A flat bottom is bored, never drilled: a pointed drill cannot leave it flat. */
  it('removes every pointed drill from a flat-bottomed hole', () => {
    const out = outFor(flatBottomed)
    expect(out['DRILL-10']).toContain('tip angle 140 is not 180')
    expect(out['DRILL-8']).toContain('diameter 8 under 9.90 (hole diameter − drill undersize)')
    expect(listFor(flatBottomed)[0]).toBe('FLAT-8 fits')
  })
})

describe('the faces and the surfaces', () => {
  const face = feature(
    'Face',
    { kind: 'Face', cd: { ignore: { min: 10, max: 25 } }, hasFloor: true },
    1,
  )
  const wall = feature('Wall', {
    kind: 'Wall',
    cd: { ignore: { min: 10, max: 14 } },
    hasWall: true,
  })
  const contour = feature('ContourSurface', {
    kind: 'Surface',
    cd: { ignore: { min: 8, max: 12 } },
  })

  /** A face is cut by anything flat-ish; a ball is not preferred, and the tools on the corner are warned. */
  it('demotes a ball on a face and warns the tools on the corner', () => {
    expect(listFor(face)).toEqual([
      'BULL-9.5-R1.5 fits',
      'FLAT-8 fits',
      'BULL-8-R1 fits',
      'FLAT-6 fits',
      'NECK-6 fits',
      'BALL-8 demoted',
      'BALL-6 demoted',
      'FLAT-10 warned',
      'BULL-10-R0.5 warned',
    ])
  })

  /** A wall is cut by the side of the tool: nothing about the floor applies. */
  it('leads a wall with the flat ends, nearest under the corner', () => {
    expect(listFor(wall)).toEqual([
      'FLAT-8 fits',
      'FLAT-6 fits',
      'BULL-9.5-R1.5 fits',
      'BULL-8-R1 fits',
      'NECK-6 fits',
      'FLAT-10 warned',
      'BULL-10-R0.5 warned',
    ])
  })

  /** A 3D surface is finished by a round tool: a flat end is removed, not warned. */
  it('removes every flat end from a contoured surface', () => {
    expect(listFor(contour)).toEqual([
      'NECK-6 fits',
      'BALL-6 fits',
      'BULL-8-R1 warned',
      'BALL-8 warned',
    ])
    expect(outFor(contour)['FLAT-6']).toContain('form is flat end mill, wanted not flat end mill')
  })
})
