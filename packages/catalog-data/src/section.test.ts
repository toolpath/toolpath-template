import { describe, expect, it } from 'vitest'
import { heightAt } from './clearance.js'
import { FLOOR_BAND, sectionOutline, type FeatureSection } from './section.js'

const curve = { horizontalOffset: [0, 2, 8, 15], verticalOffset: [12, 12, 30, 30] }

const pocket: FeatureSection = {
  kind: 'pocket',
  depth: 12,
  hasFloor: true,
  width: 10,
  filletRadius: 0,
  coneDeg: null,
  topAbove: 30,
  curve,
}

const bull = { diameter: 6, form: 'bull nose end mill' }

describe('a pocket in section, the tool against its wall', () => {
  const section = sectionOutline(pocket, bull)

  it('puts the wall at the cutting edge and the far wall the tightest width away', () => {
    expect(section.leftWall).toBe(-3)
    expect(section.rightWall).toBe(7)
    expect(section.floor).toEqual({ from: -3, to: 7 })
    expect(section.extent.bottom).toBe(-FLOOR_BAND)
  })

  /** The material beyond the wall is the sweep's staircase: every offset up to a knot is as tall as the knot. */
  it('stands the part beyond the wall as tall as the reach curve says', () => {
    const left = section.material[0]!
    const heightAtX = (x: number): number =>
      Math.max(...left.filter((p) => Math.abs(p.x - x) < 1e-6).map((p) => p.z))
    // At the wall itself: the feature's own depth, then up to the curve.
    expect(heightAtX(-3)).toBe(heightAt(curve, 0))
    // Two past the wall the boss begins: 30 tall from there.
    expect(heightAtX(-5)).toBe(30)
  })

  it('draws a fillet where the floor meets the wall', () => {
    const filleted = sectionOutline({ ...pocket, filletRadius: 1.5 }, bull)
    const left = filleted.material[0]!
    expect(left[0]).toEqual({ x: -1.5, z: 0 })
    expect(left.some((p) => Math.abs(p.x - -3) < 1e-6 && Math.abs(p.z - 1.5) < 1e-6)).toBe(true)
    expect(filleted.floor).toEqual({ from: -1.5, to: 5.5 })
  })

  it('draws a through feature with nothing under it', () => {
    const through = sectionOutline({ ...pocket, hasFloor: false }, bull)
    expect(through.floor).toBeNull()
    expect(through.extent.bottom).toBe(0)
  })

  /** A tool wider than the tightest place is drawn in a slot its own width: the walls cannot overlap it. */
  it('never draws the far wall inside the tool', () => {
    const wide = sectionOutline({ ...pocket, width: 4 }, bull)
    expect(wide.rightWall).toBe(3)
  })
})

describe('other kinds', () => {
  it('sits a drill on the axis of its hole, in a cone the drill point nests in', () => {
    const hole = sectionOutline(
      { ...pocket, kind: 'hole', width: 8, coneDeg: 118 },
      { diameter: 8, form: 'drill' },
    )
    expect(hole.leftWall).toBe(-4)
    expect(hole.rightWall).toBe(4)
    const cone = hole.material.find((polygon) => polygon.some((p) => p.x === 0 && p.z === 0))!
    expect(cone[0]?.z).toBeCloseTo(4 / Math.tan((59 * Math.PI) / 180), 6)
  })

  it('puts an end mill against a hole’s wall, not on its axis', () => {
    const hole = sectionOutline({ ...pocket, kind: 'hole', width: 8, coneDeg: 180 }, bull)
    expect(hole.leftWall).toBe(-3)
    expect(hole.rightWall).toBe(5)
  })

  it('draws a wall open on the far side, with the floor running out', () => {
    const wall = sectionOutline({ ...pocket, kind: 'wall', width: null }, bull)
    expect(wall.rightWall).toBeNull()
    expect(wall.floor?.from).toBe(-3)
    expect(wall.floor!.to).toBeGreaterThan(3)
  })

  it('draws a face as the floor itself, with whatever stands around it', () => {
    const face = sectionOutline({ ...pocket, kind: 'face', depth: 0 }, bull)
    expect(face.leftWall).toBeNull()
    expect(face.floor).not.toBeNull()
    expect(face.material.length).toBeGreaterThanOrEqual(2)
    expect(face.extent.top).toBe(30)
  })

  it('stands the wall straight up to the part top when there is no curve', () => {
    const blind = sectionOutline({ ...pocket, curve: null }, bull)
    expect(blind.extent.top).toBe(30)
  })
})
