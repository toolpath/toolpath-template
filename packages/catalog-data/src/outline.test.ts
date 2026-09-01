import { heightAt } from './clearance.js'
import { describe, expect, it } from 'vitest'
import { assemblyOutline, materialProfile } from './outline.js'
import type { Assembly, Collet, Holder } from './toolholding.js'
import type { CatalogTool } from './types.js'

const tool = (over: Partial<CatalogTool> = {}): CatalogTool => ({
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
  provenance: { DC: 'vendor-stated', LCF: 'vendor-stated', SFDM: 'vendor-stated', LBH: 'derived' },
  ...over,
})

const holder: Holder = {
  guid: 'h',
  familyId: 'bt30',
  brand: 'REGO-FIX',
  vendor: 'REGO-FIX',
  catalogNumber: 'BT 30 / PG 6 x 050',
  materialNumber: null,
  taper: 'BT30',
  contact: null,
  clamping: 'collet',
  gaugeLength: 50,
  colletSeries: 'PG6',
  boreDiameter: null,
  noseDiameter: 10,
  noseLength: null,
  bodyDiameter: null,
  bodyLength: null,
  projection: null,
  flangeDiameter: null,
  colletProtrusion: null,
  productLink: null,
  cadModelUrl: null,
  provenance: { noseDiameter: 'vendor-stated' },
}

const collet: Collet = {
  guid: 'c',
  familyId: 'pg6',
  brand: 'REGO-FIX',
  vendor: 'REGO-FIX',
  catalogNumber: 'PG 6 / 6',
  materialNumber: null,
  series: 'PG6',
  clampMin: 6,
  clampMax: 6,
  clampLength: null,
  productLink: null,
  provenance: {},
}

const assembly = (over: Partial<Assembly> = {}): Assembly => ({
  tool: tool(),
  holder,
  collet,
  stickout: 19,
  maxStickout: null,
  ...over,
})

describe('an assembly as an outline', () => {
  it('draws tip, flutes, shank and nose from the tip up, and says where each came from', () => {
    const outline = assemblyOutline(assembly())

    expect(outline.segments.map((each) => each.part)).toEqual(['tip', 'flutes', 'shank', 'nose'])
    expect(outline.segments.map((each) => each.provenance)).toEqual([
      'vendor-stated',
      'vendor-stated',
      'chosen',
      'vendor-stated',
    ])
    expect(outline.height).toBe(19 + 50)
    expect(outline.radius).toBe(5)
  })

  it('puts the shank at the stickout and the nose above it', () => {
    const outline = assemblyOutline(assembly({ stickout: 30 }))
    const shank = outline.segments.find((each) => each.part === 'shank')!
    const nose = outline.segments.find((each) => each.part === 'nose')!

    expect(shank.points.map((each) => each.z)).toEqual([13, 30])
    expect(nose.points[0]).toEqual({ r: 5, z: 30 })
  })

  it('draws a neck where a shoulder is stated', () => {
    const necked = tool({
      geometry: { DC: 6, LCF: 13, SFDM: 10, 'shoulder-diameter': 5.6, 'shoulder-length': 32 },
    })
    const outline = assemblyOutline(assembly({ tool: necked, stickout: 40 }))

    expect(outline.segments.map((each) => each.part)).toEqual([
      'tip',
      'flutes',
      'neck',
      'shank',
      'nose',
    ])
    expect(outline.segments[2]?.points).toEqual([
      { r: 2.8, z: 13 },
      { r: 2.8, z: 32 },
    ])
  })

  /** The one place the form changes the outline, and the one place an unstated number is assumed. */
  it('shapes the tip by what the tool is', () => {
    const ball = assemblyOutline(assembly({ tool: tool({ form: 'ball end mill' }) }))
    expect(ball.segments[0]?.points[0]).toEqual({ r: 0, z: 0 })
    expect(ball.segments[0]?.points.at(-1)?.r).toBeCloseTo(3)

    const drill = assemblyOutline(assembly({ tool: tool({ form: 'drill', toolType: 'drill' }) }))
    expect(drill.segments[0]?.provenance).toBe('assumed')
    expect(drill.segments[0]?.points[1]?.z).toBeCloseTo(3 / Math.tan((118 / 2) * (Math.PI / 180)))

    const stated = assemblyOutline(
      assembly({
        tool: tool({
          form: 'drill',
          toolType: 'drill',
          geometry: { DC: 6, LCF: 13, SFDM: 6, SIG: 140 },
        }),
      }),
    )
    expect(stated.segments[0]?.provenance).toBe('vendor-stated')
  })

  it('draws no nose without a stickout, and nothing at all without a diameter', () => {
    expect(assemblyOutline(assembly({ stickout: null })).segments.map((each) => each.part)).toEqual(
      ['tip', 'flutes', 'shank'],
    )
    expect(assemblyOutline(assembly({ tool: tool({ geometry: {} }) })).segments).toEqual([])
  })
})

