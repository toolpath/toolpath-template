import { describe, expect, it } from 'vitest'
import { directionColor } from '@toolpath/viewer'

import { DEFAULT_RULES } from './rule-presets'
import { evaluatePart } from './rules'
import {
  EMPTY_PLAN,
  PASSES,
  assign,
  coverageOf,
  cutOnce,
  claimedRegions,
  areaOfRegions,
  coveredRegions,
  cutRegions,
  cutState,
  cutsFace,
  cutsFrom,
  givenUp,
  groupCutState,
  noting,
  faceCounts,
  partArea,
  setPass,
  setupFor,
  withoutEmptied,
} from './setups'
import type { SetupPlan } from './setups'
import { setFaceCut } from './faces'
import { TEST_DIRECTIONS, testFeature, testPart } from './test-part'

/**
 * Setups: how the part is held, and what is cut from each way up.
 *
 * The Engine reports every feature per direction — the same surface is a `face`
 * cut straight down from one way and a `wall` reached sideways from another —
 * so an arrangement is a choice among readings that already exist. Nothing here
 * invents an orientation.
 *
 * The fixture is this app's own `testPart` — six faces, four ways up, and one
 * face reachable from three of them, which is exactly the ambiguity a plan
 * resolves.
 *
 * The blocks that exercised `generate` in the picker build their plans by hand
 * here instead: the generators are a later PR, and the invariants under test are
 * `setups.ts`'s own.
 */

const cube = testPart()
const features = cube.features
const verdicts = evaluatePart(DEFAULT_RULES, features)

const ascending = (a: number, b: number) => a - b

/** A plan that assigns whatever it takes to reach every region exactly once. */
const coveringPlan = (pass: 'rough' | 'finish' = 'rough'): SetupPlan => {
  const setup = setupFor(cube.candidateDirections, 0)
  const claimed = new Set<number>()
  const assigned: SetupPlan['assigned'] = {}

  for (const feature of features) {
    if (feature.regionIdxs.some((idx) => !claimed.has(idx))) {
      assigned[feature.featureTag] = { [pass]: setup.id }
      for (const idx of feature.regionIdxs) claimed.add(idx)
    }
  }

  return { setups: [setup], assigned }
}

describe('coverage', () => {
  it("counts the part's whole surface as the denominator", () => {
    expect(partArea(cube)).toBeGreaterThan(0)
  })

  it('is nothing at all before anything is assigned', () => {
    const coverage = coverageOf(cube, features, EMPTY_PLAN, 'rough')

    expect(coverage.mapped).toBe(0)
    expect(coverage.regions.size).toBe(0)
  })

  it('counts a region once however many features cover it', () => {
    // Two features covering the same face have mapped one face. Counting both
    // would let a plan claim more surface than the part has.
    const coverage = coverageOf(cube, features, coveringPlan(), 'rough')

    expect(coverage.mapped).toBeLessThanOrEqual(1)
    expect(coverage.regions.size).toBeLessThanOrEqual(cube.regions.length)
  })

  it('reaches the whole part once every region is taken', () => {
    expect(coverageOf(cube, features, coveringPlan(), 'rough').mapped).toBeCloseTo(1, 6)
  })

  it('counts only the pass that was asked for', () => {
    // Roughing and finishing are separate claims, so a plan that has roughed
    // everything has finished nothing.
    expect(coverageOf(cube, features, coveringPlan('rough'), 'finish').mapped).toBe(0)
  })
})

describe('adding one feature to a setup', () => {
  const setup = setupFor(cube.candidateDirections, 0)
  const plan: SetupPlan = { setups: [setup], assigned: {} }
  const wall = features[3]!

  it('assigns that feature and nothing else', () => {
    const next = { ...plan, assigned: assign(plan, wall.featureTag, 'rough', setup.id) }

    expect(Object.keys(next.assigned)).toEqual([wall.featureTag])
  })

  it("reaches exactly that feature's faces, no others", () => {
    // What looks like features being tacked on is one feature owning several
    // faces: a wall on a real part can carry eight of the part's ninety-five,
    // and lighting all eight is that one wall, not eight decisions.
    const next = { ...plan, assigned: assign(plan, wall.featureTag, 'rough', setup.id) }
    const reach = coverageOf(cube, features, next, 'rough')

    expect([...reach.regions].sort(ascending)).toEqual([...wall.regionIdxs].sort(ascending))
  })

  it('touches one pass of one feature when one pass was asked for', () => {
    const next = setPass(plan, wall.featureTag, 'rough', setup.id)

    expect(next[wall.featureTag]).toEqual({ rough: setup.id })
    expect(Object.keys(next)).toEqual([wall.featureTag])
  })
})

