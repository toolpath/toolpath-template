import { describe, expect, it } from 'vitest'
import {
  clearance,
  describeCollision,
  heightAt,
  holderSilhouette,
  toolSilhouette,
  toolCollisions,
} from './clearance.js'
import type { Assembly, Collet, Holder } from './toolholding.js'
import type { CatalogTool } from './types.js'

/**
 * A pocket 12 mm deep with its own wall at the cut, and a boss 8 mm out
 * standing 30 mm above the pocket floor — the worked example from the Engine's
 * own reach-curve documentation.
 */
const curve = { horizontalOffset: [0, 2, 8, 15], verticalOffset: [12, 12, 30, 30] }

const tool = (over: Partial<CatalogTool['geometry']> = {}): CatalogTool => ({
  guid: 't',
  familyId: 'f',
  brand: 'WIDIA',
  vendor: 'Kennametal',
  catalogNumber: 'TDMX0600',
  materialNumber: null,
  toolType: 'endmill',
  form: 'flat end mill',
  unitSystem: 'metric',
  geometry: { DC: 6, LCF: 13, OAL: 57, SFDM: 6, ...over },
  materialGroups: ['P'],
  productLine: null,
  productLink: null,
  provenance: {},
})

const holder = (noseDiameter: number | null): Holder => ({
  guid: 'h',
  familyId: 'bt30',
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
  noseDiameter,
  noseLength: null,
  bodyDiameter: null,
  bodyLength: null,
  projection: null,
  flangeDiameter: null,
  colletProtrusion: null,
  productLink: null,
  cadModelUrl: null,
  provenance: {},
})

const collet: Collet = {
  guid: 'c',
  familyId: 'er16',
  brand: 'Kennametal',
  vendor: 'Kennametal',
  catalogNumber: 'ER16-6',
  materialNumber: null,
  series: 'ER16',
  clampMin: 5,
  clampMax: 6,
  clampLength: 18,
  productLink: null,
  provenance: {},
}

const assembly = (stickout: number | null, nose: number | null = 28, over = {}): Assembly => ({
  tool: tool(over),
  holder: holder(nose),
  collet,
  stickout,
  maxStickout: stickout,
})

describe('the tallest material within a distance of the cut', () => {
  it('reads the step function conservatively: the next knot out bounds the gap between knots', () => {
    expect(heightAt(curve, 0)).toBe(12)
    expect(heightAt(curve, 2)).toBe(12)
    // Between 2 and 8 the boss could start anywhere: within 8 it rises to 30.
    expect(heightAt(curve, 5)).toBe(30)
    expect(heightAt(curve, 8)).toBe(30)
  })

  it('clamps past the last knot', () => {
    expect(heightAt(curve, 40)).toBe(30)
  })
})

describe('an assembly against a reach curve', () => {
  /** Ø28 nut at 25 mm: 11 mm past the edge, where the boss stands 30 mm. */
  it('catches a holder nose that meets the boss', () => {
    const result = clearance(assembly(25), curve)

    expect(result.clears).toBe(false)
    expect(result.requiredStickout).toBe(30)
    expect(result.collisions.map(describeCollision)).toEqual([
      'the holder nose at 25.0 mm collides with material 30.0 mm tall, 11.0 mm out from the cut',
    ])
  })

  it('clears once the nose stands off far enough', () => {
    const result = clearance(assembly(30), curve)

    expect(result.clears).toBe(true)
    expect(result.checked).toEqual(['shank', 'nose'])
  })

  /** Same diameter as the cut: the shank is the wall, which the flutes cut. */
  it('does not check a shank no wider than the cut', () => {
    expect(clearance(assembly(30), curve).collisions).toEqual([])
  })

  /** A Ø6 cutter on a Ø10 shank with 13 mm of flute: the shank meets the 12 mm wall at offset 2. */
  it('catches a shank wider than the cut that starts below the wall', () => {
    const result = clearance(assembly(40, 28, { SFDM: 10, LCF: 10 }), curve)

    expect(result.collisions.map((each) => each.part)).toEqual(['shank'])
    expect(result.collisions[0]).toMatchObject({ height: 10, needs: 12, offset: 2 })
  })

  /** A necked tool: the neck is checked from the end of the flutes, the shank from the shoulder. */
  it('reads a neck and a shoulder from what the vendor states', () => {
    const necked = tool({ 'shoulder-diameter': 5.6, 'shoulder-length': 32, SFDM: 10 })

    expect(toolSilhouette(necked)).toEqual([
      { part: 'neck', radius: 2.8, fromHeight: 13 },
      { part: 'shank', radius: 5, fromHeight: 32 },
    ])
    expect(clearance({ ...assembly(45), tool: necked }, curve).clears).toBe(true)
  })

  /** What nobody has said is not checked, and the result says what was. */
  it('checks no holder whose nose is unstated, and no holder at an unstated stickout', () => {
    const noNose = clearance(assembly(25, null), curve)
    expect(noNose.clears).toBe(true)
    expect(noNose.requiredStickout).toBeNull()
    expect(noNose.checked).toEqual(['shank'])

    const noStickout = clearance(assembly(null), curve)
    expect(noStickout.clears).toBe(true)
    expect(noStickout.requiredStickout).toBe(30)
    expect(noStickout.checked).toEqual(['shank'])
  })
})

