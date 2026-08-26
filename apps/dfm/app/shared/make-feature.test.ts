import { describe, expect, it } from 'vitest'

import {
  EMPTY_DRAFT,
  coveringAll,
  isMade,
  makeFeature,
  readsAs,
  chainBetween,
  cutFrom,
  growRun,
  isContinuous,
  perimeterFrom,
  runsIn,
  relationTo,
  withFace,
  withGuess,
} from './make-feature'
import { TEST_DIRECTIONS, testFeature } from './test-part'
import { EMPTY_PLAN, PASSES, withoutEmptied } from './setups'
import { setPassFor, setupForReading } from './plan-actions'
import type { PartFeature } from './contracts'

const UP = TEST_DIRECTIONS[0]!
const DOWN = TEST_DIRECTIONS[1]!

const typed = (tag: string, type: string, dir: typeof UP, faces: number[], kind?: string) =>
  ({
    ...testFeature(tag, type, dir, faces),
    datasheet: kind === undefined ? null : { facts: { kind } },
  }) as PartFeature

const pocket = typed('pocket', 'pocket', UP, [0, 1, 2, 3], 'Pocket')
const wall = typed('wall', 'wall', UP, [1, 2], 'Wall')
const face = typed('face', 'face', UP, [0], 'Face')
const below = typed('below', 'profile', DOWN, [1, 2], 'Profile')
const part = [pocket, wall, face, below]

describe('a reading somebody made', () => {
  it('is an ordinary reading, so every list takes it without knowing', () => {
    const made = makeFeature({ direction: UP, featureType: 'pocket', faces: [2, 0, 1] })

    expect(made.machiningDirection).toEqual(UP)
    expect(made.axis).toEqual(UP)
    // In the part's own face order, so a list of them does not reshuffle.
    expect(made.regionIdxs).toEqual([0, 1, 2])
  })

  it('is marked, because "the Engine found this" is a different claim', () => {
    expect(isMade(makeFeature({ direction: UP, featureType: 'pocket', faces: [0] }))).toBe(true)
    expect(isMade(pocket)).toBe(false)
  })

  it('says so in its tag, for a log or a bug report that has no plan to hand', () => {
    expect(makeFeature({ direction: UP, featureType: 'pocket', faces: [0] }).featureTag).toMatch(
      /^made-/,
    )
  })

  it('carries the Engine family the rules read, when one is named', () => {
    const made = makeFeature({ direction: UP, featureType: 'pocket', faces: [0], kind: 'Pocket' })

    expect((made.datasheet as { facts: { kind: string } }).facts.kind).toBe('Pocket')
  })
})

describe('what already covers these faces', () => {
  it('finds every reading that covers all of them, smallest first', () => {
    // Most of the time the Engine has already reported what somebody is about
    // to draw, and mapping that is better than making a second reading of it.
    expect(coveringAll(part, [1, 2]).map((each) => each.featureTag)).toEqual([
      'wall',
      'below',
      'pocket',
    ])
  })

  it('counts a reading that covers more than these, because it may be the one meant', () => {
    expect(coveringAll(part, [0]).map((each) => each.featureTag)).toEqual(['face', 'pocket'])
  })

  it('goes empty when nothing covers all of them, which is the signal', () => {
    // Face 0 and face 3 are only ever together inside the pocket... and they
    // are, so add one nothing shares.
    expect(coveringAll(part, [0, 1, 2, 3])).toHaveLength(1)
    expect(coveringAll([wall, face], [0, 1])).toEqual([])
  })

  it('says nothing about no faces at all', () => {
    expect(coveringAll(part, [])).toEqual([])
  })
})

describe('what these faces read as, from one way up', () => {
  it('reads the Engine own answer rather than inventing a classifier', () => {
    // Every reading from this direction that touches a chosen face votes for
    // its type, weighted by how many of them it covers.
    const guesses = readsAs(part, UP, [0, 1, 2])

    expect(guesses[0]).toEqual({ featureType: 'pocket', kind: 'Pocket', faces: 3 })
    expect(guesses.map((each) => each.featureType)).toEqual(['pocket', 'wall', 'face'])
  })

  it('counts only readings from the way up being drawn', () => {
    // A profile from −Z says nothing about what these faces are from +Z.
    expect(readsAs(part, UP, [1, 2]).map((each) => each.featureType)).not.toContain('profile')
    expect(readsAs(part, DOWN, [1, 2]).map((each) => each.featureType)).toEqual(['profile'])
  })

  it('leaves the family unsaid where the readings that voted disagree', () => {
    // Two kinds under one type is the Engine saying the type does not settle it.
    const split = [typed('a', 'pocket', UP, [0], 'Pocket'), typed('b', 'pocket', UP, [1], 'Slot')]

    expect(readsAs(split, UP, [0, 1])[0]).toEqual({
      featureType: 'pocket',
      kind: undefined,
      faces: 2,
    })
  })

  it('returns every candidate, not just the winner', () => {
    // "A wall covering three of these and a pocket covering all four" is the
    // sentence somebody needs, not a single word.
    expect(readsAs(part, UP, [0, 1, 2]).length).toBeGreaterThan(1)
  })

  it('says nothing about faces nothing reaches from there', () => {
    expect(readsAs(part, UP, [])).toEqual([])
    expect(readsAs([below], UP, [1])).toEqual([])
  })
})

