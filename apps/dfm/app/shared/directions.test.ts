import { describe, expect, it } from 'vitest'

import { isAxisAligned } from './directions'

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
