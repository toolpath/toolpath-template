import { describe, expect, it } from 'vitest'
import { dimensionsFromProfile, withMeasuredDimensions } from './profiles.js'
import type { HolderProfile } from './profiles.js'
import type { Holder } from './toolholding.js'

/**
 * A BT30 collet chuck as its own model measures it, cut down to the shape that
 * matters: a slim nose the whole way up, then the flange.
 *
 * `belowGageLine` reads a `gage-line` profile with **`z = 0` at the spindle
 * face and the nose at the last vertex**, so heights above the nose count
 * backwards from the gauge length. Getting that the wrong way up derives a nose
 * diameter from the flange, which is a holder that clears nothing.
 */
const chuck = (points: Array<readonly [number, number]>): HolderProfile =>
  ({
    guid: 'holder-a',
    catalogNumber: 'BT30-ER11-110DT',
    datum: 'gage-line',
    points,
    complete: true,
    shortfallMm: null,
  }) as unknown as HolderProfile

/** z ascends toward the nose at z = 110; radii, not diameters. */
const REAL = chuck([
  [0, 22.96], // the flange, at the spindle face
  [22, 22.96],
  [22.05, 9.58], // steps down to the slim body
  [84.9, 9.58],
  [98, 9.58],
  [109.34, 9.53], // the collet nut
  [109.9, 7.5],
  [110, 7.32], // the nose face
])

/** The width the reduced model claims at a height above the nose, in mm. */
const widthAt = (
  made: NonNullable<ReturnType<typeof dimensionsFromProfile>>,
  height: number,
): number =>
  height >= made.projection
    ? made.flangeDiameter
    : height >= made.noseLength
      ? made.bodyDiameter
      : made.noseDiameter

describe('reducing a measured holder to the layers a sweep reads', () => {
  it('reads the flange off the flange end', () => {
    const made = dimensionsFromProfile(REAL)
    expect(made).not.toBeNull()
    expect(made!.flangeDiameter).toBeCloseTo(45.92, 1)
  })

  /**
   * The defect in the terms somebody sees it in: the holder is slim for its
   * whole reach, and modelling it as flange-wide near the tip is what made a
   * two-inch pocket unreachable and drew the holder inside the part.
   */
  it('is slim where the holder is slim, all the way up to the flange', () => {
    const made = dimensionsFromProfile(REAL)!
    for (const height of [1, 10, 50, 87]) {
      expect(widthAt(made, height)).toBeCloseTo(19.16, 1)
    }
    expect(widthAt(made, 89)).toBeCloseTo(45.92, 1)
  })

  it('puts the flange where the holder actually steps out', () => {
    const made = dimensionsFromProfile(REAL)
    // 110 - 22 = 88 mm above the nose.
    expect(made!.projection).toBeCloseTo(88, 0)
  })

  /**
   * The chamfer off a collet nut's own face is a fraction of a millimetre. A
   * boundary that splits there makes the band above it the whole holder — the
   * defect this test exists for: Ø45 from a tenth of a millimetre above the tip.
   */
  it('does not mistake the chamfer off the nut for the whole holder', () => {
    const made = dimensionsFromProfile(REAL)!
    // Whatever the bands are called, nothing below the flange is flange-wide.
    for (const height of [0.7, 5, 40, 80]) {
      expect(widthAt(made, height)).toBeLessThan(made.flangeDiameter - 1)
    }
  })

  /**
   * The safety property. Three bands cannot describe forty steps, so each band
   * takes the widest radius in it: a reduction may claim the holder is fatter
   * than it is, never thinner. Thinner puts a holder through a wall and calls
   * it clear.
   */
  it('never states a band narrower than the model is anywhere in it', () => {
    const made = dimensionsFromProfile(REAL)!
    const noseZ = 110
    for (const [z, r] of REAL.points) {
      expect(widthAt(made, noseZ - z) / 2).toBeGreaterThanOrEqual(r - 1e-9)
    }
  })

  it('is nothing at all for a model of fewer than two vertices', () => {
    expect(dimensionsFromProfile(chuck([[0, 10]]))).toBeNull()
  })

  it('handles a holder that is one width all the way up', () => {
    const made = dimensionsFromProfile(
      chuck([
        [0, 10],
        [50, 10],
        [110, 10],
      ]),
    )
    expect(made!.noseDiameter).toBeCloseTo(20, 5)
    expect(made!.flangeDiameter).toBeCloseTo(20, 5)
  })
})

const record = (over: Partial<Holder>): Holder =>
  ({
    guid: 'holder-a',
    familyId: 'maritool-bt30',
    brand: 'MariTool',
    vendor: 'MariTool',
    catalogNumber: 'BT30-ER11-110DT',
    materialNumber: null,
    taper: 'BT30',
    contact: 'taper',
    clamping: 'collet',
    colletSeries: 'ER11',
    boreDiameter: null,
    gaugeLength: 110,
    noseDiameter: null,
    noseLength: null,
    bodyDiameter: null,
    bodyLength: null,
    projection: null,
    flangeDiameter: null,
    colletProtrusion: null,
    productLink: null,
    cadModelUrl: null,
    provenance: { gaugeLength: 'vendor-stated' },
    ...over,
  }) as Holder

describe('filling what a vendor did not publish', () => {
  it('fills the silence and says the numbers are derived', () => {
    const filled = withMeasuredDimensions(record({}), REAL)
    expect(filled.noseDiameter).not.toBeNull()
    expect(filled.flangeDiameter).toBeCloseTo(45.92, 1)
    expect(filled.provenance['noseDiameter']).toBe('derived')
    expect(filled.provenance['flangeDiameter']).toBe('derived')
  })

  /** A number the vendor published is that vendor's claim, whatever the model says. */
  it('leaves a stated number exactly as the vendor stated it', () => {
    const filled = withMeasuredDimensions(record({ noseDiameter: 30 }), REAL)
    expect(filled.noseDiameter).toBe(30)
    expect(filled.provenance['noseDiameter']).toBeUndefined()
  })

  it('leaves a holder nobody measured exactly as it was', () => {
    const bare = record({})
    expect(withMeasuredDimensions(bare, null)).toBe(bare)
  })

  it('keeps the identity and the vendor fields untouched', () => {
    const filled = withMeasuredDimensions(record({}), REAL)
    expect(filled.guid).toBe('holder-a')
    expect(filled.gaugeLength).toBe(110)
    expect(filled.provenance['gaugeLength']).toBe('vendor-stated')
  })
})