describe('the draft, as the panel holds it', () => {
  const drafting = { ...EMPTY_DRAFT, direction: 0 }

  it('adds a face, and the same click takes it off', () => {
    const one = withFace(drafting, 2)

    expect(one.faces).toEqual([2])
    expect(withFace(one, 2).faces).toEqual([])
  })

  it('keeps them in the part own order, however they were clicked', () => {
    // A running list that reshuffled would move the row under the pointer.
    expect(withFace(withFace(withFace(drafting, 3), 1), 2).faces).toEqual([1, 2, 3])
  })

  it('guesses the type from the faces, and keeps guessing as they change', () => {
    // A type filled in from one face should not stick once there are three.
    const one = withGuess(withFace(drafting, 0), part, TEST_DIRECTIONS)
    expect(one.featureType).toBe('face')

    const three = withGuess({ ...one, faces: [0, 1, 2] }, part, TEST_DIRECTIONS)
    expect(three.featureType).toBe('pocket')
  })

  it('stops guessing once somebody names one, which is why the field exists', () => {
    const named = { ...drafting, faces: [0, 1, 2], featureType: 'wall', named: true }

    expect(withGuess(named, part, TEST_DIRECTIONS).featureType).toBe('wall')
  })

  it('has nothing to guess from before a way up is chosen', () => {
    const noWayUp = withGuess({ ...EMPTY_DRAFT, faces: [0, 1] }, part, TEST_DIRECTIONS)

    expect(noWayUp.featureType).toBeNull()
  })
})

describe('how one way up stands to another', () => {
  it('names the opposite side of the part, rather than leaving it to be spotted', () => {
    // A reading covering the same faces from the other side is not the same
    // operation, and offering it as one is bad advice.
    expect(relationTo(UP, DOWN)).toBe('opposite')
    expect(relationTo(UP, UP)).toBe('same')
    expect(relationTo(UP, { x: 1, y: 0, z: 0 })).toBe('different')
  })

  it('forgives the last bits, because two reports of one way up differ in them', () => {
    expect(relationTo(UP, { x: 0, y: 0.0001, z: 1 })).toBe('same')
  })
})

describe('the run of faces between two', () => {
  it('joins faces through the readings that cover both', () => {
    // As close to "next to each other, in an operation you could run" as this
    // app can get: a region carries a shape kind and an area and no topology.
    expect(chainBetween(part, UP, 0, 3)).toEqual([0, 3])
  })

  it('takes the shortest way through, not the first one found', () => {
    const chain = [
      typed('a', 'wall', UP, [10, 11]),
      typed('b', 'wall', UP, [11, 12]),
      typed('c', 'wall', UP, [12, 13]),
      typed('long', 'profile', UP, [10, 20, 21, 22, 13]),
    ]

    expect(chainBetween(chain, UP, 10, 13)).toEqual([10, 13])
    expect(chainBetween(chain, UP, 10, 12)).toEqual([10, 11, 12])
  })

  it('will not cross a way up, because a chain no tool can follow is not one', () => {
    const split = [typed('here', 'wall', UP, [0, 1]), typed('there', 'wall', DOWN, [1, 2])]

    expect(chainBetween(split, UP, 0, 2)).toEqual([])
  })

  it('answers a face against itself', () => {
    expect(chainBetween(part, UP, 1, 1)).toEqual([1])
  })
})

