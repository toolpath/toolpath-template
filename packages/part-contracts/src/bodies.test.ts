import { describe, expect, test } from 'vitest'
import { bodyDescription, bodyLabel, bodySize } from './bodies.js'
import type { PartBody } from './contracts.js'

const body = (overrides: Partial<PartBody> = {}): PartBody => ({
  index: 2,
  name: 'Bracket',
  faceCount: 24,
  boundingBox: { lower: { x: -5, y: 0, z: 1 }, upper: { x: 35, y: 15.04, z: 9 } },
  ...overrides,
})

describe('a body of a multi-body file', () => {
  test('is called by its own name, or by its place in the file counted from one', () => {
    expect(bodyLabel(body())).toBe('Bracket')
    expect(bodyLabel(body({ name: null }))).toBe('Body 3')
  })

  test('measures its box as upper less lower', () => {
    expect(bodySize(body())).toEqual({ width: 40, depth: 15.04, height: 8 })
  })

  test('is described by its faces and its size, in the unit being read', () => {
    expect(bodyDescription(body(), 'millimeters')).toBe('24 faces · 40.00 × 15.04 × 8.00 mm')
    expect(bodyDescription(body({ faceCount: 1 }), 'millimeters')).toBe(
      '1 face · 40.00 × 15.04 × 8.00 mm',
    )
    expect(bodyDescription(body(), 'inches')).toBe('24 faces · 1.575 × 0.592 × 0.315 in')
  })
})
