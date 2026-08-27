import { describe, expect, it } from 'vitest'

import type { PartFeature } from './contracts'
import {
  blockedBy,
  disturbsLocked,
  easiestReading,
  lockedClaims,
  readingForFace,
  lockSetup,
  setPassFor,
  setupForReading,
  isMapped,
  readingOrder,
} from './plan-actions'
import { EMPTY_PLAN, PASSES, cutsFrom } from './setups'
import { TEST_DIRECTIONS, testFeature, testPart } from './test-part'
import type { SetupPlan } from './setups'

/**
 * Assigning a reading to the way up it is read from — the picker's `setPassFor`.
 *
 * Every rule here was a bug in the picker first, and §8 of the parity plan lists
 * them. They are the reason this is a pure function rather than a handler.
 */

const UP = { x: 0, y: 0, z: 1 }
const SIDE = { x: 0, y: -1, z: 0 }
const DIRECTIONS = [UP, SIDE]

const feature = (
  featureTag: string,
  machiningDirection: { x: number; y: number; z: number },
  regionIdxs: Array<number>,
): PartFeature =>
  ({
    featureTag,
    featureType: 'wall',
    machiningDirection,
    axis: machiningDirection,
    regionIdxs,
    datasheet: null,
  }) as unknown as PartFeature

const pocket = feature('pocket', UP, [0])
const wall = feature('wall', UP, [1])
// A profile read from the side that covers the same face as the pocket above.
const profile = feature('profile', SIDE, [0, 2])
const all = [pocket, wall, profile]

const assign = (plan: SetupPlan, features: Array<PartFeature>, passes: Array<'rough' | 'finish'>) =>
  setPassFor(plan, DIRECTIONS, all, features, passes)

describe('pressing a pass on a reading', () => {
  it('makes a setup for that reading own direction, not a chosen one', () => {
    const next = assign(EMPTY_PLAN, [pocket], ['rough'])

    expect(next.setups).toHaveLength(1)
    expect(next.setups[0]?.directionIndex).toBe(0)
    expect(next.assigned[pocket.featureTag]?.rough).toBe(next.setups[0]?.id)
  })

  it('reuses the setup already holding that direction', () => {
    const first = assign(EMPTY_PLAN, [pocket], ['rough'])
    const second = assign(first, [wall], ['rough'])

    expect(second.setups).toHaveLength(1)
    expect(second.assigned[wall.featureTag]?.rough).toBe(second.setups[0]?.id)
  })

  it('sets both passes in one update when both were asked for', () => {
    // §8: "Both" fired two setState calls from one snapshot and only one landed.
    // Passing a list and applying once is the fix, and this is what proves it.
    const next = assign(EMPTY_PLAN, [pocket], ['rough', 'finish'])
    const setup = next.setups[0]

    expect(cutsFrom(next, pocket.featureTag, 'rough', setup)).toBe(true)
    expect(cutsFrom(next, pocket.featureTag, 'finish', setup)).toBe(true)
  })

  it('takes a reading off when the pass it already holds is pressed again', () => {
    const on = assign(EMPTY_PLAN, [pocket], ['rough'])
    const off = assign(on, [pocket], ['rough'])

    expect(off.assigned[pocket.featureTag]?.rough).toBeUndefined()
  })

  it('takes it off both passes when nothing is asked for', () => {
    const on = assign(EMPTY_PLAN, [pocket], ['rough', 'finish'])
    const off = assign(on, [pocket], [])

    expect(off.assigned[pocket.featureTag]?.rough).toBeUndefined()
    expect(off.assigned[pocket.featureTag]?.finish).toBeUndefined()
  })
})

