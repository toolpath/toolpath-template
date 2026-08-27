import { describe, expect, it } from 'vitest'

import {
  claimFace,
  cutElsewhere,
  facesOf,
  handedReadings,
  readingChanged,
  setFaceCut,
} from './faces'
import { EMPTY_PLAN, PASSES, coveredRegions, cutRegions, takenOn, type SetupPlan } from './setups'
import { setPassFor } from './plan-actions'
import { TEST_DIRECTIONS, testFeature, testPart } from './test-part'
import type { PartFeature } from './contracts'

const UP = TEST_DIRECTIONS[0]!
const DOWN = TEST_DIRECTIONS[1]!

const wall = testFeature('wall-1', 'wall', DOWN, [0])
const profile = testFeature('profile-1', 'profile', UP, [0, 1, 2])
const features: Array<PartFeature> = [wall, profile]
const report = { ...testPart(), features }

/** A tick in the panel, which means both passes. */
const cut = (plan: SetupPlan, region: number, on: boolean) =>
  setFaceCut(plan, TEST_DIRECTIONS, features, profile, PASSES, region, on)

/** One pass on its own, for the rules that are about a single claim. */
const cutRough = (plan: SetupPlan, region: number, on: boolean) =>
  setFaceCut(plan, TEST_DIRECTIONS, features, profile, ['rough'], region, on)

describe('the faces of a reading', () => {
  it('lists them in the part own order, with what each one is', () => {
    // A list that reshuffled as faces were taken and given back would move the
    // row under the pointer while somebody was working down a column.
    const rows = facesOf(report, EMPTY_PLAN, profile, 'rough')

    expect(rows.map((row) => row.idx)).toEqual([0, 1, 2])
    expect(rows[0]?.shape).toBe('Plane')
  })

  it('says which passes this reading cuts each of them in', () => {
    const split: SetupPlan = {
      setups: [{ id: 'a', directionIndex: 0, name: '+Z' }],
      assigned: { 'profile-1': { rough: 'a', without: { rough: [0] } } },
    }

    expect(facesOf(report, split, profile, 'rough').map((row) => row.passes)).toEqual([
      [],
      ['rough'],
      ['rough'],
    ])
  })

  it('reads both passes, not the one on screen', () => {
    /*
     * A tick means "this face is part of this reading" and writes both passes,
     * so reading back only one left a face this reading finishes sitting
     * unticked in its own editor.
     */
    const finished: SetupPlan = {
      setups: [{ id: 'a', directionIndex: 0, name: '+Z' }],
      assigned: { 'profile-1': { finish: 'a' } },
    }

    expect(facesOf(report, finished, profile, 'rough')[0]?.passes).toEqual(['finish'])
  })

  it('carries every reading that covers each face, which is the point of it', () => {
    // Five to eight on a typical face, one per direction that can reach it. A
    // face somebody wants cut another way is then one row away from the reading
    // that does it.
    const rows = facesOf(report, EMPTY_PLAN, profile, 'rough')

    expect(rows[0]?.owners.map((each) => each.featureTag)).toEqual(['wall-1', 'profile-1'])
    expect(rows[1]?.owners.map((each) => each.featureTag)).toEqual(['profile-1'])
  })

  it('reads nothing as cut while the reading is unassigned', () => {
    expect(
      facesOf(report, EMPTY_PLAN, profile, 'rough').every((row) => row.passes.length === 0),
    ).toBe(true)
  })
})