describe('a holder as the body the vendor states', () => {
  /** REGO-FIX BT 30 / PG 6 x 050, as its DIN 4000 sheet states it. */
  const stated = (): Assembly => ({
    ...assembly(30, 10),
    holder: {
      ...holder(10),
      colletSeries: 'PG6',
      noseLength: 10.55,
      bodyDiameter: 12.02,
      bodyLength: 9.6,
      projection: 50,
      flangeDiameter: 46,
      colletProtrusion: 2.5,
    },
  })

  /**
   * **Cylinders, not cones** (Paul, 2026-08-31).
   *
   * There used to be a six-step cone between the body and the flange — a
   * shape no vendor publishes, swept as though it were solid. A silhouette
   * step is a radius *from a height upward*, so the body carries itself to
   * the flange with no step of its own, which is the layer model of Justin
   * Mimbs' reach-curve note.
   */
  it('sweeps the collet, the nose, the body and the flange, and nothing between', () => {
    const steps = holderSilhouette(stated(), 30)

    expect(steps).toEqual([
      { part: 'collet', radius: 3, fromHeight: 27.5 },
      { part: 'nose', radius: 5, fromHeight: 30 },
      { part: 'body', radius: 6.01, fromHeight: 40.55 },
      { part: 'flange', radius: 23, fromHeight: 80 },
    ])
  })

  /** The flange is 23 mm across from the axis; 8 mm out the boss stands 30 mm. At 30 mm stickout the flange sits at 80 — clear. */
  it('clears when every part of the body stands above the material at its offset', () => {
    expect(clearance(stated(), curve).clears).toBe(true)
  })

  /**
   * Material far out and very tall — a wall 15 mm from the cut standing 100 mm.
   * Nose and body are inside 15 mm and clear; the cone's outer steps and the
   * flange reach past it and meet the wall. The required stickout is set by
   * the cone's *sampled* step, which is wider than the cone is at that height
   * — the assumption refusing more than the true body would, never less.
   */
  /**
   * The flange is what meets a wall 15 mm out and 100 tall; the body, ⌀12.02,
   * is inside it. Nothing between them is swept any more, so the stickout the
   * stack needs is the flange's alone — 20 mm less than the cone asked for.
   */
  it('catches the flange, and says how far out the stack would have to go', () => {
    const wall = { horizontalOffset: [0, 15, 25], verticalOffset: [12, 12, 100] }
    const result = clearance(stated(), wall)

    expect(result.collisions.map((each) => each.part)).toEqual(['flange'])
    expect(result.requiredStickout).toBeCloseTo(50, 1)
  })

  it('falls back to the nose over the gauge length where no body is stated', () => {
    expect(holderSilhouette(assembly(30, 28), 30).map((each) => each.part)).toEqual(['nose'])
  })
})

describe('the room the shop wants kept', () => {
  /**
   * A 20 mm nose past a 6 mm cut stands 7 mm out from the edge, and everything
   * out to the knot at 8 is as tall as the boss: 30. At a 30 mm stickout the
   * nose clears by exactly nothing — until half a millimetre of axial room
   * asks for that much more, and the radial room, widening the nose to 7.5
   * out, still lands on the same boss.
   */
  it('widens the sweep radially and lifts it axially', () => {
    const stack: Assembly = {
      tool: tool(),
      holder: holder(20),
      collet: null,
      stickout: 30,
      maxStickout: null,
    }
    expect(clearance(stack, curve).clears).toBe(true)
    expect(clearance(stack, curve).requiredStickout).toBe(30)
    const room = clearance(stack, curve, { radial: 0.5, axial: 0.5 })
    expect(room.clears).toBe(false)
    expect(room.requiredStickout).toBe(30.5)
    expect(room.collisions[0]).toMatchObject({ part: 'nose', offset: 7.5, needs: 30.5 })
  })
})