describe('a face is cut once per pass', () => {
  it('steals the face from whatever was cutting it', () => {
    // §8's cut-once invariant: the same surface reachable two ways must not be
    // machined twice. Region 0 belongs to both the pocket and the profile.
    const roughed = assign(EMPTY_PLAN, [pocket], ['rough'])
    const stolen = assign(roughed, [profile], ['rough'])

    expect(stolen.assigned[profile.featureTag]?.rough).toBeDefined()
    expect(stolen.assigned[pocket.featureTag]?.rough).toBeUndefined()
  })

  it('drops the setup that theft left holding nothing', () => {
    // Otherwise an orientation stays in the list cutting nothing, which reads
    // as the app having invented a setup.
    const roughed = assign(EMPTY_PLAN, [pocket], ['rough'])
    const stolen = assign(roughed, [profile], ['rough'])

    expect(stolen.setups.map((setup) => setup.directionIndex)).toEqual([1])
  })

  it('leaves the other pass alone', () => {
    const both = assign(EMPTY_PLAN, [pocket], ['rough', 'finish'])
    const stolen = assign(both, [profile], ['rough'])

    expect(stolen.assigned[pocket.featureTag]?.finish).toBeDefined()
  })
})

describe('a group is judged across the whole group', () => {
  it('puts the rest on when only some are already there', () => {
    // Deciding feature by feature would make one press both assign and
    // unassign, which is a button nobody can predict.
    const partly = assign(EMPTY_PLAN, [pocket], ['rough'])
    const both = assign(partly, [pocket, wall], ['rough'])

    expect(both.assigned[pocket.featureTag]?.rough).toBeDefined()
    expect(both.assigned[wall.featureTag]?.rough).toBeDefined()
  })

  it('takes them all off when every one is already there', () => {
    const on = assign(EMPTY_PLAN, [pocket, wall], ['rough'])
    const off = assign(on, [pocket, wall], ['rough'])

    expect(off.assigned[pocket.featureTag]?.rough).toBeUndefined()
    expect(off.assigned[wall.featureTag]?.rough).toBeUndefined()
  })
})

describe('readings the Engine never offered a direction for', () => {
  it('assigns nothing', () => {
    const orphan = feature('orphan', { x: 1, y: 0, z: 0 }, [3])

    expect(setPassFor(EMPTY_PLAN, DIRECTIONS, all, [orphan], ['rough'])).toBe(EMPTY_PLAN)
  })
})

describe('which setup holds a readings direction', () => {
  it('is nothing before anything is assigned', () => {
    expect(setupForReading(EMPTY_PLAN, DIRECTIONS, pocket)).toBeNull()
  })

  it('is the setup once one exists', () => {
    const next = assign(EMPTY_PLAN, [pocket], ['rough'])

    expect(setupForReading(next, DIRECTIONS, wall)?.id).toBe(next.setups[0]?.id)
  })
})

describe('what a click on a mapped face is asking', () => {
  it('knows a reading is mapped in either pass', () => {
    const roughed = assign(EMPTY_PLAN, [pocket], ['rough'])
    const finished = assign(EMPTY_PLAN, [pocket], ['finish'])

    expect(isMapped(roughed, 'pocket')).toBe(true)
    expect(isMapped(finished, 'pocket')).toBe(true)
    expect(isMapped(EMPTY_PLAN, 'pocket')).toBe(false)
  })
})

describe('which reading a click lands on', () => {
  const OFF = { x: -0.33, y: 0, z: 0.95 }
  const square = feature('square', { x: 0, y: 0, z: 1 }, [0])
  const askew = feature('askew', OFF, [0])

  it('prefers an ordinary way up over an off-axis one', () => {
    // Off-axis is a real answer and a more expensive one — it wants a fifth
    // axis or a fixture built for it, so it is not what a click lands on
    // before anybody has asked for it.
    expect(readingOrder([askew, square], EMPTY_PLAN).map((f) => f.featureTag)).toEqual([
      'square',
      'askew',
    ])
  })

  it('still puts what the plan cuts first, off-axis or not', () => {
    // Clicking a face being cut is a question about that cut.
    const plan = setPassFor(
      EMPTY_PLAN,
      [{ x: 0, y: 0, z: 1 }, OFF],
      [square, askew],
      [askew],
      ['rough'],
    )

    expect(readingOrder([square, askew], plan).map((f) => f.featureTag)).toEqual([
      'askew',
      'square',
    ])
  })

  it('keeps the order a click arrived with among equals', () => {
    const other = feature('other', { x: 1, y: 0, z: 0 }, [0])

    expect(readingOrder([other, square], EMPTY_PLAN).map((f) => f.featureTag)).toEqual([
      'other',
      'square',
    ])
  })
})

