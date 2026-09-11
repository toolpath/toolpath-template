import { describe, expect, it } from 'vitest'
import { materialProfile, NO_MARGINS } from '@toolpath/catalog-data'
import type { ReachCurve } from '@toolpath/part-contracts'
import { clearanceCase, clearanceReport, type ClearanceDebugInput } from './clearance-debug'

const CURVE: ReachCurve = { horizontalOffset: [0, 8], verticalOffset: [12, 30] }

const input = (over: Partial<ClearanceDebugInput> = {}): ClearanceDebugInput => ({
  about: 'ER16 · ⌀6 end mill',
  curve: CURVE,
  cuttingRadius: 3,
  profile: materialProfile(CURVE, 3),
  extent: { height: 60, radius: 23 },
  box: { width: 380, height: 506 },
  asked: { plus: 240 },
  granted: {
    padding: { minus: 16, plus: 16, along: 16 },
    reserve: { minus: 16, plus: 120, along: 16 },
  },
  scale: 10,
  fontSize: 1.4,
  viewBox: '-24 -2 52 64',
  margins: NO_MARGINS,
  stickout: 31.75,
  ...over,
})

describe('clearanceCase', () => {
  it('states its units and copies the curve, so a saved case cannot be read as inches', () => {
    const shape = clearanceCase(input())
    expect(shape.units).toBe('mm')
    expect(shape.curve.horizontalOffset).toEqual([0, 8])
    expect(shape.curve.verticalOffset).toEqual([12, 30])
    expect(JSON.parse(JSON.stringify(shape)).cuttingRadius).toBe(3)
  })
})

describe('clearanceReport', () => {
  it('carries the four things the probe is run on', () => {
    const text = clearanceReport(input())
    expect(text).toContain('horizontalOffset [0,8]')
    expect(text).toContain('cutting 3 mm')
    expect(text).toContain('height 60 mm, radius 23 mm')
    expect(text).toContain('380 × 506 px')
    expect(text).toContain('asked {"plus":240} px')
  })

  it('raises the unit check on a curve small enough to be inches', () => {
    const inches: ReachCurve = { horizontalOffset: [0, 0.315], verticalOffset: [0.472, 1.181] }
    const text = clearanceReport(input({ curve: inches, profile: materialProfile(inches, 3) }))
    expect(text).toContain('SUSPECT')
  })

  it('does not raise it on a millimetre curve', () => {
    expect(clearanceReport(input())).toContain('the curve is millimetre-sized against the stack')
  })

  /**
   * The flank that reserved nothing, which is one of the four things a wall
   * standing hard against the cut can mean and the only one the picture cannot
   * distinguish. A wide curve does not reach this branch: `lastRise` is where
   * the staircase's final step *starts*, so widening the curve moves the last
   * corner without moving what the wall asks for. It is the sheet that has to
   * be narrow — here the `+r` reserve is `null` and the stack is 2 mm across,
   * which puts the edge at 3.6 mm under a wall wanting 13.
   */
  it('names the sheet when the flank grants less room than the wall wants', () => {
    const text = clearanceReport(
      input({
        extent: { height: 60, radius: 2 },
        granted: { padding: { minus: 16, plus: 16, along: 16 }, reserve: null },
      }),
    )
    expect(text).toContain('clipped by: the sheet')
  })

  it('says nothing clipped it where the wall got its room', () => {
    expect(clearanceReport(input())).toContain('clipped by: nothing')
  })
})
