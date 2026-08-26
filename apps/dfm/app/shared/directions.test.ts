import { describe, expect, it } from 'vitest'

import type { PartFeature } from './contracts'
import {
  NO_TILT,
  alreadyHeld,
  angleBetween,
  axisOf,
  fromAxis,
  fromFaceNormal,
  matchingCandidate,
  perpendicularTo,
  rotatedBy,
  tilted,
  isAxisAligned,
} from './directions'

/**
 * Naming a way up the Engine did not offer.
 *
 * A shop knows orientations the analysis has no reason to propose — the way the
 * part sits in soft jaws, the tilt that brings a bore square to the spindle.
 * Three ways people say one: like that arrow, square to that face or bore, or
 * any of those turned by an angle.
 */

const UP = { x: 0, y: 0, z: 1 }
const RIGHT = { x: 1, y: 0, z: 0 }

const feature = (axis: { x: number; y: number; z: number } | null): PartFeature =>
  ({
    featureTag: 'f-1',
    featureType: 'through_hole',
    regionIdxs: [0],
    machiningDirection: UP,
    axis,
  }) as unknown as PartFeature

describe('saying a direction', () => {
  it("takes a face's normal as the way a tool comes down it", () => {
    // The two are the same vector, which is why picking a face is the most
    // direct way to name a way up.
    expect(fromFaceNormal({ x: 0, y: 0, z: 4 })).toEqual(UP)
  })

  it('gives an axis the sense the person is looking from', () => {
    // A bore's centreline points both ways, and half the picks would otherwise
    // name the way up *into* the part.
    expect(fromAxis({ x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 })).toEqual({
      x: -0,
      y: -0,
      z: -1,
    })
    expect(fromAxis({ x: 0, y: 0, z: 1 }, UP)).toEqual(UP)
  })

  it("reads a bore's axis off the feature", () => {
    expect(axisOf(feature({ x: 0, y: 2, z: 0 }))).toEqual({ x: 0, y: 1, z: 0 })
    expect(axisOf(feature(null))).toBeNull()
  })

  it('refuses a vector too short to be a direction', () => {
    expect(fromFaceNormal({ x: 0, y: 0, z: 0 })).toBeNull()
  })
})

describe('turning one by an angle', () => {
  it('tilts away from where it started, with no hinge named', () => {
    const swung = rotatedBy(UP, 10)

    expect(swung).not.toBeNull()
    expect(angleBetween(UP, swung!)).toBeCloseTo(10, 6)
  })

  it('turns about a named hinge', () => {
    // +Z turned 90° about +X lands on −Y, which is the check that says the
    // rotation is the one a person would draw.
    const turned = rotatedBy(UP, 90, RIGHT)

    expect(turned?.x).toBeCloseTo(0, 6)
    expect(turned?.y).toBeCloseTo(-1, 6)
    expect(turned?.z).toBeCloseTo(0, 6)
  })

  it('leaves a direction alone at zero', () => {
    expect(angleBetween(UP, rotatedBy(UP, 0)!)).toBeCloseTo(0, 6)
  })

  it('hinges on something genuinely perpendicular, whatever the direction', () => {
    for (const direction of [UP, RIGHT, { x: 0.577, y: 0.577, z: 0.577 }]) {
      expect(angleBetween(direction, perpendicularTo(direction))).toBeCloseTo(90, 4)
    }
  })
})

describe('whether a said direction is one the Engine already knows', () => {
  const candidates = [UP, RIGHT, { x: 0, y: 1, z: 0 }]

  it('matches one that is the same way up within a degree', () => {
    // A normal read off a mesh carries rounding, and the Engine's own vectors
    // are rounded when printed — an exact match would never happen.
    expect(matchingCandidate(candidates, { x: 0.001, y: 0, z: 0.9999 })).toBe(0)
  })

  it('says so when it is a genuinely new way up', () => {
    expect(matchingCandidate(candidates, rotatedBy(UP, 30)!)).toBeNull()
  })

  it('knows a way up already held, however it was said', () => {
    expect(alreadyHeld([UP], { x: 0, y: 0, z: 1 })).toBe(true)
    expect(alreadyHeld([UP], rotatedBy(UP, 30)!)).toBe(false)
  })
})

describe('tilting about each axis in turn', () => {
  it('turns +Z ninety degrees about X onto −Y', () => {
    const turned = tilted(UP, { x: 90, y: 0, z: 0 })

    expect(turned?.y).toBeCloseTo(-1, 6)
  })

  it('leaves a direction alone with nothing entered', () => {
    expect(tilted(UP, NO_TILT)).toEqual(UP)
  })

  it('applies X, then Y, then Z', () => {
    /*
     * Stated because rotations do not commute: the same three numbers in
     * another order name a different way up, and somebody dragging one handle
     * has to see that handle move the arrow.
     */
    const both = tilted(UP, { x: 90, y: 90, z: 0 })
    const swapped = tilted(tilted(UP, { x: 0, y: 90, z: 0 })!, { x: 90, y: 0, z: 0 })

    expect(both?.x).not.toBeCloseTo(swapped?.x ?? 0, 3)
  })
})

describe('an ordinary way up', () => {
  it('knows the six a part sits square in the vice for', () => {
    for (const axis of [
      { x: 1, y: 0, z: 0 },
      { x: -1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: -1, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: -1 },
    ]) {
      expect(isAxisAligned(axis)).toBe(true)
    }
  })

  it('says no to one that wants a fifth axis or a fixture', () => {
    expect(isAxisAligned({ x: -0.33, y: 0, z: 0.95 })).toBe(false)
    expect(isAxisAligned({ x: 0.577, y: 0.577, z: 0.577 })).toBe(false)
  })

  it('forgives the rounding a printed vector carries', () => {
    // A normal read off a mesh and a vector the Engine rounded are both a
    // fraction of a degree from the axis they plainly are.
    expect(isAxisAligned({ x: 0.0001, y: 0, z: 0.99999 })).toBe(true)
  })
})