describe('Both means both', () => {
  const part = testPart()
  const pocket = part.features[0]!

  const press = (plan: SetupPlan, passes: Array<'rough' | 'finish'>) =>
    setPassFor(plan, TEST_DIRECTIONS, part.features, [pocket], passes)

  it('puts finishing on without taking roughing off', () => {
    /*
     * Judged per pass, Both on a reading already roughed read "rough is already
     * there" and took roughing off while putting finishing on — one press that
     * assigned one pass and unassigned the other.
     */
    const roughed = press(EMPTY_PLAN, ['rough'])
    const both = press(roughed, ['rough', 'finish'])

    expect(both.assigned[pocket.featureTag]?.rough).toBeDefined()
    expect(both.assigned[pocket.featureTag]?.finish).toBeDefined()
    expect(both.assigned[pocket.featureTag]?.rough).toBe(both.assigned[pocket.featureTag]?.finish)
  })

  it('lets go only once both are held', () => {
    const both = press(press(EMPTY_PLAN, ['rough']), ['rough', 'finish'])
    const off = press(both, ['rough', 'finish'])

    expect(off.assigned[pocket.featureTag]?.rough).toBeUndefined()
    expect(off.assigned[pocket.featureTag]?.finish).toBeUndefined()
  })

  it('still lets one pass go on its own', () => {
    // Pressing the pass a reading already holds is how somebody unsays it.
    const both = press(press(EMPTY_PLAN, ['rough']), ['rough', 'finish'])
    const roughOnly = press(both, ['finish'])

    expect(roughOnly.assigned[pocket.featureTag]?.rough).toBeDefined()
    expect(roughOnly.assigned[pocket.featureTag]?.finish).toBeUndefined()
  })
})

describe('the reading a first click opens', () => {
  const scores = new Map([
    ['hard', { score: 20 }],
    ['easy', { score: 90 }],
    ['middling', { score: 55 }],
  ])

  it('opens the easiest of them, not whichever the geometry ranked first', () => {
    // A click on a face has five to eight answers and has to open one. Ranked
    // by geometry it opened whichever the Engine happened to report first,
    // which is a coin toss; the rules already say which is least trouble.
    expect(easiestReading(['hard', 'easy', 'middling'], scores)).toBe('easy')
  })

  it('prefers any judged reading over one nothing looked at', () => {
    // "Nobody looked" is not a recommendation.
    expect(easiestReading(['unjudged', 'hard'], scores)).toBe('hard')
  })

  it('keeps the order it arrived in when two are equally easy', () => {
    // Which is the order the click ranked them, so a tie still resolves the way
    // the geometry said.
    const tied = new Map([
      ['first', { score: 70 }],
      ['second', { score: 70 }],
    ])

    expect(easiestReading(['first', 'second'], tied)).toBe('first')
  })

  it('still answers when nothing has been judged at all', () => {
    expect(easiestReading(['only'], new Map())).toBe('only')
    expect(easiestReading([], new Map())).toBeNull()
  })
})