describe('the perimeter, from one way up', () => {
  it('is what the Engine own contours cover', () => {
    // A profile *is* the boundary contour of its direction — that is what the
    // word means here, and it already reports one per direction that has one.
    const around = [
      typed('contour', 'profile', UP, [0, 1, 2], 'Profile'),
      typed('island', 'filleted_profile', UP, [7, 8], 'Profile'),
      typed('inside', 'pocket', UP, [4, 5], 'Pocket'),
      typed('below', 'profile', DOWN, [9], 'Profile'),
    ]

    expect(perimeterFrom(around, UP)).toEqual([0, 1, 2, 7, 8])
  })

  it('knows a contour by the Engine family, not the spelling of its type', () => {
    const odd = [typed('x', 'some_new_contour', UP, [3], 'Profile')]

    expect(perimeterFrom(odd, UP)).toEqual([3])
  })

  it('says nothing where the way up has no contour', () => {
    expect(perimeterFrom([typed('p', 'pocket', UP, [0], 'Pocket')], UP)).toEqual([])
  })
})

describe('a feature is one continuous piece', () => {
  /*
   * An operation runs over faces that touch — a pocket is its floor and the
   * walls around it, not a floor here and a wall on the far side of the part.
   */
  const around = [
    typed('left', 'wall', UP, [10, 11]),
    typed('middle', 'wall', UP, [11, 12]),
    typed('far', 'wall', UP, [40, 41]),
  ]

  it('is one run when every face reaches every other', () => {
    expect(isContinuous(around, UP, [10, 11, 12])).toBe(true)
    expect(runsIn(around, UP, [10, 11, 12])).toEqual([[10, 11, 12]])
  })

  it('is not, when two groups never meet', () => {
    expect(isContinuous(around, UP, [10, 40])).toBe(false)
  })

  it('says which groups they are, so somebody knows which face to take off', () => {
    // "These four and that one" beats a yes or a no.
    expect(runsIn(around, UP, [10, 11, 40, 41])).toEqual([
      [10, 11],
      [40, 41],
    ])
  })

  it('counts one face as continuous, and none as not', () => {
    expect(isContinuous(around, UP, [10])).toBe(true)
    expect(isContinuous(around, UP, [])).toBe(false)
  })

  it('refuses rather than wrongly allows, where the proxy is wrong', () => {
    // Two faces that touch but that no single reading covers read as unjoined.
    // Conservative on purpose: a made feature is refused, not silently wrong.
    const unlinked = [typed('a', 'wall', UP, [1]), typed('b', 'wall', UP, [2])]

    expect(isContinuous(unlinked, UP, [1, 2])).toBe(false)
  })
})

describe('chaining, as a click', () => {
  const chain = [
    typed('a', 'wall', UP, [10, 11]),
    typed('b', 'wall', UP, [11, 12]),
    typed('c', 'wall', UP, [12, 13]),
  ]
  const world = { features: chain, directions: TEST_DIRECTIONS }
  const chained = { ...EMPTY_DRAFT, direction: 0, chaining: true }

  it('adds the run between the last face and this one', () => {
    // Click the first and the last, which is how a row is selected everywhere.
    const first = withFace(chained, 10, world)
    const run = withFace(first, 13, world)

    expect(run.faces).toEqual([10, 11, 12, 13])
  })

  it('adds one face when chaining is off', () => {
    const off = withFace(withFace({ ...chained, chaining: false }, 10, world), 13, world)

    expect(off.faces).toEqual([10, 13])
  })

  it('runs from the last face clicked, not the last in the list', () => {
    // `faces` is in the part's own order, and a chain from the wrong end runs
    // the wrong way round the part.
    const drawn = withFace(withFace(chained, 13, world), 12, world)

    expect(drawn.anchor).toBe(12)
  })

  it('adds just the face where nothing joins them, because the click asked for it', () => {
    const apart = {
      features: [...chain, typed('far', 'wall', UP, [90])],
      directions: TEST_DIRECTIONS,
    }
    const drawn = withFace(withFace(chained, 10, apart), 90, apart)

    expect(drawn.faces).toEqual([10, 90])
  })

  it('takes off only the face clicked, chaining or not', () => {
    // A click that removed a run is one nobody could predict the size of.
    const run = withFace(withFace(chained, 10, world), 13, world)

    expect(withFace(run, 11, world).faces).toEqual([10, 12, 13])
  })
})