describe('the material beside the tool', () => {
  /**
   * The same staircase the sweep walks: everything out to a knot is already
   * as tall as that knot says. Drawn with the rise at the knot instead, a
   * nose at offset 5 looked clear of 12 mm material while `heightAt(5)` said
   * 30 — the picture contradicted the verdict beside it.
   */
  it('draws the reach curve as the sweep reads it: each run at its knot’s height, from the knot before', () => {
    const points = materialProfile({ horizontalOffset: [0, 8], verticalOffset: [12, 30] }, 3)

    expect(points).toEqual([
      { r: 3, z: 0 },
      { r: 3, z: 12 },
      { r: 3, z: 30 },
      { r: 11, z: 30 },
    ])
  })

  it('agrees with heightAt at every offset', () => {
    const curve = { horizontalOffset: [0, 2, 8, 15], verticalOffset: [12, 12, 30, 30] }
    const points = materialProfile(curve, 3)
    // The height of the horizontal run the drawing has at this offset — the
    // first one, where a riser makes two candidates — and the last height
    // past the end, as the renderer extends it.
    const drawnHeightAt = (offset: number): number => {
      const r = 3 + offset
      for (let index = 0; index + 1 < points.length; index += 1) {
        const from = points[index]!
        const to = points[index + 1]!
        if (from.z === to.z && from.r <= r && r <= to.r) {
          return from.z
        }
      }
      return points[points.length - 1]!.z
    }
    for (const offset of [0, 0.5, 1.9, 2.1, 5, 7.9, 8.1, 12, 15.5, 40]) {
      expect(drawnHeightAt(offset)).toBe(heightAt(curve, offset))
    }
  })
})

describe('a holder drawn as the body the vendor states', () => {
  const stated = assembly({
    stickout: 30,
    holder: {
      ...holder,
      colletSeries: 'PG6',
      noseLength: 10.55,
      bodyDiameter: 12.02,
      bodyLength: 9.6,
      projection: 50,
      flangeDiameter: 46,
      colletProtrusion: 2.5,
      provenance: {
        noseDiameter: 'vendor-stated',
        flangeDiameter: 'derived',
        colletProtrusion: 'derived',
      },
    },
  })

  /**
   * **Cylinders, not cones** (Paul, 2026-08-31). The stretch between the body
   * and the flange was drawn as a cone flaring out to the flange's own
   * diameter — a shape the vendor never published, and most of the drawn
   * holder. It is the body's own diameter carried up now: still assumed,
   * because nothing states it, but assumed to be no wider than what *is*
   * stated rather than assumed to flare.
   */
  it('draws collet, nose, body, the body carried to the flange, and the flange', () => {
    const outline = assemblyOutline(stated)
    const holderParts = outline.segments.filter(
      (each) => !['tip', 'flutes', 'shank'].includes(each.part),
    )

    expect(holderParts.map((each) => [each.part, each.provenance])).toEqual([
      ['collet', 'derived'],
      ['nose', 'vendor-stated'],
      ['body', 'vendor-stated'],
      ['body', 'assumed'],
      ['flange', 'derived'],
    ])
    // The carry is the body's own radius, top and bottom.
    expect(holderParts[3]?.points).toEqual([
      { r: 6.01, z: 50.15 },
      { r: 6.01, z: 80 },
    ])
    expect(holderParts[0]?.points).toEqual([
      { r: 3, z: 27.5 },
      { r: 3, z: 30 },
    ])
    expect(holderParts.at(-1)?.points[0]).toEqual({ r: 23, z: 80 })
    expect(outline.radius).toBe(23)
  })
})
