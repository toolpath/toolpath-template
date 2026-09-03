// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { Box3, Vector3 } from 'three'

import { formatSides, sidesOf } from './part-size'

/**
 * How big the part is, which the report never says.
 *
 * The Engine describes features, not stock, so the only honest source is the
 * geometry on screen — and once the number is measured off a mesh, the two
 * things left are arithmetic: which order the sides go in, and what they read
 * as in the unit somebody works in. Both are pinned here rather than only
 * through the viewport, where a wrong side length still renders as a plausible
 * string.
 */
const boxOf = (x: number, y: number, z: number) =>
  new Box3(new Vector3(0, 0, 0), new Vector3(x, y, z))

describe('the three sides of a part', () => {
  it('measures the box it was given', () => {
    expect(sidesOf(boxOf(50.8, 25.4, 12.7))).toEqual([50.8, 25.4, 12.7])
  })

  /*
   * The invariant the sort exists for. How the part happened to be drawn is not
   * a fact about the part, and the same block laid three ways is one size — the
   * same reasoning that matches a machine envelope largest against largest.
   */
  it('reads the same however the part was drawn', () => {
    const laid = [
      sidesOf(boxOf(50.8, 25.4, 12.7)),
      sidesOf(boxOf(12.7, 50.8, 25.4)),
      sidesOf(boxOf(25.4, 12.7, 50.8)),
    ]

    for (const sides of laid) {
      expect(sides).toEqual([50.8, 25.4, 12.7])
    }
  })

  it('measures from where the part sits, not from the origin', () => {
    // A part is rarely centred on the origin, and a box read as its far corner
    // would grow with however far the model was translated. Whole numbers here
    // on purpose: the subtraction is the subject, and 150.8 − 100 lands at
    // 50.799999999999983, which would be testing IEEE 754 instead.
    const offset = new Box3(new Vector3(100, 200, 300), new Vector3(150, 225, 312))

    expect(sidesOf(offset)).toEqual([50, 25, 12])
  })

  it('still answers for a part with no thickness', () => {
    expect(sidesOf(boxOf(50.8, 25.4, 0))).toEqual([50.8, 25.4, 0])
  })
})

describe('reading those sides in a unit', () => {
  it('reads the Engine’s millimetres as millimetres', () => {
    expect(formatSides([50.8, 50.8, 25.4], 'millimeters')).toBe('50.80 × 50.80 × 25.40 mm')
  })

  it('reads them as inches on the press of the same button', () => {
    // 50.8 mm is two inches exactly, which is the point of the fixture: a
    // conversion the wrong way round reads 1290.32 and looks like a unit label.
    expect(formatSides([50.8, 50.8, 25.4], 'inches')).toBe('2.000 × 2.000 × 1.000 in')
  })

  /*
   * Each unit gets the precision a machinist reads it at — a thousandth of an
   * inch and a hundredth of a millimetre being about the same distance — so the
   * decimals are not cosmetic and are not the same in both.
   */
  it('gives each unit the precision the rest of the app gives it', () => {
    expect(formatSides([1.23456], 'millimeters')).toBe('1.23 mm')
    expect(formatSides([25.4], 'inches')).toBe('1.000 in')
  })

  it('joins with the multiplication sign rather than an x', () => {
    // A machinist reads `2 × 2 × 1`; `2 x 2 x 1` is a variable name.
    expect(formatSides([1, 2], 'millimeters')).toContain(' × ')
    expect(formatSides([1, 2], 'millimeters')).not.toContain(' x ')
  })
})
