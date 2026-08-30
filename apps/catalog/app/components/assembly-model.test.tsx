import { describe, expect, it } from 'vitest'
import type { Assembly } from '@toolpath/catalog-data'
import { featureAnchor, latheProfiles, tipAt } from './assembly-model'

const assembly: Assembly = {
  tool: {
    guid: 't',
    familyId: 'f',
    brand: 'WIDIA',
    vendor: 'Kennametal',
    catalogNumber: 'TDMX0600',
    materialNumber: null,
    toolType: 'endmill',
    form: 'flat end mill',
    unitSystem: 'metric',
    geometry: { DC: 6, LCF: 13, OAL: 57, SFDM: 6, LBH: 19 },
    materialGroups: ['P'],
    productLink: null,
    provenance: {},
  },
  holder: {
    guid: 'h',
    familyId: 'bt30',
    brand: 'Kennametal',
    vendor: 'Kennametal',
    catalogNumber: 'BT30ER20070M',
    materialNumber: null,
    taper: 'BT30',
    contact: null,
    clamping: 'collet',
    gaugeLength: 70,
    colletSeries: 'ER20',
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
  },
  collet: null,
  stickout: 25,
  maxStickout: null,
}

describe('the assembly as lathe profiles', () => {
  /** Every segment of the drawing, closed onto the axis at both ends so it revolves into a solid; what collides is painted. */
  it('turns each drawn segment into a closed profile with the drawing’s colours', () => {
    const profiles = latheProfiles(assembly, new Set(['nose']))
    expect(profiles.map((each) => each.part)).toContain('flutes')
    expect(profiles.map((each) => each.part)).toContain('nose')
    for (const profile of profiles) {
      expect(profile.points[0]?.[0]).toBe(0)
      expect(profile.points[profile.points.length - 1]?.[0]).toBe(0)
      const heights = profile.points.map(([, z]) => z)
      expect(heights[0]).toBeLessThan(heights[heights.length - 1]!)
    }
    expect(profiles.find((each) => each.part === 'nose')?.color).toBe('#ef4444')
    expect(profiles.find((each) => each.part === 'flutes')?.color).toBe('#efe3a3')
  })
})

describe('where the stack stands', () => {
  // Two triangles: a floor square facing +Z at z = 4 (from x,y 0..10), and a wall facing +X.
  const positions = [
    0, 0, 4, 10, 0, 4, 10, 10, 4, 0, 0, 4, 10, 10, 4, 0, 10, 4, 10, 0, 0, 10, 10, 0, 10, 10, 8,
  ]
  const up = { x: 0, y: 0, z: 1 }

  /** The centre of the floor, not of the wall: the tool stands in the feature, on the face it cuts down onto. */
  it('is the centre of the triangles facing the way up', () => {
    const anchor = featureAnchor(positions, [{ start: 0, end: 3 }], up)
    expect(anchor?.[0]).toBeCloseTo(5, 9)
    expect(anchor?.[1]).toBeCloseTo(5, 9)
    expect(anchor?.[2]).toBeCloseTo(4, 9)
  })

  it('falls back to every triangle when none faces up, and to nothing without triangles', () => {
    const sideways = { x: 1, y: 0, z: 0 }
    expect(featureAnchor(positions, [{ start: 2, end: 3 }], sideways)?.[0]).toBe(10)
    expect(featureAnchor(positions, [], up)).toBeNull()
  })

  /** The tip is dropped from the anchor to the feature's bottom along the way up. */
  it('drops the tip to the bottom along the direction', () => {
    expect(tipAt([5, 5, 4], up, 1)).toEqual([5, 5, 1])
  })
})