describe('roughing and finishing, for the generators', () => {
  it('move together when a whole arrangement was asked for', () => {
    // A press that writes a whole arrangement may say "this direction does
    // both". Nothing a person clicks on a single feature comes through here —
    // those go through `cutOnce`, one pass at a time, because a button labelled
    // "Rough" that also sets finishing is a decision nobody made.
    const assigned = assign(EMPTY_PLAN, 'tag', 'rough', 'setup-a')

    expect(assigned.tag).toEqual({ rough: 'setup-a', finish: 'setup-a' })
  })

  it('stays split once somebody has split it', () => {
    const plan: SetupPlan = {
      setups: [],
      assigned: { tag: { rough: 'setup-a', finish: 'setup-b' } },
    }

    expect(assign(plan, 'tag', 'rough', 'setup-c').tag).toEqual({
      rough: 'setup-c',
      finish: 'setup-b',
    })
  })

  it('splits when the finishing pass is the one being set', () => {
    const plan: SetupPlan = {
      setups: [],
      assigned: { tag: { rough: 'setup-a', finish: 'setup-a' } },
    }

    expect(assign(plan, 'tag', 'finish', 'setup-b').tag).toEqual({
      rough: 'setup-a',
      finish: 'setup-b',
    })
  })
})

describe('one pass, said explicitly', () => {
  it('leaves the other pass where it was', () => {
    // Pressing "finish" on a feature roughed elsewhere is a deliberate split,
    // and the app moving the other pass would be overruling it.
    const both: SetupPlan = { setups: [], assigned: { tag: { rough: 'a', finish: 'a' } } }

    expect(setPass(both, 'tag', 'finish', 'b').tag).toEqual({ rough: 'a', finish: 'b' })
  })

  it('takes a feature out of a setup without touching the rest', () => {
    const both: SetupPlan = { setups: [], assigned: { tag: { rough: 'a', finish: 'a' } } }

    expect(setPass(both, 'tag', 'rough', undefined).tag).toEqual({
      rough: undefined,
      finish: 'a',
    })
  })
})