describe('which reading a first click on a face opens', () => {
  /*
   * Two answers, depending on whether the plan has anything to say about the
   * face yet. The rules already work out which reading is least trouble to cut,
   * and that answer used to be computed and then thrown away by an override
   * that opened the first axis-aligned reading instead.
   */
  const easy = testFeature('easy', 'face', TEST_DIRECTIONS[0]!, [0])
  const hard = testFeature('hard', 'wall', TEST_DIRECTIONS[1]!, [0])
  const unjudged = testFeature('unjudged', 'wall', TEST_DIRECTIONS[2]!, [0])
  const readings = [hard, easy, unjudged]
  const features = readings

  const scores = new Map([
    ['hard', { score: 30 }],
    ['easy', { score: 90 }],
    ['unjudged', { score: null }],
  ])

  it('opens the easiest of them while nothing cuts the face', () => {
    // Highest score, not first in the list and not first axis-aligned.
    expect(readingForFace(readings, EMPTY_PLAN, 0, scores)).toBe('easy')
  })

  it('prefers a judged reading to an unjudged one, because nobody looked is not a recommendation', () => {
    expect(readingForFace([unjudged, hard], EMPTY_PLAN, 0, scores)).toBe('hard')
  })

  it('opens whatever cuts the face once something does, whatever its score', () => {
    /*
     * A click on a face already being cut is nearly always a question about
     * that cut. Opening a different reading of it answers a question nobody
     * asked and hides the one that matters.
     */
    const plan = setPassFor(EMPTY_PLAN, TEST_DIRECTIONS, features, [hard], PASSES)

    expect(readingForFace(readings, plan, 0, scores)).toBe('hard')
  })

  it('counts a face cut in either pass, like everything else that asks', () => {
    const finished = setPassFor(EMPTY_PLAN, TEST_DIRECTIONS, features, [hard], ['finish'])

    expect(readingForFace(readings, finished, 0, scores)).toBe('hard')
  })

  it('falls back to the easiest when the reading that is mapped does not cut this face', () => {
    // Mapped somewhere is not the same as cutting this face — a reading can be
    // assigned and have given this one up.
    const elsewhere = testFeature('elsewhere', 'wall', TEST_DIRECTIONS[1]!, [7])
    const plan = setPassFor(
      EMPTY_PLAN,
      TEST_DIRECTIONS,
      [...features, elsewhere],
      [elsewhere],
      PASSES,
    )

    expect(readingForFace(readings, plan, 0, scores)).toBe('easy')
  })
})

describe('a setup somebody has settled', () => {
  /*
   * Paul, mapping: a reading held by a locked setup moved anyway. The lock was
   * drawn by the panel, explained by the face list and recorded in the plan,
   * and read by nothing but the generators — so every manual gesture walked
   * straight through it.
   */
  const settled = (plan: SetupPlan) => lockSetup(plan, plan.setups[0]!.id, true)

  it('does not let a reading it holds be moved', () => {
    const held = settled(assign(EMPTY_PLAN, [pocket], ['rough']))

    expect(assign(held, [pocket], ['finish'])).toEqual(held)
  })

  it('does not let a reading it holds be taken off either', () => {
    // Pressing the pass it already holds is how somebody unsays a decision.
    // On settled work that is still a change to what the setup cuts.
    const held = settled(assign(EMPTY_PLAN, [pocket], ['rough']))

    expect(assign(held, [pocket], ['rough'])).toEqual(held)
  })

  it('refuses a press that would quietly take one of its faces', () => {
    // The profile covers face 0, which the settled pocket is cutting. Cut-once
    // would strip it from the pocket without the press ever naming it.
    const held = settled(assign(EMPTY_PLAN, [pocket], ['rough']))

    expect(assign(held, [profile], ['rough'])).toEqual(held)
  })

  it('refuses the whole press rather than the safe half of it', () => {
    // Applying it to the free face and skipping the settled one would leave
    // two setups cutting face 0, which breaks cut-once — worse than refusing.
    const held = settled(assign(EMPTY_PLAN, [pocket], ['rough']))
    const after = assign(held, [profile], ['rough'])

    expect(after.assigned.profile).toBeUndefined()
    expect(after.assigned.pocket).toEqual(held.assigned.pocket)
  })

  it('leaves work that touches nothing settled alone', () => {
    // The wall holds face 1, which the settled pocket never cuts.
    const held = settled(assign(EMPTY_PLAN, [pocket], ['rough']))
    const after = assign(held, [wall], ['rough'])

    expect(after.assigned.wall?.rough).toBeDefined()
  })

  it('lets everything move again once it is unlocked', () => {
    const held = settled(assign(EMPTY_PLAN, [pocket], ['rough']))
    const freed = lockSetup(held, held.setups[0]!.id, false)

    expect(assign(freed, [pocket], ['finish']).assigned.pocket?.finish).toBeDefined()
  })
})