describe('adding and removing one face', () => {
  it('claims a whole reading from nothing but one face', () => {
    // How somebody builds a claim up face by face rather than taking the whole
    // reading and arguing it back down.
    const plan = cut(EMPTY_PLAN, 1, true)

    expect(plan.setups).toHaveLength(1)
    expect(cutRegions(plan, profile, 'rough')).toEqual([1])
  })

  it('adds a second face to what it already holds', () => {
    const plan = cut(cut(EMPTY_PLAN, 1, true), 2, true)

    expect(cutRegions(plan, profile, 'rough')).toEqual([1, 2])
  })

  it('takes a face off, leaving the rest of the reading where it was', () => {
    const whole = setFaceCut(EMPTY_PLAN, TEST_DIRECTIONS, features, profile, PASSES, 0, true)
    const most = cut(cut(whole, 1, true), 0, false)

    expect(cutRegions(most, profile, 'rough')).toEqual([1])
  })

  it('takes the face off whatever else was cutting it', () => {
    // A face added here is cut once like any other.
    const held: SetupPlan = {
      setups: [{ id: 'a', directionIndex: 1, name: '−Z' }],
      assigned: { 'wall-1': { rough: 'a' } },
    }

    const plan = cut(held, 0, true)

    expect(plan.assigned['wall-1']?.rough).toBeUndefined()
    expect(cutRegions(plan, profile, 'rough')).toEqual([0])
  })

  it('drops a reading whose last face is taken away', () => {
    // The same rule a claim follows when it takes a reading's last face: a
    // reading cutting nothing is not a decision anybody made.
    const one = cut(EMPTY_PLAN, 1, true)
    const none = cut(one, 1, false)

    expect(none.assigned['profile-1']?.rough).toBeUndefined()
    expect(none.setups).toHaveLength(0)
  })

  it('does nothing taking a face off a reading nothing is cutting', () => {
    // Otherwise it would be assigned in order to be unassigned.
    expect(cut(EMPTY_PLAN, 0, false)).toBe(EMPTY_PLAN)
  })

  it('refuses to give up a face the reading is not cutting', () => {
    // Not its to give.
    expect(cut(EMPTY_PLAN, 5, false)).toBe(EMPTY_PLAN)
  })

  it('takes on a face the reading does not cover, and marks it as handed over', () => {
    /*
     * The Engine's answer can be short as well as long: a profile that stops
     * one wall early is not wrong about the faces it did find, and the fix is
     * to hand it the missing one rather than draw a fresh reading over it.
     */
    const plan = cut(EMPTY_PLAN, 5, true)

    expect(cutRegions(plan, profile, 'rough')).toContain(5)
    expect(takenOn(plan, profile, 'rough')).toEqual([5])
    expect(coveredRegions(plan, profile)).toContain(5)
  })

  it('gives an added face back, and the reading is its own again', () => {
    const plan = cut(cut(EMPTY_PLAN, 5, true), 5, false)

    expect(takenOn(plan, profile, 'rough')).toEqual([])
    expect(coveredRegions(plan, profile)).toEqual(profile.regionIdxs)
  })

  it('roughs and finishes a face in one tick', () => {
    // Somebody saying "cut this face here" is describing the work, not one half
    // of it — the same default `assign` takes for a generator.
    const plan = cut(EMPTY_PLAN, 1, true)

    expect(cutRegions(plan, profile, 'rough')).toEqual([1])
    expect(cutRegions(plan, profile, 'finish')).toEqual([1])
  })

  it('still lets one pass be said on its own', () => {
    // Splitting the passes is deliberate, and R and F on a row are how it is
    // said. This is the same machinery, aimed at one of them.
    const both: SetupPlan = {
      setups: [{ id: 'a', directionIndex: 0, name: '+Z' }],
      assigned: { 'profile-1': { rough: 'a', finish: 'a' } },
    }

    const plan = cutRough(both, 0, false)

    expect(plan.assigned['profile-1']?.finish).toBe('a')
    expect(plan.assigned['profile-1']?.without).toEqual({ rough: [0] })
  })
})

