import { describe, expect, it } from 'vitest'

import { missedBy, setupOffers } from './setup-offers'
import { TEST_DIRECTIONS, testFeature, testPart } from './test-part'
import type { PartFeature } from './contracts'

/**
 * What each way up would be worth holding, before anything is chosen.
 *
 * The question `from the rules` should have been asking: on a part that forces
 * three ways up, its own buying loop reaches 95% across five, while choosing
 * the three by hand and letting the allocator fill them reaches 100%.
 */
const UP = TEST_DIRECTIONS[0]!
const DOWN = TEST_DIRECTIONS[1]!
const SIDE = TEST_DIRECTIONS[2]!

/** An undercut reachable from `DOWN` and nowhere else. */
const undercut: PartFeature = {
  ...testFeature('slot', 'undercut_tslot', DOWN, [3]),
  datasheet: { facts: { kind: 'Tslot' } } as unknown as PartFeature['datasheet'],
}

/*
 * Faces 0–2 are reachable two ways, so neither of those directions is forced.
 * Face 3 is reachable one way, so that one is.
 */
const features = [
  testFeature('big', 'profile', UP, [0, 1, 2]),
  testFeature('other', 'profile', SIDE, [0, 1, 2]),
  undercut,
]
const report = { ...testPart(), features }

describe('what each way up offers', () => {
  it('counts the readings and the ground each one reaches', () => {
    const up = setupOffers(report, TEST_DIRECTIONS).find((offer) => offer.index === 0)

    expect(up?.features).toBe(1)
    expect(up?.regions).toBe(3)
    expect(up?.share).toBeGreaterThan(0)
  })

  it('says which the part forces, which is a fact rather than a recommendation', () => {
    const forced = setupOffers(report, TEST_DIRECTIONS).filter((offer) => offer.required)

    expect(forced.map((offer) => offer.label)).toEqual(['−Z'])
  })

  it('puts the forced ones first, then the ones that reach most', () => {
    /*
     * The order somebody decides in. Sorting purely by reach would bury a
     * required direction that only reaches an undercut — the one row on the
     * list that cannot be turned off without consequence.
     */
    const offers = setupOffers(report, TEST_DIRECTIONS)

    expect(offers[0]?.required).toBe(true)
    // Then the two that reach the same ground, in candidate order.
    expect(offers.slice(1).map((offer) => offer.index)).toEqual([0, 2, 3])
  })
})

describe('what a choice would leave uncut', () => {
  it('is nothing when everything reachable is chosen', () => {
    const all = TEST_DIRECTIONS.map((_direction, index) => index)

    expect(missedBy(report, TEST_DIRECTIONS, all)).toBe(0)
  })

  it('is everything when nothing is chosen', () => {
    expect(missedBy(report, TEST_DIRECTIONS, [])).toBe(1)
  })

  it('counts only ground something could have reached', () => {
    // A face no direction reports is nobody's fault, and counting it would make
    // every choice look worse than it is.
    const missed = missedBy(report, TEST_DIRECTIONS, [0])

    expect(missed).toBeGreaterThan(0)
    expect(missed).toBeLessThan(1)
  })
})
