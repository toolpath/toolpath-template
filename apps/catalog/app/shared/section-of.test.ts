import { describe, expect, it } from 'vitest'
import type { PartFeature } from '@toolpath/part-contracts'
import { sectionOf } from './section-of'

const feature = (datasheet: Record<string, unknown>, featureType = 'Pocket'): PartFeature =>
  ({
    featureTag: 'f',
    featureType,
    machiningDirection: { x: 0, y: 0, z: 1 },
    regionIdxs: [],
    datasheet,
  }) as unknown as PartFeature

describe('reading a section off the datasheet', () => {
  it('reads a pocket: depth, tightest width, fillet, floor, and the reach curve', () => {
    const curve = { horizontalOffset: [0, 5], verticalOffset: [12, 20] }
    const pocket = feature({
      zMin: -12,
      zMax: 0,
      extendedZMax: 0,
      hasFloor: true,
      hasWall: true,
      facts: { kind: 'Pocket', cd: { ignore: { min: 10, max: 14 } }, filletRadius: 1.5 },
      reachCurve: curve,
    })
    const top = feature({ zMin: -2, zMax: 8, extendedZMax: 8, facts: { kind: 'Face' } }, 'Face')
    expect(sectionOf(pocket, [pocket, top])).toEqual({
      kind: 'pocket',
      depth: 12,
      hasFloor: true,
      width: 10,
      filletRadius: 1.5,
      coneDeg: null,
      topAbove: 20,
      curve,
    })
  })

  it('reads a hole by its diameter and cone, a wall as open, a face as the floor', () => {
    const hole = feature(
      {
        zMin: -20,
        zMax: 0,
        extendedZMax: 0,
        facts: { kind: 'Hole', diameter: 8, fullConeDeg: 118 },
      },
      'BlindHole',
    )
    expect(sectionOf(hole, [hole])).toMatchObject({ kind: 'hole', width: 8, coneDeg: 118 })
    const wall = feature(
      {
        zMin: -25,
        zMax: 0,
        extendedZMax: 0,
        hasFloor: false,
        facts: { kind: 'Wall', cd: { ignore: { min: null } } },
      },
      'Wall',
    )
    expect(sectionOf(wall, [wall])).toMatchObject({ kind: 'wall', width: null, hasFloor: false })
    const face = feature(
      {
        zMin: 0,
        zMax: 0,
        extendedZMax: 0,
        hasFloor: true,
        hasWall: false,
        facts: { kind: 'Face' },
      },
      'Face',
    )
    expect(sectionOf(face, [face])).toMatchObject({ kind: 'face', depth: 0 })
  })

  /** The cube fixture is a 0.3.0 report: the same facts by older names. */
  it('reads a 0.3.0 report’s depths and depth variation as the section and the curve', () => {
    const old = feature(
      {
        minDepth: 0,
        maxDepth: 50.8,
        extendedMaxDepth: 50.8,
        hasFloor: false,
        hasWall: true,
        depthVariation: { deltaX: [0.508, 101.6], deltaY: [50.8, 50.8] },
        facts: { kind: 'Profile', cd: { ignore: { min: null, max: null } } },
      },
      'Profile',
    )
    expect(sectionOf(old, [old])).toMatchObject({
      kind: 'wall',
      depth: 50.8,
      hasFloor: false,
      curve: { horizontalOffset: [0.508, 101.6], verticalOffset: [50.8, 50.8] },
    })
  })

  it('is nothing without a datasheet or a depth', () => {
    expect(sectionOf(feature({}), [])).toBeNull()
  })
})
