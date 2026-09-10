import { describe, expect, it } from 'vitest'
import { belowGageLine, type HolderProfile, type ProfilePoint } from './profiles.js'

const profile = (
  datum: HolderProfile['datum'],
  points: ReadonlyArray<ProfilePoint>,
): HolderProfile => ({
  guid: 'h',
  catalogNumber: 'CAT40-ER32-2.5',
  datum,
  points,
  complete: true,
  shortfallMm: null,
})

/**
 * What a spindle swallows is not part of the picture. A CAT40 model measures
 * the 7:24 cone and the retention knob as well as the holder, and drawing them
 * scales the tool down to fit a shape nobody is looking at.
 */
describe('the silhouette below the gage line', () => {
  it('drops what is above the spindle face', () => {
    const cut = belowGageLine(
      profile('gage-line', [
        [-65, 8],
        [-16, 22.9],
        [0, 22.9],
        [0, 30],
        [20, 30],
        [50, 12],
      ]),
    )

    expect(cut).toEqual([
      [0, 22.9],
      [0, 30],
      [20, 30],
      [50, 12],
    ])
  })

  /**
   * The cut is the face, not the nearest vertex to it: a cone that crosses
   * `z = 0` between two of its vertices is met exactly where it crosses.
   */
  it('interpolates the crossing where no vertex sits on the face', () => {
    const cut = belowGageLine(
      profile('gage-line', [
        [-10, 10],
        [10, 30],
        [40, 30],
      ]),
    )

    expect(cut).toEqual([
      [0, 20],
      [10, 30],
      [40, 30],
    ])
  })

  it('leaves a profile that is already below the face alone', () => {
    const whole = profile('gage-line', [
      [0, 30],
      [40, 30],
    ])

    expect(belowGageLine(whole)).toBe(whole.points)
  })

  /**
   * With no gauge plane solved there is no line to cut on, and `z = 0` is the
   * nose rather than the spindle face — cutting there would delete the holder.
   */
  it('passes a nose-datumed profile through whole', () => {
    const whole = profile('nose', [
      [-60, 25],
      [-8, 25],
      [0, 12],
    ])

    expect(belowGageLine(whole)).toBe(whole.points)
  })

  /**
   * A holder measured entirely inside the spindle is bad data. Drawing the stub
   * that survives the cut would hide that; drawing the whole absurd thing does
   * not.
   */
  it('keeps a profile the cut would leave shorter than a segment', () => {
    const stub = profile('gage-line', [
      [-60, 25],
      [-8, 25],
      [5, 0],
    ])
    const swallowed = profile('gage-line', [
      [-60, 25],
      [-8, 25],
    ])

    expect(belowGageLine(stub)).toBe(stub.points)
    expect(belowGageLine(swallowed)).toBe(swallowed.points)
  })
})