describe('cutting each face once per pass', () => {
  const face = testFeature('face-1', 'face', { x: 0, y: 0, z: -1 }, [0])
  const profile = testFeature('profile-1', 'profile', { x: 0, y: -1, z: 0 }, [0, 1, 2])
  const all = [face, profile]

  it('takes a face off whatever was cutting it before', () => {
    // Roughed as a `face` from −Z and again inside a profile from −Y is roughed
    // twice, and the estimate pays for both.
    const held: SetupPlan = { setups: [], assigned: { [face.featureTag]: { rough: 'a' } } }
    const assigned = cutOnce(held, all, profile, 'rough', 'b')

    expect(assigned[profile.featureTag]?.rough).toBe('b')
    expect(assigned[face.featureTag]?.rough).toBeUndefined()
  })

  it('takes the faces it asked for, and leaves the rest of the reading where it was', () => {
    /*
     * The rule this file exists for. Claiming one wall of a three-face profile
     * used to unassign the whole profile — on a real part that threw eleven
     * faces out of the plan to move one, and nothing said so.
     */
    const held: SetupPlan = { setups: [], assigned: { [profile.featureTag]: { rough: 'b' } } }
    const assigned = cutOnce(held, all, face, 'rough', 'a')

    expect(assigned[face.featureTag]?.rough).toBe('a')
    expect(assigned[profile.featureTag]?.rough).toBe('b')
    expect(assigned[profile.featureTag]?.without?.rough).toEqual([0])
  })

  it('unassigns a reading it has taken the last face from', () => {
    // A reading cutting no faces is not a decision anybody made, and a way up
    // holding it would be holding work it does not do.
    const held: SetupPlan = { setups: [], assigned: { [face.featureTag]: { rough: 'a' } } }
    const assigned = cutOnce(held, all, profile, 'rough', 'b')

    expect(assigned[face.featureTag]?.rough).toBeUndefined()
    expect(assigned[face.featureTag]?.without).toBeUndefined()
  })

  it('gives a reading all of its own faces back when it is claimed again', () => {
    // Pressing the pass on the reading you want stays the whole gesture.
    const lost: SetupPlan = {
      setups: [],
      assigned: {
        [face.featureTag]: { rough: 'a' },
        [profile.featureTag]: { rough: 'b', without: { rough: [0] } },
      },
    }

    const assigned = cutOnce(lost, all, profile, 'rough', 'b')

    expect(assigned[profile.featureTag]?.without).toBeUndefined()
    expect(assigned[face.featureTag]?.rough).toBeUndefined()
  })

  it('keeps a note of what one pass lost without touching the other', () => {
    const held: SetupPlan = {
      setups: [],
      assigned: { [profile.featureTag]: { rough: 'b', finish: 'b' } },
    }

    const assigned = cutOnce(held, all, face, 'rough', 'a')

    expect(assigned[profile.featureTag]?.without).toEqual({ rough: [0] })
    expect(assigned[profile.featureTag]?.finish).toBe('b')
  })

  it('drops the note when the pass carrying it is let go', () => {
    // Otherwise a reading assigned again later starts out missing faces it
    // never gave up.
    const lost: SetupPlan = {
      setups: [],
      assigned: { [profile.featureTag]: { rough: 'b', without: { rough: [0] } } },
    }

    const assigned = cutOnce(lost, all, profile, 'rough', undefined)

    expect(assigned[profile.featureTag]?.rough).toBeUndefined()
    expect(assigned[profile.featureTag]?.without).toBeUndefined()
  })

  it('disturbs nothing when a claim is let go', () => {
    // Letting go claims nothing, so it cannot take a face from anybody — and it
    // deliberately hands none back either: several readings may have given the
    // same face up over time, and picking one would be the app deciding.
    const lost: SetupPlan = {
      setups: [],
      assigned: {
        [face.featureTag]: { rough: 'a' },
        [profile.featureTag]: { rough: 'b', without: { rough: [0] } },
      },
    }

    const assigned = cutOnce(lost, all, face, 'rough', undefined)

    expect(assigned[profile.featureTag]?.without?.rough).toEqual([0])
  })

  it('leaves the other pass alone', () => {
    // Roughed from above and finished from the side is one plan, not a clash.
    const held: SetupPlan = {
      setups: [],
      assigned: { [face.featureTag]: { rough: 'a', finish: 'a' } },
    }

    expect(cutOnce(held, all, profile, 'rough', 'b')[face.featureTag]?.finish).toBe('a')
  })

  it('leaves readings that share no face where they were', () => {
    const other = testFeature('wall-1', 'wall', { x: 0, y: 0, z: -1 }, [7])
    const held: SetupPlan = { setups: [], assigned: { [other.featureTag]: { rough: 'a' } } }

    expect(cutOnce(held, [...all, other], face, 'rough', 'b')[other.featureTag]?.rough).toBe('a')
  })
})

describe('setups that appear from nowhere', () => {
  const wall = testFeature('wall-1', 'wall', { x: 0, y: 1, z: 0 }, [0])
  const profile = testFeature('profile-1', 'profile', { x: 0, y: -1, z: 0 }, [0, 1])
  const all = [wall, profile]
  const plus = { id: 'plus-y', directionIndex: 0, name: '+Y' }
  const minus = { id: 'minus-y', directionIndex: 1, name: '−Y' }

  it('drops an orientation this change left cutting nothing', () => {
    // Claiming a face takes it off whatever had it, and that can be the only
    // work its setup held — leaving a setup in the list that cuts nothing,
    // which reads as the app having invented one.
    const before: SetupPlan = {
      setups: [plus, minus],
      assigned: { [wall.featureTag]: { rough: plus.id } },
    }
    const after: SetupPlan = {
      ...before,
      assigned: cutOnce(before, all, profile, 'rough', minus.id),
    }

    expect(withoutEmptied(before, after, all).setups).toEqual([minus])
  })

  it('leaves a setup somebody just made and has not filled', () => {
    // Deleting it under them is the same fault in the other direction.
    const before: SetupPlan = { setups: [plus], assigned: {} }

    expect(withoutEmptied(before, before, all).setups).toEqual([plus])
  })
})

