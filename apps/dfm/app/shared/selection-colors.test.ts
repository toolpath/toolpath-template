import { describe, expect, it } from 'vitest'
import { DIRECTION_COLORS } from '@toolpath/viewer'

import { FACE_COLORS, READING_COLORS, SETUP_COLORS } from './selection-colors'
import { PAINTED_HEX, PROPOSED_HEX } from './paint'

/**
 * §3.5: the selection palette follows what the part is painted with — warm over
 * the cool direction cycle, cool over the warm difficulty ramp.
 */

const channels = (hex: number) => [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff] as const
const isWarm = (hex: number) => {
  const [r, , b] = channels(hex)
  return r > b
}
const lightness = (hex: number) => {
  const [r, g, b] = channels(hex)
  return 0.299 * r + 0.587 * g + 0.114 * b
}

describe('what the part wears over each wash', () => {
  it('is cool over the warm difficulty ramp', () => {
    for (const colour of Object.values(READING_COLORS)) {
      expect(isWarm(colour)).toBe(false)
    }
  })

  it('is warm over the cool direction cycle', () => {
    for (const colour of Object.values(SETUP_COLORS)) {
      expect(isWarm(colour)).toBe(true)
    }
  })

  it('never wears a colour a direction already wears', () => {
    // Otherwise the selection reads as one more direction rather than as an
    // answer to a question.
    for (const colour of Object.values(SETUP_COLORS)) {
      expect(DIRECTION_COLORS).not.toContain(colour)
    }
  })

  it('is told apart from painting and from an offer', () => {
    // Faces being painted are already orange and sit between these two, so the
    // three are separated by how dark they are as much as by hue.
    expect(Object.values(SETUP_COLORS)).not.toContain(PAINTED_HEX)
    expect(Object.values(SETUP_COLORS)).not.toContain(PROPOSED_HEX)
    expect(lightness(SETUP_COLORS.highlight)).toBeLessThan(lightness(PAINTED_HEX))
    expect(lightness(SETUP_COLORS.hover)).toBeGreaterThan(lightness(PAINTED_HEX))
  })

  it('keeps the hover a step lighter than what is already chosen', () => {
    // A question rather than an answer, and it has to be told from one.
    expect(lightness(SETUP_COLORS.hover)).toBeGreaterThan(lightness(SETUP_COLORS.highlight))
    expect(lightness(READING_COLORS.hover)).toBeGreaterThan(lightness(READING_COLORS.highlight))
  })
})

describe('the faces of a reading being listed', () => {
  it('is a hue neither selection palette uses', () => {
    /*
     * The bug this exists for. In both palettes `highlight` and `picked` are the
     * same hex — right there, where a clicked face and the reading it resolved
     * to should read as one thing. Borrowing either for a face list paints the
     * whole set and the row under the pointer in one flat colour, and a dozen
     * faces become indistinguishable from each other and from the feature.
     */
    expect(READING_COLORS.highlight).toBe(READING_COLORS.picked)
    expect(SETUP_COLORS.highlight).toBe(SETUP_COLORS.picked)

    expect(FACE_COLORS.cut).not.toBe(READING_COLORS.picked)
    expect(FACE_COLORS.cut).not.toBe(SETUP_COLORS.picked)
  })

  it('says cut and not-cut in two colours nothing else on the part uses', () => {
    // "Covered but not cut" is the state somebody opens the panel to find, and
    // a face left unpainted says nothing about whether it was ever a candidate.
    expect(FACE_COLORS.cut).not.toBe(FACE_COLORS.uncut)

    for (const taken of [...DIRECTION_COLORS, PAINTED_HEX, PROPOSED_HEX]) {
      expect(FACE_COLORS.cut).not.toBe(taken)
      expect(FACE_COLORS.uncut).not.toBe(taken)
    }
  })
})

describe('telling one way up from another', () => {
  /*
   * Three of the cycle used to sit in one corner — teal-500, cyan-500 and
   * emerald-500 are neighbours by hue *and* by lightness, so on a part three
   * different ways up were one blue-green smear. The palette is an identity,
   * read off the face, the arrow and the row at once; two entries that look
   * alike make it a worse identity than eight that do not.
   *
   * Measured in Oklab, which is near enough perceptually uniform that a
   * distance means the same thing in the blues as in the greens — RGB distance
   * would call the old teal and cyan far apart and the eye would disagree.
   */
  const srgb = (channel: number) => {
    const c = channel / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }

  const oklab = (hex: number) => {
    const [r, g, b] = channels(hex).map(srgb) as [number, number, number]
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)

    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ] as const
  }

  const apart = (a: number, b: number) => {
    const [l1, a1, b1] = oklab(a)
    const [l2, a2, b2] = oklab(b)
    return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
  }

  it('keeps every pair of directions visibly apart', () => {
    /*
     * 0.1 in Oklab is roughly "obviously a different colour" at a glance on a
     * shaded surface. The old teal/emerald pair measured about 0.06 and the
     * old teal/cyan about 0.08; the closest pair now is well clear of both.
     */
    const closest = DIRECTION_COLORS.flatMap((one, at) =>
      DIRECTION_COLORS.slice(at + 1).map((other) => ({ one, other, gap: apart(one, other) })),
    ).sort((a, b) => a.gap - b.gap)[0]

    expect(closest).toBeDefined()
    expect(closest?.gap).toBeGreaterThan(0.1)
  })

  // What the whole palette is kept out of the way of: the selection over this
  // wash, a face being painted, and an offer. Near-misses matter as much as
  // exact matches — a direction one step from the violet of an offer is what
  // sent a purple out of this list once already.
  it('stays clear of everything else the part can wear at the same time', () => {
    for (const direction of DIRECTION_COLORS) {
      for (const taken of [...Object.values(SETUP_COLORS), PAINTED_HEX, PROPOSED_HEX]) {
        expect(apart(direction, taken)).toBeGreaterThan(0.1)
      }
    }
  })
})
