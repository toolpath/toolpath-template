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
    // Nothing is picked, so the part carries no arrows to press in the first
    // place — arming is reachable only with a face held (Paul, 2026-08-31).
    expect(arrowsFor({})).toEqual({ visible: false, shown: -1, active: null })
  })

  /**
   * An arrow means its own way up, every time. It used to walk to the next
   * direction on a second press — from when arrows aimed the next click
   * rather than naming a reading — which landed on a way up with nothing to
   * read (Paul, 2026-08-31).
   */
  it('stays on the same way up when the armed arrow is pressed again', () => {
    expect(run({ type: 'arm', direction: 1 }, { type: 'arm', direction: 1 }).activeDirection).toBe(
      1,
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

describe('pressing an arrow with a face held', () => {
  /**
   * The stickiness of 2026-08-30: with a reading on screen the other arrows
   * were gone and arming did nothing until the next click, so the only way to
   * ask about another way up was to put the reading down first.
   */
  it('re-reads the held face from that way up, there and then', () => {
    const held = run({ type: 'click', pick: face() })
    const state = reduce(held, { type: 'arm', direction: 1 })

    expect(state.focused).toBe('wall')
    expect(state.activeDirection).toBe(1)
    // The guess follows the reading, exactly as a face click's does.
    expect(state.kept).toEqual(['wall'])
    expect(state.guessed).toEqual(['wall'])
    // The face reads two ways up, so both arrows are on it to switch between.
    expect(arrowsFor({ candidateDirections: [0, 1] }).shown).toEqual([0, 1])
    // And every reading it had is still on the list: pressing an arrow chooses
    // one of them, it does not throw the others away (Paul, 2026-08-31).
    expect(state.selection.candidates).toEqual(held.selection.candidates)
    // Naming it is an answer, so the panel stops asking which way up.
    expect(state.chose).toBe(true)
  })

  /**
   * The arrow of the reading already open is still an answer.
   *
   * It was the one press that did nothing: scoping found the reading that was
   * already focused, the reducer took that for "no change", and the panel went
   * on asking which way up while the person had just said (Paul, 2026-08-31:
   * "clicking the arrow to select the direction isn't working").
   */
  it('answers the question when the arrow is the reading already open', () => {
    const held = run({ type: 'click', pick: face() })
    const first = reduce(held, { type: 'arm', direction: 1 })
    const again = reduce({ ...first, chose: false }, { type: 'arm', direction: 1 })

    expect(again.focused).toBe(first.focused)
    expect(again.chose).toBe(true)
  })

  /** Nothing to read that way up is not an answer: the reading stands. */
  it('leaves the reading alone when that way up reads nothing on the face', () => {
    const held = run({ type: 'click', pick: pickForRegion(5, ['hole-a']) })
    const state = reduce(held, { type: 'arm', direction: 1 })

    expect(state.focused).toBe(held.focused)
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

describe('naming a reading', () => {
  /**
   * The tool list is judged against what is **kept**, not against what is
   * focused, and naming a reading used to move the focus alone — so reading a
   * feature from its card on the part showed the panel one feature and judged
   * the list against another, or against nothing at all (Paul, 2026-08-31:
   * "you're not showing the drills when one is already defined for a hole").
   */
  it('keeps what it names, from nothing at all', () => {
    const state = run({ type: 'read', featureTag: 'wall' })

    expect(state.focused).toBe('wall')
    expect(state.kept).toEqual(['wall'])
    expect(state.chose).toBe(true)
  })

  /** And swaps the guess rather than piling readings up, as a click does. */
  it('swaps the guess it replaces', () => {
    const state = run({ type: 'click', pick: face() }, { type: 'read', featureTag: 'wall' })

    expect(state.kept).toEqual(['wall'])
    expect(state.guessed).toEqual(['wall'])
  })

  /** A reading ticked by hand is not a guess, so naming another leaves it. */
  it('leaves a reading somebody ticked', () => {
    const state = run(
      { type: 'click', pick: face() },
      { type: 'toggle', featureTag: 'hole-a' },
      { type: 'read', featureTag: 'wall' },
    )

    expect(state.kept).toContain('hole-a')
    expect(state.kept).toContain('wall')
    // The click's own guess is swapped, not piled on.
    expect(state.kept).not.toContain('pocket')
  })
})