describe('whether a setup is already cutting something', () => {
  const setup = { id: 's1', directionIndex: 0, name: '+Z' }

  it('says no when no setup holds the direction', () => {
    // The trap this exists to close: with nothing held, both sides of the
    // obvious comparison are `undefined`, so every button on the part reads as
    // pressed before there is anything to press it against.
    expect(cutsFrom(EMPTY_PLAN, 'tag', 'rough', null)).toBe(false)
    expect(cutsFrom(EMPTY_PLAN, 'tag', 'rough', undefined)).toBe(false)
  })

  it('says no for a feature nothing has claimed', () => {
    expect(cutsFrom({ setups: [setup], assigned: {} }, 'tag', 'rough', setup)).toBe(false)
  })

  it('says yes only for the pass that was assigned', () => {
    const plan: SetupPlan = { setups: [setup], assigned: { tag: { rough: setup.id } } }

    expect(cutsFrom(plan, 'tag', 'rough', setup)).toBe(true)
    expect(cutsFrom(plan, 'tag', 'finish', setup)).toBe(false)
  })
})

describe('naming a direction', () => {
  it('carries both the order and the way up', () => {
    // "Op 2" is the sequence and "−Z" is the orientation; a name with one but
    // not the other has to be cross-referenced against the list to be read.
    expect(setupFor(cube.candidateDirections, 1, 1).name).toMatch(/^Direction 2, /)
  })
})

describe('the count three lists show', () => {
  /*
   * Paul's screenshot: a reading holding two faces handed to it and none of its
   * own read `12 regions` in the mapping list, `0 of 12` in the confirmed
   * directions and `2 of 12` in the datasheet. Three formulas, three answers,
   * none of them the true one.
   */
  const wall = testFeature('wall', 'wall', TEST_DIRECTIONS[0]!, [0, 1])
  const profile = testFeature('profile', 'profile', TEST_DIRECTIONS[1]!, [2, 3])
  const both = [wall, profile]

  /** The wall cutting one face of the profile's, and none of its own. */
  const handed = setFaceCut(EMPTY_PLAN, TEST_DIRECTIONS, both, wall, PASSES, 2, true)

  it('counts a handed face in the total, not only in the numerator', () => {
    // A face somebody handed it is one of its faces. Leaving it out of the
    // total makes the numerator look like a shortfall rather than a count.
    expect(faceCounts(handed, wall)).toEqual({ faces: 3, cut: 1 })
  })

  it('reads an unmapped reading as whole, because no decision has been made about it', () => {
    expect(faceCounts(EMPTY_PLAN, wall)).toEqual({ faces: 2, cut: 2 })
  })

  it('counts a face cut in either pass, exactly as the tick in the editor does', () => {
    // A reading finished but not roughed read as untouched, while its own
    // editor listed every one of its faces as cut.
    const roughOnly = setFaceCut(EMPTY_PLAN, TEST_DIRECTIONS, both, wall, ['rough'], 0, true)

    expect(faceCounts(roughOnly, wall)).toEqual({ faces: 2, cut: 1 })
  })
})

/**
 * What the plan has a reading cutting, as against what the Engine reported.
 *
 * `reported-regions.test.ts` records what confusing the two has cost: F51, F58,
 * F62 and the direction wash, four bugs weeks apart that all read as different
 * kinds of bug. These are the functions that hold the distinction, and until
 * now they were reached only through their callers — so a caller that stopped
 * asking them would have been the only thing to notice.
 */
