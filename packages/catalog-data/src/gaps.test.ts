import { describe, expect, it } from 'vitest'
import { tightestGaps, wallFaceAt } from './gaps.js'
import type { Assembly, Collet, Holder } from './toolholding.js'
import type { CatalogTool } from './types.js'

/**
 * How much room the stack has, rather than whether it has any.
 *
 * The same fixtures as `clearance.test.ts`, asking the other question. These
 * numbers are what the drawing dimensions and what the list calls "most
 * clearance", and they are here so those two can never disagree.
 */
const tool: CatalogTool = {
  guid: 't',
  familyId: 'f',
  brand: 'WIDIA',
  vendor: 'Kennametal',
  catalogNumber: 'TDMX0600',
  materialNumber: null,
  toolType: 'endmill',
  form: 'flat end mill',
  unitSystem: 'metric',
  geometry: { DC: 6, LCF: 13, OAL: 57, SFDM: 6 },
  materialGroups: ['P'],
  productLine: null,
  productLink: null,
  provenance: {},
}

const holder: Holder = {
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
}

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

const assembly = (stickout: number): Assembly => ({
  tool,
  holder,
  collet,
  stickout,
  maxStickout: null,
})

describe('the room a stack has', () => {
  /**
   * A 10 mm wall at the cut and a 60 mm wall from 12 mm out. Up, the tightest
   * is the bottom of the shank, 13 mm up on a ⌀6 cut: 3 mm above the 10 mm
   * wall. Sideways, it is the ⌀28 nose: 3 + 12 − 14 = 1 mm to the face that
   * stands taller than it — a different part from the one measured up.
   */
  it('measures each gap at its own point, which need not be the same part', () => {
    const beside = { horizontalOffset: [0, 12, 30], verticalOffset: [10, 10, 60] }

    const gaps = tightestGaps(assembly(30), beside, { radial: 0.5, axial: 0.5 })

    expect(gaps.axial?.part).toBe('shank')
    expect(gaps.axial?.gap).toBeCloseTo(3, 6)
    expect(gaps.axial?.wall).toBeCloseTo(10, 6)
    expect(gaps.radial?.part).toBe('nose')
    expect(gaps.radial?.gap).toBeCloseTo(1, 6)
  })

  /** A gap exactly the room wanted is a pass, not a hair short of one. */
  it('passes a gap that is exactly the room wanted', () => {
    const flat = { horizontalOffset: [0, 1, 30], verticalOffset: [12.5, 12.5, 12.5] }

    const gaps = tightestGaps(assembly(60), flat, { radial: 0.5, axial: 0.5 })

    expect(gaps.axial?.gap).toBeCloseTo(0.5, 6)
    expect(gaps.axial?.clears).toBe(true)
    // Nothing stands as tall as the shank, so there is no wall to measure to.
    expect(gaps.radial).toBeNull()
  })

  /** Into the material is a negative gap, not an absent one. */
  it('reports a collision as the gap it is', () => {
    const tall = { horizontalOffset: [0, 2, 8, 15], verticalOffset: [12, 12, 30, 30] }

    const gaps = tightestGaps(assembly(25), tall, { radial: 0, axial: 0 })

    expect(gaps.axial?.gap).toBeLessThan(0)
    expect(gaps.axial?.clears).toBe(false)
  })

  it('finds the face of the first wall standing taller than a height', () => {
    const stairs = { horizontalOffset: [0, 12, 30], verticalOffset: [10, 10, 60] }

    expect(wallFaceAt(stairs, 5)).toBe(0)
    expect(wallFaceAt(stairs, 20)).toBe(12)
    expect(wallFaceAt(stairs, 80)).toBeNull()
  })
})