describe('what a row can say before it is pressed', () => {
  /*
   * Paul, on a real part: a face mapped and settled in −Z, and the R/F/Both on
   * every *other* reading of that same face still lit. `setPassFor` refused
   * them, so the plan was never in danger — but nothing said so, and the press
   * looked live and did nothing.
   *
   * That is the same bug the lock was fixed for once already, one layer out:
   * the refusal was taught about cut-once and the buttons were not, because
   * they asked a narrower question — "is *this* reading settled" — than the one
   * the refusal answers.
   */
  const settled = (plan: SetupPlan) => lockSetup(plan, plan.setups[0]!.id, true)
  const claimsFor = (plan: SetupPlan) => lockedClaims(plan, all)

  it('names the lock holding a reading outright', () => {
    const held = settled(assign(EMPTY_PLAN, [pocket], ['rough']))

    expect(blockedBy(claimsFor(held), [pocket], ['rough'])?.id).toBe(held.setups[0]!.id)
  })

  it('names the lock for a reading nobody settled, whose faces it cuts', () => {
    // The profile is not settled and never was. Pressing it would take face 0
    // from the settled pocket, so the row has to carry the lock's name too.
    const held = settled(assign(EMPTY_PLAN, [pocket], ['rough']))

    expect(blockedBy(claimsFor(held), [profile], ['rough'])?.id).toBe(held.setups[0]!.id)
  })

  it('says nothing about a reading that touches nothing settled', () => {
    // The wall holds face 1, which the settled pocket never cuts.
    const held = settled(assign(EMPTY_PLAN, [pocket], ['rough']))

    expect(blockedBy(claimsFor(held), [wall], ['rough'])).toBeNull()
  })

  it('shuts only the pass the lock actually holds', () => {
    /*
     * The pocket is settled on rough alone. Finishing the profile takes nothing
     * the lock is cutting, so F is still a real press — which is why the row
     * asks per button rather than once for itself.
     */
    const held = settled(assign(EMPTY_PLAN, [pocket], ['rough']))
    const claims = claimsFor(held)

    expect(blockedBy(claims, [profile], ['rough'])).not.toBeNull()
    expect(blockedBy(claims, [profile], ['finish'])).toBeNull()
  })

  it('lets go without asking, because letting go claims nothing', () => {
    const held = settled(assign(EMPTY_PLAN, [pocket], ['rough']))

    expect(blockedBy(claimsFor(held), [profile], [])).toBeNull()
  })

  it('agrees with the refusal, press for press', () => {
    /*
     * The guard on the way in and the look of the button are one answer asked
     * twice, and the first time they were written apart they came apart. This
     * is the test that says they cannot again.
     */
    const held = settled(assign(EMPTY_PLAN, [pocket], ['rough']))
    const claims = claimsFor(held)
    const presses: Array<Array<'rough' | 'finish'>> = [
      ['rough'],
      ['finish'],
      ['rough', 'finish'],
      [],
    ]

    for (const features of [[pocket], [wall], [profile]]) {
      for (const passes of presses) {
        expect(blockedBy(claims, features, passes) !== null).toBe(
          disturbsLocked(held, all, features, passes),
        )
      }
    }
  })
})