describe('Both, then untick one face', () => {
  const both = () =>
    setPassFor(EMPTY_PLAN, TEST_DIRECTIONS, features, [profile], ['rough', 'finish'])

  it('leaves the rest roughed and finished, and the face machined by nothing', () => {
    /*
     * Paul's sequence, and what it used to do: the tick followed the viewport's
     * pass, so unticking took the face off roughing and left finishing cutting
     * all four. The reading then said "3 of 4" for one pass and "4" for the
     * other, which is not a state anybody asked for.
     */
    const plan = cut(both(), 0, false)

    expect(cutRegions(plan, profile, 'rough')).toEqual([1, 2])
    expect(cutRegions(plan, profile, 'finish')).toEqual([1, 2])
  })

  it('leaves the face cut by nothing at all', () => {
    // Not handed to another reading — simply not machined, which is a real
    // answer and reads as one.
    const plan = cut(both(), 0, false)
    const rows = facesOf(report, plan, profile, 'rough')

    expect(rows[0]?.passes).toEqual([])
    expect(rows[0]?.cutBy).toEqual({ rough: null, finish: null })
    expect(cutElsewhere(report, plan, profile, 'rough')).toEqual([])
  })

  it('says where a face went when something else did take it', () => {
    // The other half: this feature is machined across two ways up, which is
    // what costs a shop a second setup.
    const taken = setPassFor(both(), TEST_DIRECTIONS, features, [wall], ['rough', 'finish'])
    const rows = facesOf(report, taken, profile, 'rough')

    expect(rows[0]?.passes).toEqual([])
    expect(rows[0]?.cutBy.rough?.featureTag).toBe('wall-1')
    expect(cutElsewhere(report, taken, profile, 'rough').map((f) => f.featureTag)).toEqual([
      'wall-1',
    ])
  })
})

describe('moving one face to another reading', () => {
  /*
   * The rule these rows exist for: a press on one of a face's readings moves
   * **that face** and nothing else. Whatever the reading already cuts, and
   * whatever every other reading cuts, stays exactly as it was.
   */
  const held: SetupPlan = {
    setups: [{ id: 'a', directionIndex: 1, name: '−Z' }],
    assigned: { 'wall-1': { rough: 'a', finish: 'a' } },
  }

  it('leaves faces the press did not name where they were', () => {
    // Claiming face 1 for the profile has nothing to do with face 0, which the
    // wall holds. Claiming the whole reading took it anyway.
    const after = setFaceCut(held, TEST_DIRECTIONS, features, profile, ['rough'], 1, true)

    expect(cutRegions(after, profile, 'rough')).toEqual([1])
    expect(cutRegions(after, wall, 'rough')).toEqual([0])
  })

  it('still takes the named face off whatever held it', () => {
    // Cut once is cut once: the face itself can only have one owner.
    const after = setFaceCut(held, TEST_DIRECTIONS, features, profile, ['rough'], 0, true)

    expect(cutRegions(after, profile, 'rough')).toEqual([0])
    expect(cutRegions(after, wall, 'rough')).toEqual([])
    // And only in the pass that was pressed.
    expect(cutRegions(after, wall, 'finish')).toEqual([0])
  })

  it('leaves the rest of what a reading cuts alone when a face joins it', () => {
    const some = setFaceCut(EMPTY_PLAN, TEST_DIRECTIONS, features, profile, PASSES, 2, true)
    const more = setFaceCut(some, TEST_DIRECTIONS, features, profile, PASSES, 1, true)

    expect(cutRegions(more, profile, 'rough')).toEqual([1, 2])
  })
})

describe('a face handed to a reading, in its own row', () => {
  /*
   * Paul's case: a wall the Engine sees only from −Z, added to a group of walls
   * it sees from +Z. Adding it means "this face is part of the +Z feature", not
   * "enable the −Z reading of it".
   */
  const group = testFeature('group', 'wall', UP, [0, 1])
  const lone = testFeature('lone', 'wall', DOWN, [5])
  const both = [group, lone]
  const bothReport = { ...testPart(), features: both }

  const handed = setFaceCut(EMPTY_PLAN, TEST_DIRECTIONS, both, group, PASSES, 5, true)
  const row = facesOf(bothReport, handed, group, 'rough').find((each) => each.idx === 5)

  it('is cut by the reading it was added to, from that reading way up', () => {
    expect(cutRegions(handed, group, 'rough')).toContain(5)
    expect(row?.cutBy.rough?.featureTag).toBe('group')
  })

  it('takes the face off the reading the Engine reported it in', () => {
    expect(cutRegions(handed, lone, 'rough')).toEqual([])
  })

  it('lists the reading it was added to among its readings, first', () => {
    /*
     * The Engine's own list is `regionIdxs`, and an added face is by definition
     * not in it — so the row opened onto a list not containing the reading the
     * face had just been added to, and pressing anything there enabled it in
     * the Engine's direction instead.
     */
    expect(row?.owners.map((each) => each.featureTag)).toEqual(['group', 'lone'])
  })
})

