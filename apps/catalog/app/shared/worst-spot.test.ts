import { describe, expect, it } from 'vitest'
import { worstSpot } from './worst-spot'

/**
 * A 20 × 20 floor at z = 0 with a 30 mm wall along its x = 20 edge. A ⌀6
 * cutter with a nose 5 mm in radius starting 10 mm above the tip: against
 * the wall — the cutter's edge on it, its axis 3 mm in — the nose is over
 * the wall, 20.5 mm into it. That is the spot, and the whole cutter is on
 * the floor there (Paul, 2026-08-30: inside the feature, not astride its
 * edge; and where it collides, when it collides).
 */
const quad = (a: Array<number>, b: Array<number>, c: Array<number>, d: Array<number>) => [
  ...a,
  ...b,
  ...c,
  ...a,
  ...c,
  ...d,
]
const floor = quad([0, 0, 0], [20, 0, 0], [20, 20, 0], [0, 20, 0])
const wall = quad([20, 0, 0], [20, 0, 30], [20, 20, 30], [20, 20, 0])
const positions = [...floor, ...wall]
const up = { x: 0, y: 0, z: 1 }
const room = { radial: 0.5, axial: 0.5 }

describe('the spot with the least clearance', () => {
  it('is against the wall with the whole cutter on the floor, and says how far into it the stack goes', () => {
    const spot = worstSpot(positions, [{ start: 0, end: 2 }], up, 0, [{ r: 5, z: 10 }], room, 3)
    expect(spot?.tip[0]).toBeCloseTo(17, 1)
    expect(spot?.tip[0]).toBeLessThanOrEqual(17.01)
    expect(spot?.tip[2]).toBe(0)
    expect(spot?.slack).toBeCloseTo(10 - 30 - 0.5, 6)
  })

  /** Nothing collides when the stack stands above the wall; the spot is where the sideways room is least. */
  it('reads the sideways room when the stack is above the wall', () => {
    const spot = worstSpot(positions, [{ start: 0, end: 2 }], up, 0, [{ r: 5, z: 40 }], room, 3)
    expect(spot?.slack).toBeGreaterThan(0)
    expect(spot?.tip[0]).toBeCloseTo(17, 1)
  })

  /** Every candidate keeps the cutter on the floor: none nearer the boundary than its radius. */
  it('never puts the cutter astride the floor’s edge', () => {
    const spot = worstSpot(positions, [{ start: 0, end: 2 }], up, 0, [{ r: 5, z: 40 }], room, 3)
    expect(spot?.tip[0]).toBeGreaterThanOrEqual(3 - 1e-6)
    expect(spot?.tip[1]).toBeGreaterThanOrEqual(3 - 1e-6)
    expect(spot?.tip[1]).toBeLessThanOrEqual(17 + 1e-6)
  })

  it('has nothing to say without steps or triangles', () => {
    expect(worstSpot(positions, [{ start: 0, end: 2 }], up, 0, [], room, 3)).toBeNull()
    expect(worstSpot([], [{ start: 0, end: 2 }], up, 0, [{ r: 5, z: 10 }], room, 3)).toBeNull()
  })
})
