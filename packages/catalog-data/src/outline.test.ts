import { heightAt } from './clearance.js'
import { describe, expect, it } from 'vitest'
import { materialProfile } from './outline.js'

/**
 * What is left here after the tool drawing moved into
 * `@toolpath/tool-drawing`. The assembly outline's own tests went with it; this
 * covers the one function that stayed, and the invariant that matters about it:
 * the picture agrees with the verdict drawn beside it.
 */

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
