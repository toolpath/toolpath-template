import { describe, expect, it } from 'vitest'

import { START, clearAll, holdDirection, paintFace, switchMode, paintReading } from './pick-mode'
import { offersFor } from './map-features'
import { TEST_DIRECTIONS, testFeature, testPart } from './test-part'

/**
 * The two pick modes, §3.9, and the offers the direction mode reads from.
 */

describe('what a click will mean', () => {
  it('starts by face, because by direction needs an arrow pressed first', () => {
    // Holding a way up means pressing an arrow, so that mode has to put the
    // arrows on screen before it is any use.
    expect(START.mode).toBe('face')
  })

  it('throws away what the other mode was asking', () => {
    // A set painted for one question is not an answer to the other.
    const painting = paintFace(holdDirection(switchMode(START, 'direction'), 0), 3)
    const swapped = switchMode(painting, 'face')

    expect(swapped.painted.size).toBe(0)
    expect(swapped.selection.picks).toEqual([])
  })

  it('lets go of the held direction on the way back to by-face', () => {
    // Holding one is only meaningful while a click paints.
    expect(switchMode(holdDirection(switchMode(START, 'direction'), 1), 'face').holding).toBeNull()
  })

  it('keeps the held direction when the mode has not changed', () => {
    const held = holdDirection(switchMode(START, 'direction'), 1)

    expect(switchMode(held, 'direction')).toBe(held)
  })
})

describe('painting faces', () => {
  it('paints nothing until a way up is held', () => {
    // Without one there is no question for the set to be an answer to.
    expect(paintFace(switchMode(START, 'direction'), 2).painted.size).toBe(0)
  })

  it('adds a face, and takes a painted one off, with no modifier', () => {
    // The mode has already said what a click means.
    const held = holdDirection(switchMode(START, 'direction'), 0)
    const one = paintFace(held, 2)
    expect([...one.painted]).toEqual([2])

    expect(paintFace(one, 2).painted.size).toBe(0)
  })

  it('paints nothing at all in by-face mode', () => {
    expect(paintFace(START, 2).painted.size).toBe(0)
  })

  it('drops the painted set when the way up is let go', () => {
    const painting = paintFace(holdDirection(switchMode(START, 'direction'), 0), 2)

    expect(holdDirection(painting, 0).holding).toBeNull()
    expect(holdDirection(painting, 0).painted.size).toBe(0)
  })

  it('clears everything on empty space', () => {
    expect(
      clearAll(paintFace(holdDirection(switchMode(START, 'direction'), 0), 2)).painted.size,
    ).toBe(0)
  })
})

describe('which way up would cut what is painted', () => {
  const features = testPart().features

  it('offers nothing while nothing is painted', () => {
    expect(offersFor(TEST_DIRECTIONS, features, new Set())).toEqual([])
  })

  it('ranks the ways up by how much of the painted set they reach', () => {
    // Region 2 is reachable from +Z, −Z and +Y; region 5 only from −Z.
    const offers = offersFor(TEST_DIRECTIONS, features, new Set([2, 5]))

    expect(offers[0]?.label).toBe('−Z')
    expect(offers[0]?.covered).toBe(2)
    expect(offers[0]?.missed).toBe(0)
  })

  it('says what a way up would miss rather than hiding it', () => {
    const offers = offersFor(TEST_DIRECTIONS, features, new Set([2, 5]))
    const partial = offers.find((offer) => offer.label === '+Y')

    expect(partial?.covered).toBe(1)
    expect(partial?.missed).toBe(1)
  })

  it('leaves out a way up that reaches none of it', () => {
    expect(offersFor(TEST_DIRECTIONS, features, new Set([0])).map((o) => o.label)).not.toContain(
      '−Y',
    )
  })

  it('builds an offer smallest reading first', () => {
    // A profile covering eight faces can only be taken or left; eight walls can
    // have one clicked off. Smallest first leaves the most to argue with.
    const wide = testFeature('wide', 'profile', TEST_DIRECTIONS[0]!, [0, 1, 2])
    const narrow = testFeature('narrow', 'wall', TEST_DIRECTIONS[0]!, [0])
    const offers = offersFor(TEST_DIRECTIONS, [wide, narrow], new Set([0, 1, 2]))

    expect(offers[0]?.readings.map((feature) => feature.featureTag)).toEqual(['narrow'])
  })
})

describe('painting what a click cuts', () => {
  const held = holdDirection(switchMode(START, 'direction'), 0)

  it('takes the whole reading, not the face under the pointer', () => {
    // A feature is one operation over the faces it covers: painting three of a
    // pocket's eight faces describes nothing anybody can run.
    expect([...paintReading(held, 1, [1, 2, 3]).painted].sort()).toEqual([1, 2, 3])
  })

  it('takes the whole reading off again', () => {
    const on = paintReading(held, 1, [1, 2, 3])

    expect(paintReading(on, 1, [1, 2, 3]).painted.size).toBe(0)
  })

  it('falls back to the single face when nothing reads it', () => {
    // A face no reading of the held direction covers is still a face somebody
    // pointed at.
    expect([...paintReading(held, 4, []).painted]).toEqual([4])
  })

  it('paints nothing without a way up held', () => {
    expect(paintReading(switchMode(START, 'direction'), 1, [1, 2]).painted.size).toBe(0)
  })
})
