import { describe, expect, it } from 'vitest'

import { byDirection, offersFor } from './map-features'
import { TEST_DIRECTIONS, testFeature } from './test-part'

const UP = TEST_DIRECTIONS[0]!
const DOWN = TEST_DIRECTIONS[1]!

describe('which way up would cut the faces somebody has painted', () => {
  it('says nothing until something is painted', () => {
    // The offer answers "which way up cuts *this group*"; with no group there is
    // no question.
    expect(offersFor(TEST_DIRECTIONS, [testFeature('a', 'wall', UP, [0])], new Set())).toEqual([])
  })

  it('takes the smallest readings first, so the most can still be argued with', () => {
    /*
     * §8 of the parity plan: an offer built largest-first hands somebody a
     * profile covering eight faces that can only be taken or left, where eight
     * walls could have had one clicked off.
     */
    const wide = testFeature('profile', 'profile', UP, [0, 1, 2])
    const small = testFeature('wall', 'wall', UP, [1])

    const [offer] = offersFor(TEST_DIRECTIONS, [wide, small], new Set([0, 1, 2]))

    expect(offer?.readings.map((each) => each.featureTag)).toEqual(['wall'])
  })

  it('skips a reading that treads on ground already taken', () => {
    // Running both machines the shared face twice. A reading is one operation
    // over the faces it covers, so it is either in or out.
    const first = testFeature('first', 'wall', UP, [0])
    const overlapping = testFeature('second', 'wall', UP, [0, 1])

    const [offer] = offersFor(TEST_DIRECTIONS, [first, overlapping], new Set([0, 1]))

    expect(offer?.readings.map((each) => each.featureTag)).toEqual(['first'])
    expect(offer?.covered).toBe(1)
    expect(offer?.missed).toBe(1)
  })

  it('counts what it would miss rather than hiding it', () => {
    // A way up that reaches most of a group is a real answer, and pretending
    // otherwise is how a plan loses a face quietly.
    const [offer] = offersFor(
      TEST_DIRECTIONS,
      [testFeature('a', 'wall', UP, [0])],
      new Set([0, 1, 2]),
    )

    expect(offer?.covered).toBe(1)
    expect(offer?.missed).toBe(2)
  })

  it('leaves out a way up that reaches none of them', () => {
    // An empty offer is noise: the answer is "not this one", and the list is
    // shorter for saying so by omission.
    const offers = offersFor(TEST_DIRECTIONS, [testFeature('a', 'wall', UP, [0])], new Set([0]))

    expect(offers.map((offer) => offer.index)).toEqual([0])
  })

  it('ranks by how much it covers, then by how few operations that takes', () => {
    const offers = offersFor(
      TEST_DIRECTIONS,
      [
        testFeature('up-a', 'wall', UP, [0]),
        testFeature('up-b', 'wall', UP, [1]),
        testFeature('down-both', 'profile', DOWN, [0, 1]),
      ],
      new Set([0, 1]),
    )

    // Both cover two faces; −Z does it in one operation, so it leads.
    expect(offers.map((offer) => offer.label)).toEqual(['−Z', '+Z'])
  })
})

describe('readings grouped by the way up they are read from', () => {
  it('says the direction once, in the header, rather than on every row', () => {
    // The answer to "what owns this face" is usually the same handful of shapes
    // seen from three or four directions.
    const groups = byDirection(TEST_DIRECTIONS, [
      testFeature('up-a', 'wall', UP, [0]),
      testFeature('down', 'profile', DOWN, [0]),
      testFeature('up-b', 'face', UP, [1]),
    ])

    expect(groups.map((group) => group.label)).toEqual(['+Z', '−Z'])
    expect(groups[0]?.readings.map((each) => each.featureTag)).toEqual(['up-a', 'up-b'])
  })

  it('follows the part own direction order, so a way up sits where it does elsewhere', () => {
    const groups = byDirection(TEST_DIRECTIONS, [
      testFeature('down', 'wall', DOWN, [0]),
      testFeature('up', 'wall', UP, [0]),
    ])

    expect(groups.map((group) => group.index)).toEqual([0, 1])
  })

  it('leaves the order within a group alone, because it arrives ranked', () => {
    const groups = byDirection(TEST_DIRECTIONS, [
      testFeature('second', 'profile', UP, [0, 1]),
      testFeature('first', 'wall', UP, [0]),
    ])

    expect(groups[0]?.readings.map((each) => each.featureTag)).toEqual(['second', 'first'])
  })

  it('drops a reading from a way up the part does not list', () => {
    // Not an error: a direction the Engine no longer reports has no row to sit
    // under, and inventing one would claim a way up nothing offers.
    const groups = byDirection(TEST_DIRECTIONS, [
      testFeature('stray', 'wall', { x: 0.3, y: 0.4, z: 0.86 }, [0]),
    ])

    expect(groups).toEqual([])
  })
})
