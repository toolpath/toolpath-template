import type { PartPick } from '@toolpath/viewer'
import { describe, expect, it } from 'vitest'
import { holdFace, sharedReadings } from './picks.js'

/**
 * Holding two faces asks "which reading covers both of these", which is the
 * only way to name one of the five to eight readings on a face without hunting
 * through a list of them.
 */
const pick = (region: number, ranked: Array<string>): PartPick => ({
  region,
  owners: ranked,
  ranked,
  best: ranked[0] ?? null,
  triangleIndex: region * 2,
  point: [0, 0, 0],
  normal: [0, 0, 1],
  modifiers: { alt: false, ctrl: false, meta: false, shift: false, secondary: false },
  doubled: false,
})

describe('holdFace', () => {
  it('adds a face that is not held', () => {
    expect(holdFace([pick(1, ['a'])], pick(2, ['b'])).map((p) => p.region)).toEqual([1, 2])
  })

  it('drops a face that is held, so the same click is a toggle', () => {
    expect(holdFace([pick(1, ['a']), pick(2, ['b'])], pick(1, ['a'])).map((p) => p.region)).toEqual(
      [2],
    )
  })
})

describe('sharedReadings', () => {
  it('keeps only the readings that own every held face', () => {
    const held = [
      pick(1, ['pocket', 'wall-a', 'profile']),
      pick(2, ['pocket', 'wall-b', 'profile']),
    ]

    // Two walls of a pocket resolve to the pocket and the profile that traces
    // it — the walls themselves own one face each and drop out.
    expect(sharedReadings(held)).toEqual(['pocket', 'profile'])
  })

  it('ranks by the newest click, so the face just added leads', () => {
    const held = [pick(1, ['profile', 'pocket']), pick(2, ['pocket', 'profile'])]

    expect(sharedReadings(held)).toEqual(['pocket', 'profile'])
  })

  it('reports nothing when the faces have no reading in common', () => {
    expect(sharedReadings([pick(1, ['a']), pick(2, ['b'])])).toEqual([])
  })

  it('is the face itself when only one is held', () => {
    expect(sharedReadings([pick(1, ['a', 'b'])])).toEqual(['a', 'b'])
  })
})