describe('a stack stood out to exactly what it needs', () => {
  /**
   * From a fuzz over random reach curves (2026-08-30): the required stickout
   * put the collet a femtometre short of clearing, and the same sweep called
   * that a collision. The stack that was asked for is the stack that clears.
   */
  it('clears, whatever the arithmetic', () => {
    const chuck = { ...holder(16), colletSeries: 'PG10', colletProtrusion: 4 }
    const long = tool({ DC: 3.96875, SFDM: 6.35, OAL: 63.5, LCF: 5.953125 })
    const curve = { horizontalOffset: [0, 1.76, 6.86], verticalOffset: [3.81, 3.22, 7.07] }
    const room = { radial: 0.508, axial: 0.508 }
    const required = clearance(
      { tool: long, holder: chuck, collet: null, stickout: 0, maxStickout: null },
      curve,
      room,
    ).requiredStickout!
    expect(required).toBeCloseTo(11.578, 3)
    const at = clearance(
      { tool: long, holder: chuck, collet: null, stickout: required, maxStickout: null },
      curve,
      room,
    )
    expect(at.collisions).toEqual([])
    expect(at.clears).toBe(true)
  })

  /** A vendor's "shoulder" as wide as the cut is shank, and is swept and named as shank. */
  it('calls a full-width shoulder the shank, and a relief narrower than the shank a neck', () => {
    const plain = tool({ DC: 6, SFDM: 6, LCF: 12.7, 'shoulder-length': 15, 'shoulder-diameter': 6 })
    expect(toolSilhouette(plain).map((step) => step.part)).toEqual(['shank', 'shank'])
    const necked = tool({
      DC: 6,
      SFDM: 6,
      LCF: 12.7,
      'shoulder-length': 15,
      'shoulder-diameter': 5,
    })
    expect(toolSilhouette(necked).map((step) => step.part)).toEqual(['neck', 'shank'])
    // A relief at the cut's own diameter under a wider shank: a neck to the collet, no clearance to the wall.
    const relieved = tool({
      DC: 2.78,
      SFDM: 3.175,
      LCF: 9.5,
      'shoulder-length': 11.5,
      'shoulder-diameter': 2.78,
    })
    expect(toolSilhouette(relieved).map((step) => step.part)).toEqual(['neck', 'shank'])
  })
})

describe('the tool’s own body against the part', () => {
  /** A pocket 10 deep whose wall runs 14 above the floor from half a millimetre out. */
  const curve = { horizontalOffset: [0, 0.5, 30], verticalOffset: [10, 14, 14] }
  const room = { radial: 0.508, axial: 0.508 }

  it('finds a shank wider than the cut rubbing the wall above the flutes, at any stickout', () => {
    // ⌀2.36 on a ⌀3.175 shank: the shank stands 0.4 past the edge, 0.9 with the room wanted.
    expect(toolCollisions(tool({ DC: 2.36, LCF: 3.5, SFDM: 3.175, OAL: 38 }), curve, room)).toEqual(
      [{ part: 'shank', height: 3.5, needs: 14.508, offset: expect.closeTo(0.9155, 3) }],
    )
  })

  it('clears once the flutes reach past the wall, or the shank is inside the room', () => {
    expect(toolCollisions(tool({ DC: 2.36, LCF: 15, SFDM: 3.175, OAL: 50 }), curve, room)).toEqual(
      [],
    )
    // A full shank at the cut diameter stands past the edge only by the room wanted; where the curve says the wall is still the pocket's own that far out, it clears.
    const ledge = { horizontalOffset: [0, 0.3, 0.5, 30], verticalOffset: [10, 10, 14, 14] }
    expect(
      toolCollisions(tool({ DC: 3, LCF: 11, SFDM: 3, OAL: 50 }), ledge, { radial: 0.2, axial: 0 }),
    ).toEqual([])
    expect(
      toolCollisions(tool({ DC: 3, LCF: 11, SFDM: 3, OAL: 50 }), ledge, { radial: 0.4, axial: 0 }),
    ).toHaveLength(1)
  })

  it('has nothing to say without a cutting diameter', () => {
    expect(toolCollisions({ ...tool(), geometry: { LCF: 3, SFDM: 3 } }, curve, room)).toEqual([])
  })
})