describe('growing the run the chosen faces sit in', () => {
  /*
   * What Profile does when the Engine reports no contour from this way up,
   * which on a real part is most of them.
   */
  const reach = [typed('all', 'contour_surface', UP, [1, 2, 3, 4]), typed('far', 'wall', DOWN, [5])]
  const touching: ReadonlyMap<number, ReadonlySet<number>> = new Map([
    [1, new Set([2])],
    [2, new Set([1, 3])],
    [3, new Set([2, 4])],
    [4, new Set([3, 5])],
    [5, new Set([4])],
  ])

  it('takes everything the chosen faces reach', () => {
    expect(growRun(reach, UP, [1], touching)).toEqual([1, 2, 3, 4])
  })

  it('stops where this way up cannot cut', () => {
    // A run crossing onto faces no reading from here covers is one no tool
    // could follow, and it would wrap round the part and take everything.
    expect(growRun(reach, UP, [4], touching)).not.toContain(5)
  })

  it('grows from what is chosen, not from nothing', () => {
    // A part has an outside and any number of pockets; "the perimeter" means
    // something only once somebody has said which surface they mean.
    expect(growRun(reach, UP, [], touching)).toEqual([])
  })
})

describe('before the mesh arrives', () => {
  it('treats an empty topology as "not yet", not as "nothing touches"', () => {
    /*
     * An empty `Map` is truthy. Taken at face value it gave every face its own
     * run, so a plainly continuous set read as one piece per face and refused
     * itself — and the mesh arrives a moment after the panel does.
     */
    const together = [typed('one', 'profile', UP, [0, 1])]

    expect(isContinuous(together, UP, [0, 1], new Map())).toBe(true)
    expect(runsIn(together, UP, [0, 1], new Map())).toEqual([[0, 1]])
  })

  it('prefers the mesh once it has one', () => {
    // Two faces one reading covers, that the mesh says do not touch.
    const together = [typed('one', 'profile', UP, [0, 1])]
    const apart = new Map([
      [0, new Set<number>()],
      [1, new Set<number>()],
    ])

    expect(isContinuous(together, UP, [0, 1], apart)).toBe(false)
  })
})

describe('cutting a made reading from somewhere else', () => {
  /*
   * The faces are a fact about the part; the way up is a choice about the
   * setup, and it is the one somebody changes their mind about.
   */
  const around = [
    typed('above', 'pocket', UP, [0, 1], 'Pocket'),
    typed('beside', 'wall', DOWN, [0, 1], 'Wall'),
  ]
  const made = makeFeature({ direction: UP, featureType: 'pocket', faces: [0, 1], kind: 'Pocket' })

  it('keeps the faces and moves the way up', () => {
    const moved = cutFrom(around, made, DOWN)

    expect(moved.regionIdxs).toEqual([0, 1])
    expect(moved.machiningDirection).toEqual(DOWN)
    expect(moved.axis).toEqual(DOWN)
  })

  it('works out what it is from there, because the type was never a property of the faces', () => {
    // A set that reads as a pocket from above reads as a wall from the side.
    expect(cutFrom(around, made, DOWN).featureType).toBe('wall')
  })

  it('is still a made reading', () => {
    expect(isMade(cutFrom(around, made, DOWN))).toBe(true)
  })

  it('keeps the name it had where the new way up has nothing to say', () => {
    // A name somebody chose beats no name.
    expect(cutFrom([], made, DOWN).featureType).toBe('pocket')
  })

  it('leaves a reported reading alone', () => {
    // The Engine's answer to "what is cuttable from here" — pointing it
    // somewhere else would be inventing an answer it never gave.
    expect(cutFrom(around, around[0]!, DOWN)).toBe(around[0])
  })
})

describe('what re-pointing a made reading does to the plan', () => {
  /*
   * The assignment named a setup for the way up it *was* cut from. Leaving it
   * behind would have the plan claim a direction cuts work that is no longer
   * there.
   */
  const made = makeFeature({ direction: UP, featureType: 'pocket', faces: [0, 1], kind: 'Pocket' })
  const all = [made]
  const held = setPassFor(EMPTY_PLAN, TEST_DIRECTIONS, all, [made], PASSES)

  it('is cut from the way up it was drawn from, to start with', () => {
    expect(setupForReading(held, TEST_DIRECTIONS, made)?.directionIndex).toBe(0)
  })

  it('is cut from the new way up once moved, and the old one is empty', () => {
    // Changing where a thing is cut is not a decision to stop cutting it.
    const moved = cutFrom(all, made, DOWN)
    const { [made.featureTag]: gone, ...rest } = held.assigned
    const after = setPassFor(
      withoutEmptied(held, { ...held, assigned: rest }, all),
      TEST_DIRECTIONS,
      [moved],
      [moved],
      PASSES,
    )

    expect(setupForReading(after, TEST_DIRECTIONS, moved)?.directionIndex).toBe(1)
    expect(after.setups.map((setup) => setup.directionIndex)).toEqual([1])
  })
})
