import { describe, expect, it } from 'vitest'

import {
  focusAfterPrune,
  keeping,
  proposedReadings,
  propose,
  withoutFace,
  withoutReading,
  withReading,
} from './proposal'
import type { Proposal } from './proposal'
import { EMPTY_PLAN } from './setups'
import { TEST_DIRECTIONS, testFeature } from './test-part'
import type { PartFeature } from './contracts'

const UP = TEST_DIRECTIONS[0]!
const wall = testFeature('wall', 'wall', UP, [0, 1, 2])
const face0 = testFeature('face0', 'face', UP, [0])
const face1 = testFeature('face1', 'face', UP, [1])
const face2 = testFeature('face2', 'face', UP, [2])
const all = [wall, face0, face1, face2]

/**
 * An offer built straight from readings, for a test that is about what happens
 * next.
 *
 * The app never makes one this way — `propose` asks `inferable` which readings a
 * scope offers — so this lived in `proposal.ts` as an export nothing but this
 * file called. It is a fixture, so it lives with the fixtures.
 */
const proposeFrom = (readings: ReadonlyArray<PartFeature>, direction: number): Proposal | null => {
  if (readings.length === 0) {
    return null
  }

  return {
    direction,
    faces: new Set(readings.flatMap((feature) => feature.regionIdxs)),
    kept: new Set(),
  }
}

const readings = (proposal: NonNullable<ReturnType<typeof proposeFrom>>) =>
  proposedReadings(all, TEST_DIRECTIONS, proposal)
    .map((feature) => feature.featureTag)
    .sort()

describe('an offer is a set of faces', () => {
  it('offers nothing where the direction has nothing left to give', () => {
    expect(propose([], EMPTY_PLAN, TEST_DIRECTIONS, 0, 'everything')).toBeNull()
  })

  it('covers the offered faces with the smallest readings that fit', () => {
    // A face cut on its own can still be cut from somewhere else later, while a
    // profile that swallows its neighbours has made that decision for everybody.
    expect(readings(proposeFrom([wall], 0)!)).toEqual(['face0', 'face1', 'face2'])
  })

  it('keeps the rest of an offer when one of its faces is pruned', () => {
    // The part people get wrong: pruning a face does not delete the reading
    // that contained it — the offer is re-covered from what is left.
    const pruned = withoutFace(proposeFrom([wall], 0)!, 0)!

    expect(pruned.faces.has(0)).toBe(false)
    expect(readings(pruned)).toEqual(['face1', 'face2'])
  })

  it('falls back to the whole reading where nothing smaller covers the faces', () => {
    // With only the wall to choose from, the wall is the answer.
    expect(
      proposedReadings([wall], TEST_DIRECTIONS, proposeFrom([wall], 0)!).map((f) => f.featureTag),
    ).toEqual(['wall'])
  })

  it('takes a whole reading off with its X', () => {
    const offer = proposeFrom([wall], 0)!
    const pruned = withoutReading(offer, face1)!

    expect(pruned.faces.has(1)).toBe(false)
    expect(readings(pruned)).toEqual(['face0', 'face2'])
  })

  it('is gone once its last face is pruned', () => {
    expect(withoutFace(proposeFrom([face0], 0)!, 0)).toBeNull()
  })
})

describe('what has been said yes to stays said', () => {
  it('never swaps a kept reading for the one that contains it', () => {
    // "When I select this wall, it's chaining the wall into the full profile."
    const offer = keeping(proposeFrom([wall], 0)!, [face0])

    expect(proposedReadings(all, TEST_DIRECTIONS, offer).map((f) => f.featureTag)).toContain(
      'face0',
    )
  })
})

describe('adding a face from outside the offer', () => {
  it('brings the smallest reading of that face with it', () => {
    // A feature is one operation, so half of one is not addable.
    const offer = proposeFrom([face0], 0)!
    const grown = withReading(offer, face1, new Set())

    expect([...grown.faces].sort()).toEqual([0, 1])
  })

  it('refuses a reading treading on ground already spoken for', () => {
    // The same rule as the inference that made the offer — this is one more of
    // the same, not an exception to it.
    const offer = proposeFrom([face0], 0)!

    expect(withReading(offer, face1, new Set([1]))).toBe(offer)
  })
})

describe('what is still being read after a prune', () => {
  const before = [face0, face1]

  it('drops a focus on the reading that was just taken out', () => {
    // Otherwise the part stays lit for something no list mentions any more.
    expect(focusAfterPrune('face0', before, [face1])).toBeNull()
  })

  it('keeps a focus on a reading the offer still holds', () => {
    expect(focusAfterPrune('face1', before, [face1])).toBe('face1')
  })

  it('leaves alone a reading being read from somewhere else', () => {
    // Pruning is a statement about the offer, not about everything somebody
    // happens to be looking at.
    expect(focusAfterPrune('elsewhere', before, [face1])).toBe('elsewhere')
  })

  it('drops everything when the whole offer goes', () => {
    expect(focusAfterPrune('face0', before, [])).toBeNull()
  })

  it('has nothing to drop when nothing is being read', () => {
    expect(focusAfterPrune(null, before, [])).toBeNull()
  })
})