describe('what a partly-claimed reading covers', () => {
  const part = testPart()
  const profile = part.features.find((f) => f.featureTag === 'down-profile')!
  const wall = part.features.find((f) => f.featureTag === 'up-wall')!
  const setup = setupFor(TEST_DIRECTIONS, 1)

  /** The profile assigned whole, in both passes. */
  const whole: SetupPlan = {
    setups: [setup],
    assigned: { 'down-profile': { rough: setup.id, finish: setup.id } },
  }

  /** The same, having given face 4 up for roughing only. */
  const partial: SetupPlan = {
    setups: [setup],
    assigned: {
      'down-profile': { rough: setup.id, finish: setup.id, without: { rough: [4] } },
    },
  }

  /** And the same, handed face 0, which the Engine never reported there. */
  const handed: SetupPlan = {
    setups: [setup],
    assigned: { 'down-profile': { rough: setup.id, finish: setup.id, also: { rough: [0] } } },
  }

  describe('the faces it actually cuts', () => {
    it('is nothing at all while nothing is assigned', () => {
      // Not the Engine's list. An unassigned reading cuts no faces, and
      // answering with `regionIdxs` here is what painted the whole part.
      expect(cutRegions(EMPTY_PLAN, profile, 'rough')).toEqual([])
    })

    it('is the reading own faces when it holds all of them', () => {
      expect(cutRegions(whole, profile, 'rough')).toEqual(profile.regionIdxs)
    })

    it('drops a face that was given up', () => {
      expect(cutRegions(partial, profile, 'rough')).toEqual([2, 3, 5])
    })

    it('leaves the other pass holding it, because a claim is per pass', () => {
      // The same surface roughed from above and finished from the side is one
      // plan, not a conflict.
      expect(cutRegions(partial, profile, 'finish')).toEqual(profile.regionIdxs)
    })

    it('adds a face handed to it, which the Engine never put there', () => {
      expect(cutRegions(handed, profile, 'rough')).toEqual([...profile.regionIdxs, 0])
    })
  })

  describe('every face it is about', () => {
    it('counts a handed face even in the pass that does not cut it', () => {
      /*
       * The narrower question is what one pass cuts; this is what the editor
       * lists and what the part paints. A face taken on for finishing alone is
       * still one of this reading's faces while roughing is on screen — it is
       * simply not roughed.
       */
      const forFinishOnly: SetupPlan = {
        setups: [setup],
        assigned: { 'down-profile': { finish: setup.id, also: { finish: [0] } } },
      }

      expect(coveredRegions(forFinishOnly, profile)).toContain(0)
      expect(cutRegions(forFinishOnly, profile, 'rough')).toEqual([])
    })
  })

  describe('which faces it let go of', () => {
    it('is nothing when the reading is not assigned at all', () => {
      // An unassigned reading has not given anything up; it never held it.
      expect(givenUp(EMPTY_PLAN, profile, 'rough')).toEqual([])
    })

    it('is nothing when it holds everything it was reported with', () => {
      expect(givenUp(whole, profile, 'rough')).toEqual([])
    })

    it('names the faces, in the pass that lost them', () => {
      expect(givenUp(partial, profile, 'rough')).toEqual([4])
      expect(givenUp(partial, profile, 'finish')).toEqual([])
    })
  })

  describe('whether a face is cut here', () => {
    it('follows the claim rather than the report', () => {
      expect(cutsFace(whole, profile, 'rough', 4)).toBe(true)
      expect(cutsFace(partial, profile, 'rough', 4)).toBe(false)
      // Given up for roughing only, so finishing still has it.
      expect(cutsFace(partial, profile, 'finish', 4)).toBe(true)
    })

    it('counts a handed face, which is not in the report at all', () => {
      expect(profile.regionIdxs).not.toContain(0)
      expect(cutsFace(handed, profile, 'rough', 0)).toBe(true)
    })
  })

  describe('how pressed a pass button should read', () => {
    it('is off where the setup does not cut it', () => {
      expect(cutState(EMPTY_PLAN, profile, 'rough', setup)).toBe(false)
    })

    it('is on where it holds every face it was reported with', () => {
      expect(cutState(whole, profile, 'rough', setup)).toBe(true)
    })

    /*
     * The three-state answer this exists for. A button that reads fully pressed
     * on a reading holding three of its four faces is the app claiming more
     * than the plan says — and `'some'` is what makes the next press mean
     * something rather than silently doing one of two things.
     */
    it('is part-cut where it gave a face up', () => {
      expect(cutState(partial, profile, 'rough', setup)).toBe('some')
    })

    it('is on for a reading handed a face, which took nothing away', () => {
      // Handing a face *to* a reading is not a partial claim: it still cuts
      // everything the Engine said it would.
      expect(cutState(handed, profile, 'rough', setup)).toBe(true)
    })
  })

  describe('how pressed a whole group should read', () => {
    const both: SetupPlan = {
      setups: [setup],
      assigned: {
        'down-profile': { rough: setup.id },
        'up-wall': { rough: setup.id },
      },
    }

    it('is off for a group with nothing in it', () => {
      // A way up holding no readings, or a hole group filtered down to none.
      expect(groupCutState(both, [], 'rough', setup)).toBe(false)
    })

    it('is on only when every one of them is whole', () => {
      expect(groupCutState(both, [profile, wall], 'rough', setup)).toBe(true)
    })

    it('is off only when none of them is cut here', () => {
      expect(groupCutState(EMPTY_PLAN, [profile, wall], 'rough', setup)).toBe(false)
    })

    it('is part-cut for a group only some of which is claimed', () => {
      const one: SetupPlan = { setups: [setup], assigned: { 'up-wall': { rough: setup.id } } }

      expect(groupCutState(one, [profile, wall], 'rough', setup)).toBe('some')
    })

    it('is part-cut for a group whose members are themselves part-cut', () => {
      // A group half of which has given faces up is not a group that reads done.
      const mixed: SetupPlan = {
        setups: [setup],
        assigned: {
          'down-profile': { rough: setup.id, without: { rough: [4] } },
          'up-wall': { rough: setup.id },
        },
      }

      expect(groupCutState(mixed, [profile, wall], 'rough', setup)).toBe('some')
    })
  })

  describe('every face the plan claims', () => {
    it('counts a face once however many readings cut it', () => {
      /*
       * The denominator of coverage. Region 2 is reachable from three ways up,
       * which is the ambiguity the whole mapping exists to resolve — counting
       * it per reading would let a plan claim more of the part than it has.
       */
      const twice: SetupPlan = {
        setups: [setup],
        assigned: {
          'down-profile': { rough: setup.id },
          'left-wall': { rough: setup.id },
        },
      }

      expect([...claimedRegions(part.features, twice, 'rough')].sort()).toEqual([2, 3, 4, 5])
    })

    it('answers per pass, and defaults to roughing', () => {
      expect(claimedRegions(part.features, whole, 'finish')).toEqual(
        claimedRegions(part.features, whole, 'rough'),
      )
      expect(claimedRegions(part.features, partial)).toEqual(
        claimedRegions(part.features, partial, 'rough'),
      )
    })
  })

  describe('the area of a named set of faces', () => {
    it('sums what a part-cut reading holds', () => {
      // Six faces of 100 mm² apiece, so three of them is half the part.
      expect(areaOfRegions(part, [0, 1, 2])).toBe(300)
    })

    it('ignores a face the part does not have, rather than reading NaN', () => {
      // A handed face index out of range would otherwise poison every area on
      // screen, and `NaN%` is a coverage bar that renders as nothing.
      expect(areaOfRegions(part, [0, 99])).toBe(100)
    })

    it('is nothing for nothing', () => {
      expect(areaOfRegions(part, [])).toBe(0)
    })
  })

  describe('writing down what a reading kept', () => {
    it('records the faces it let go, in the part own order', () => {
      const note = noting(undefined, profile, [5, 2], 'rough')

      // `regionIdxs` order, not the order they were handed in, so a panel
      // reading it back does not reshuffle as faces are taken one at a time.
      expect(note.without?.rough).toEqual([3, 4])
    })

    it('records a face it was handed, which is not its own', () => {
      const note = noting(undefined, profile, [...profile.regionIdxs, 0], 'rough')

      expect(note.also?.rough).toEqual([0])
      expect(note.without).toBeUndefined()
    })

    it('drops the note entirely once the reading is whole again', () => {
      const partly = noting(undefined, profile, [2, 3], 'rough')
      const restored = noting(partly, profile, profile.regionIdxs, 'rough')

      // Not an empty list left behind: `cutRegions` takes a short cut when
      // there is no note at all, and an empty one is a slower way to say the
      // same thing that every reader then has to handle.
      expect(partly.without?.rough).toEqual([4, 5])
      expect(restored.without).toBeUndefined()
      expect(restored.also).toBeUndefined()
    })

    it('leaves the other pass note alone', () => {
      const roughed = noting(undefined, profile, [2, 3], 'rough')
      const both = noting(roughed, profile, [2], 'finish')

      expect(both.without?.rough).toEqual([4, 5])
      expect(both.without?.finish).toEqual([3, 4, 5])
    })
  })
})