describe('Both, on a face that already holds both', () => {
  /*
   * Pressing the pass a thing already holds is how somebody unsays it, and Both
   * is no exception. `setPassFor` has followed that rule for a whole reading
   * from the start; this is the same rule one level down.
   */
  const whole = setFaceCut(EMPTY_PLAN, TEST_DIRECTIONS, features, profile, PASSES, 1, true)

  it('lets go of both, rather than doing nothing at all', () => {
    // The fold ran over an empty list and returned the plan untouched, so the
    // button reported the state correctly and the press had no effect.
    const off = setFaceCut(whole, TEST_DIRECTIONS, features, profile, [], 1, false)

    expect(cutRegions(off, profile, 'rough')).toEqual([])
    expect(cutRegions(off, profile, 'finish')).toEqual([])
  })

  it('ignores the cut flag when the pass list is empty, because empty says it', () => {
    const off = setFaceCut(whole, TEST_DIRECTIONS, features, profile, [], 1, true)

    expect(cutRegions(off, profile, 'rough')).toEqual([])
  })
})

describe('who owns a face once the plan has moved one', () => {
  /*
   * The Engine's answer is `regionIdxs`, and a face given to a reading is by
   * definition not in it — so the reading actually cutting the face was the one
   * missing from that face's list.
   */
  const group = testFeature('group', 'wall', UP, [0, 1])
  const lone = testFeature('lone', 'wall', DOWN, [5])
  const both = [group, lone]

  const handed = setFaceCut(EMPTY_PLAN, TEST_DIRECTIONS, both, group, PASSES, 5, true)

  it('names the reading that was given the face', () => {
    expect(handedReadings(both, handed, [5]).map((each) => each.featureTag)).toEqual(['group'])
  })

  it('leaves out the reading the Engine reported it in, which the viewer already knows', () => {
    // This answers the half the viewer cannot: it reads `regionIdxs` itself.
    expect(handedReadings(both, handed, [5]).map((each) => each.featureTag)).not.toContain('lone')
  })

  it('names nobody while the plan has moved nothing', () => {
    expect(handedReadings(both, EMPTY_PLAN, [0, 1, 5])).toEqual([])
  })
})

describe('unticking one face of a reading cut in both passes', () => {
  /*
   * Paul's sequence: Both on the reading, then take one face off. The other
   * face must stay exactly as it was — the whole point of a claim taking faces
   * rather than readings.
   */
  const whole = setPassFor(EMPTY_PLAN, TEST_DIRECTIONS, features, [profile], PASSES)

  it('leaves the others cut', () => {
    const off = setFaceCut(whole, TEST_DIRECTIONS, features, profile, PASSES, 0, false)

    expect(cutRegions(off, profile, 'rough')).toEqual([1, 2])
    expect(cutRegions(off, profile, 'finish')).toEqual([1, 2])
  })
})

