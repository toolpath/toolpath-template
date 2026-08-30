import { describe, expect, it } from 'vitest'
import type { PartFeature } from '@toolpath/part-contracts'
import { pickForRegion } from '@toolpath/part-contracts/selection'
import {
  IDLE,
  groupOf,
  interactionFor,
  type Interaction,
  type InteractionAction,
} from './part-interaction'
import { arrowsFor } from './part-selection'

/**
 * A part with two ways up and one face that both can see.
 *
 * Region 0 is owned by a pocket cut from above and a wall cut from the side,
 * which is the whole reason arming exists: a plain click opens the larger
 * reading, an armed click opens the one that way up.
 */
const DOWN = { x: 0, y: 0, z: 1 }
const SIDE = { x: 1, y: 0, z: 0 }

const feature = (
  tag: string,
  type: string,
  direction: { x: number; y: number; z: number },
  regions: Array<number>,
  area = 10,
  extra: Record<string, unknown> = {},
): PartFeature =>
  ({
    featureTag: tag,
    featureType: type,
    regionIdxs: regions,
    machiningDirection: direction,
    datasheet: { featureType: type, wallishArea: area, floorishArea: 0, ...extra },
  }) as unknown as PartFeature

const hole = (tag: string, regions: Array<number>) =>
  feature(tag, 'blind_hole', DOWN, regions, 2, {
    facts: { kind: 'Hole', diameter: 6 },
    zMin: -10,
    zMax: 0,
  })

const pocket = feature('pocket', 'pocket', DOWN, [0, 1], 40)
const wall = feature('wall', 'wall', SIDE, [0], 10)
const PART = {
  features: [pocket, wall, hole('hole-a', [5]), hole('hole-b', [6])],
  candidateDirections: [DOWN, SIDE],
}

const reduce = interactionFor(PART)
const run = (...actions: Array<InteractionAction>): Interaction => actions.reduce(reduce, IDLE)

/** The face both readings own, ranked the way the viewer would rank it. */
const face = () => pickForRegion(0, ['pocket', 'wall'])

describe('pressing an arrow before any face', () => {
  it('arms that way up and hides the others', () => {
    const state = run({ type: 'arm', direction: 1 })

    expect(state.activeDirection).toBe(1)
    expect(state.focused).toBeNull()
    expect(arrowsFor({ activeDirection: state.activeDirection })).toEqual({
      visible: true,
      shown: 1,
      active: 1,
    })
  })

  it('walks to the next way up when the armed arrow is pressed again', () => {
    expect(run({ type: 'arm', direction: 1 }, { type: 'arm', direction: 1 }).activeDirection).toBe(
      0,
    )
  })

  it('ignores an arrow the part does not have', () => {
    expect(run({ type: 'arm', direction: 7 })).toEqual(IDLE)
  })

  /**
   * Pressing an arrow reports a miss on the mesh underneath it. Treating that
   * as a clear un-armed the arrow on the same click it was pressed.
   */
  it('is not undone by the miss the arrow reports on the mesh beneath it', () => {
    const state = run({ type: 'arm', direction: 1 }, { type: 'click', pick: null })

    expect(state.activeDirection).toBe(1)
  })
})

describe('a click on a face', () => {
  it('opens the larger reading and keeps it, by itself', () => {
    const state = run({ type: 'click', pick: face() })

    expect(state.focused).toBe('pocket')
    expect(state.kept).toEqual(['pocket'])
    expect(state.guessed).toEqual(['pocket'])
  })

  it('opens the reading from the armed way up, and spends the arming', () => {
    const state = run({ type: 'arm', direction: 1 }, { type: 'click', pick: face() })

    expect(state.focused).toBe('wall')
    expect(state.activeDirection).toBeNull()
  })

  /**
   * The arming stuck: holding it after the click pinned every later click to
   * one way up and left the same face with nothing to cycle to.
   */
  it('cycles the face’s readings on the next click, armed or not', () => {
    const state = run(
      { type: 'arm', direction: 1 },
      { type: 'click', pick: face() },
      { type: 'click', pick: face() },
    )

    expect(state.focused).toBe('pocket')
    expect(state.kept).toEqual(['pocket'])
  })

  it('swaps the guess rather than piling readings up', () => {
    const state = run({ type: 'click', pick: face() }, { type: 'click', pick: face() })

    expect(state.kept).toEqual(['wall'])
    expect(state.guessed).toEqual(['wall'])
  })

  it('falls back to the whole face when nothing is cut from the armed way up', () => {
    const state = run(
      { type: 'arm', direction: 1 },
      { type: 'click', pick: pickForRegion(1, ['pocket']) },
    )

    expect(state.focused).toBe('pocket')
  })
})

describe('what is kept by hand', () => {
  it('survives a walk of the face’s readings', () => {
    const state = run(
      { type: 'click', pick: face() },
      { type: 'toggle', featureTag: 'hole-a' },
      { type: 'click', pick: face() },
    )

    // The walk swapped the guess for `wall`; the hole, ticked by hand, stayed.
    expect(state.kept).toEqual(['hole-a', 'hole-b', 'wall'])
    expect(state.guessed).toEqual(['wall'])
  })

  /** A tick on a ticked row unticks it, whether the tick was a guess or a hand's. */
  it('unticks a guess like any other tick', () => {
    const state = run({ type: 'click', pick: face() }, { type: 'toggle', featureTag: 'pocket' })

    expect(state.kept).toEqual([])
    expect(state.guessed).toEqual([])
  })

  it('keeps and drops a hole with its identical siblings', () => {
    expect(groupOf(PART.features, 'hole-a')).toEqual(['hole-a', 'hole-b'])

    const kept = run({ type: 'toggle', featureTag: 'hole-a' })
    expect(kept.kept).toEqual(['hole-a', 'hole-b'])

    const dropped = reduce(kept, { type: 'toggle', featureTag: 'hole-b' })
    expect(dropped.kept).toEqual([])
  })
})

describe('putting things down', () => {
  it('a miss puts the reading down and drops the guess, not the ticks', () => {
    const state = run(
      { type: 'click', pick: face() },
      { type: 'toggle', featureTag: 'hole-a' },
      { type: 'miss' },
    )

    expect(state.focused).toBeNull()
    expect(state.kept).toEqual(['hole-a', 'hole-b'])
    expect(state.activeDirection).toBeNull()
  })

  it('Escape takes the reading first, then the list', () => {
    const reading = run({ type: 'click', pick: face() }, { type: 'toggle', featureTag: 'hole-a' })

    const once = reduce(reading, { type: 'escape' })
    expect(once.focused).toBeNull()
    expect(once.kept).toEqual(['hole-a', 'hole-b'])

    const twice = reduce(once, { type: 'escape' })
    expect(twice.kept).toEqual([])

    expect(reduce(twice, { type: 'escape' })).toBe(twice)
  })
})

describe('naming a reading from a list', () => {
  it('reads it without clearing the click that offered it', () => {
    const state = run({ type: 'click', pick: face() }, { type: 'read', featureTag: 'wall' })

    expect(state.focused).toBe('wall')
    expect(state.selection.picks).toHaveLength(1)
    // Reading is not arming.
    expect(state.activeDirection).toBeNull()
  })

  it('walks the order the list is drawn in', () => {
    const state = run(
      { type: 'click', pick: face() },
      { type: 'step', order: ['pocket', 'wall'], by: 1 },
    )

    expect(state.focused).toBe('wall')
  })
})