describe('clicking a face in the editor, with a claim selected', () => {
  /*
   * Paul's report: a face cut in both passes, clicked with Finish selected,
   * turned orange. The switch was naming which pass to toggle, and it reads as
   * naming what the face is for — so a click labelled finish took finishing
   * away from a face that had it.
   */
  const both = setPassFor(EMPTY_PLAN, TEST_DIRECTIONS, features, [profile], PASSES)

  it('makes a face cut in both passes finished only, rather than roughed only', () => {
    const after = claimFace(both, TEST_DIRECTIONS, features, profile, ['finish'], 0)

    expect(cutRegions(after, profile, 'finish')).toContain(0)
    expect(cutRegions(after, profile, 'rough')).not.toContain(0)
  })

  it('leaves every other face of the reading alone', () => {
    const after = claimFace(both, TEST_DIRECTIONS, features, profile, ['finish'], 0)

    expect(cutRegions(after, profile, 'rough')).toEqual([1, 2])
    expect(cutRegions(after, profile, 'finish')).toEqual([0, 1, 2])
  })

  // The one click that takes a face off is the one that would otherwise change
  // nothing — which is what keeps a second click an undo of the first, and is
  // why the mode needs no arming and no confirmation.
  it('lets go when the face is already exactly what was asked for', () => {
    const finished = claimFace(both, TEST_DIRECTIONS, features, profile, ['finish'], 0)
    const off = claimFace(finished, TEST_DIRECTIONS, features, profile, ['finish'], 0)

    expect(cutRegions(off, profile, 'finish')).not.toContain(0)
    expect(cutRegions(off, profile, 'rough')).not.toContain(0)
  })

  it('adds a face the reading was not cutting at all', () => {
    const after = claimFace(EMPTY_PLAN, TEST_DIRECTIONS, features, profile, ['rough'], 1)

    expect(cutRegions(after, profile, 'rough')).toEqual([1])
    expect(cutRegions(after, profile, 'finish')).toEqual([])
  })

  // Both on a face that holds both is still how somebody lets go of it — the
  // same rule, arrived at from the general one rather than as a special case.
  it('drops a face held in both passes when Both is what is selected', () => {
    const off = claimFace(both, TEST_DIRECTIONS, features, profile, PASSES, 0)

    expect(cutRegions(off, profile, 'rough')).toEqual([1, 2])
    expect(cutRegions(off, profile, 'finish')).toEqual([1, 2])
  })
})

describe('a face roughed here and finished somewhere else', () => {
  /*
   * The arrangement worth checking, and the one the panel used to be silent
   * about: `cutBy` answered for a single pass, so whichever pass was not asked
   * about was reported as nothing at all.
   */
  const split = setFaceCut(
    setPassFor(EMPTY_PLAN, TEST_DIRECTIONS, features, [profile], ['rough']),
    TEST_DIRECTIONS,
    features,
    wall,
    ['finish'],
    0,
    true,
  )

  it('names a different reading for each pass', () => {
    const row = facesOf(report, split, profile, 'rough').find((each) => each.idx === 0)

    expect(row?.cutBy.rough?.featureTag).toBe('profile-1')
    expect(row?.cutBy.finish?.featureTag).toBe('wall-1')
  })

  // Asked from the *other* pass's point of view, the answer is the same one —
  // which is the property that makes it a fact about the face rather than
  // about which pass the panel happened to be showing.
  it('answers the same whichever pass the list was built for', () => {
    const row = facesOf(report, split, profile, 'finish').find((each) => each.idx === 0)

    expect(row?.cutBy.rough?.featureTag).toBe('profile-1')
    expect(row?.cutBy.finish?.featureTag).toBe('wall-1')
  })
})

describe('whether the editor has anything to keep', () => {
  const mapped = setPassFor(EMPTY_PLAN, TEST_DIRECTIONS, features, [profile], ['rough', 'finish'])

  it('says no when nothing has been touched', () => {
    // Every click in the editor writes straight to the plan, so `Save` is
    // always available — and for most of a session there is nothing behind it.
    expect(readingChanged(mapped, mapped, profile)).toBe(false)
  })

  it('sees a face taken out of the reading', () => {
    const after = setFaceCut(mapped, TEST_DIRECTIONS, features, profile, ['rough'], 1, false)

    expect(readingChanged(mapped, after, profile)).toBe(true)
  })

  it('sees a pass added, not only faces', () => {
    const roughOnly = setPassFor(EMPTY_PLAN, TEST_DIRECTIONS, features, [profile], ['rough'])

    expect(readingChanged(roughOnly, mapped, profile)).toBe(true)
  })

  it('follows the ground when another reading takes it', () => {
    /*
     * Cut-once: mapping the wall takes face 0 off the profile, so the profile
     * *has* changed — by what it cuts, which is the whole point of asking
     * `cutRegions` rather than the Engine's `regionIdxs`.
     */
    const alsoWall = setPassFor(mapped, TEST_DIRECTIONS, features, [wall], ['rough'])

    expect(readingChanged(mapped, alsoWall, profile)).toBe(true)
  })
})
