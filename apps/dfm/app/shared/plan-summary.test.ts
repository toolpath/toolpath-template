import { describe, expect, it } from 'vitest'

import { PASSES, coverageOf, setupFor } from './setups'
import { setFaceCut } from './faces'
import {
  cutByDirection,
  cutRegionsByDirection,
  cutRegionsByFeature,
  planCoverage,
  setupGroups,
  uncutFaces,
  uncutRows,
  unreachableFaces,
} from './plan-summary'
import { setPassFor } from './plan-actions'
import { EMPTY_PLAN, type SetupPlan } from './setups'
import { TEST_DIRECTIONS, testFeature, testPart } from './test-part'

const part = testPart()
const features = part.features
const assign = (plan: typeof EMPTY_PLAN, tag: string, passes: Array<'rough' | 'finish'>) =>
  setPassFor(
    plan,
    TEST_DIRECTIONS,
    features,
    features.filter((feature) => feature.featureTag === tag),
    passes,
  )

describe('how much of the part is mapped', () => {
  it('is nothing, in both passes, before anything is decided', () => {
    expect(planCoverage(part, features, EMPTY_PLAN)).toEqual([
      { pass: 'rough', mapped: 0 },
      { pass: 'finish', mapped: 0 },
    ])
  })

  it('counts each pass separately', () => {
    // up-face covers one of six faces. Roughing it maps a sixth; finishing is
    // still untouched, because the two are separate claims.
    const plan = assign(EMPTY_PLAN, 'up-face', ['rough'])
    const [rough, finish] = planCoverage(part, features, plan)

    expect(rough?.mapped).toBeCloseTo(1 / 6, 6)
    expect(finish?.mapped).toBe(0)
  })
})

describe('the confirmed directions', () => {
  it('is empty until something is put on one', () => {
    expect(setupGroups(part, features, TEST_DIRECTIONS, EMPTY_PLAN)).toEqual([])
  })

  it('names each one by the way up it holds', () => {
    const plan = assign(EMPTY_PLAN, 'up-face', ['rough'])
    const [group] = setupGroups(part, features, TEST_DIRECTIONS, plan)

    expect(group?.label).toBe('+Z')
    expect(group?.readings.map((feature) => feature.featureTag)).toEqual(['up-face'])
    expect(group?.mapped).toBeCloseTo(1 / 6, 6)
  })

  it('gathers every reading assigned to it, in either pass', () => {
    let plan = assign(EMPTY_PLAN, 'up-face', ['rough'])
    plan = assign(plan, 'up-wall', ['finish'])
    const [group] = setupGroups(part, features, TEST_DIRECTIONS, plan)

    expect(group?.readings.map((feature) => feature.featureTag)).toEqual(['up-face', 'up-wall'])
  })
})

describe('what is not cut yet', () => {
  const roughed = (tag: string) =>
    setPassFor(
      EMPTY_PLAN,
      TEST_DIRECTIONS,
      features,
      features.filter((feature) => feature.featureTag === tag),
      ['rough'],
    )

  it('counts faces, not the readings that lost', () => {
    /*
     * A face is reported from every way up that can reach it, so most readings
     * are alternatives that were never going to be cut. Counting those made a
     * finished arrangement read as mostly unmapped — "60 of 74 have no way up"
     * beside a coverage bar at 100%.
     */
    const plan = roughed('down-profile')

    // The profile covers four faces, so four are cut however many readings lost.
    expect(uncutFaces(part, features, plan)).toHaveLength(part.regions.length - 4)

    // And plenty lost: the readings nothing points at outnumber the faces
    // nothing cuts, which is the whole reason this counts faces.
    const unassigned = features.filter((feature) => plan.assigned[feature.featureTag] === undefined)
    expect(unassigned.length).toBeGreaterThan(uncutFaces(part, features, plan).length)
  })

  it('agrees with the coverage bar', () => {
    // The two measure the same thing and can no longer disagree.
    const plan = roughed('down-profile')
    const cut = part.regions.length - uncutFaces(part, features, plan).length

    expect(cut / part.regions.length).toBeCloseTo(planCoverage(part, features, plan)[0]!.mapped, 6)
  })

  it('names faces no reading reaches at all as a gap in the analysis', () => {
    // Not a gap in the plan — no arrangement can close it.
    const short = [features[0]!]

    expect(unreachableFaces(part, short)).toHaveLength(part.regions.length - 1)
    expect(unreachableFaces(part, features)).toEqual([])
  })
})

describe('the row for a face nothing cuts', () => {
  const rows = (plan: SetupPlan = EMPTY_PLAN) => uncutRows(part, TEST_DIRECTIONS, features, plan)

  it('carries the readings that could take it, so the row can close the gap', () => {
    // A list that only says what is missing makes somebody go and find it again.
    const row = rows().find((each) => each.idx === 0)

    expect(row?.owners.length).toBeGreaterThan(0)
    expect(row?.owners.every((feature) => feature.regionIdxs.includes(0))).toBe(true)
  })

  it('reads its ways up off those readings rather than gathering them apart', () => {
    // Two answers to one question is how the dots on a row and the readings
    // under it come to disagree.
    for (const row of rows()) {
      const own = new Set(
        row.owners.map((feature) =>
          TEST_DIRECTIONS.findIndex(
            (direction) =>
              direction.x === feature.machiningDirection.x &&
              direction.y === feature.machiningDirection.y &&
              direction.z === feature.machiningDirection.z,
          ),
        ),
      )

      expect(row.from).toEqual([...own].sort((a, b) => a - b))
    }
  })

  it('puts the biggest gap first, because that is what the list is opened for', () => {
    const areas = rows().map((row) => row.area)

    expect([...areas].sort((a, b) => b - a)).toEqual(areas)
  })

  it('drops a face the moment something cuts it', () => {
    const plan = setPassFor(
      EMPTY_PLAN,
      TEST_DIRECTIONS,
      features,
      features.filter((feature) => feature.featureTag === 'down-profile'),
      ['rough'],
    )
    const before = rows().length

    expect(rows(plan).length).toBe(before - 4)
  })
})

describe('a reading that cuts only part of what it covers', () => {
  const part = testPart()
  const wall = testFeature('wall-1', 'wall', { x: 0, y: 0, z: -1 }, [0])
  const profile = testFeature('profile-1', 'profile', { x: 0, y: -1, z: 0 }, [0, 1, 2])
  const features = [wall, profile]

  /** The wall claimed one of the profile's three faces. */
  const split: SetupPlan = {
    setups: [
      { id: 'a', directionIndex: 1, name: '−Z' },
      { id: 'b', directionIndex: 5, name: '−Y' },
    ],
    assigned: {
      'wall-1': { rough: 'a' },
      'profile-1': { rough: 'b', without: { rough: [0] } },
    },
  }

  it('counts the faces it still cuts, and no more', () => {
    // Coverage that counted what the reading *covers* would claim a face the
    // plan has handed to another way up.
    expect(coverageOf(part, features, split, 'rough').regions).toEqual(new Set([0, 1, 2]))
    expect(coverageOf(part, features, split, 'rough', 'b').regions).toEqual(new Set([1, 2]))
  })

  it('counts a face given up as cut, because the reading that took it cuts it', () => {
    // The test part has six faces. These two readings cover three between them
    // and cut all three; the rest were never covered by either.
    expect(uncutFaces(part, features, split)).toEqual([3, 4, 5])
  })

  it('says which reading cuts each face, so difficulty can colour them too', () => {
    // The direction layer answers "which way up"; difficulty needs "which
    // reading", because the band belongs to the feature and not to the setup.
    expect(cutRegionsByFeature(features, split, 'rough')).toEqual(
      new Map([
        [1, 'profile-1'],
        [2, 'profile-1'],
      ]),
    )
  })

  it('paints face by face, so the face it gave up takes the other colour', () => {
    // A feature-level colour would paint all three of the profile's faces in
    // −Y, including the one −Z is cutting.
    expect(cutByDirection(features, split, 'rough')).toEqual(new Map([['wall-1', 1]]))
    expect(cutRegionsByDirection(features, split, 'rough')).toEqual(
      new Map([
        [1, 5],
        [2, 5],
      ]),
    )
  })
})

describe('painting a reading that was handed a face', () => {
  /*
   * Paul's screenshot: a wall with five faces, two of them added, showing three
   * painted on the part. The viewer colours a feature by expanding its tag to
   * the faces the Engine reported — which is one too few for a reading holding
   * a face somebody handed it.
   *
   * Only the "gave a face up" half of that was ever checked, so a reading that
   * had given nothing up passed the by-tag test and its added faces went grey.
   */
  const wall = testFeature('wall', 'wall', TEST_DIRECTIONS[0]!, [0, 1])
  const other = testFeature('other', 'wall', TEST_DIRECTIONS[1]!, [4])
  const features = [wall, other]

  // Mapped whole first, then handed a face — Paul's case. Adding a face to a
  // reading nothing has claimed yet is the other rule, and claims that face
  // alone.
  const mapped = setPassFor(EMPTY_PLAN, TEST_DIRECTIONS, features, [wall], PASSES)
  const handed = setFaceCut(mapped, TEST_DIRECTIONS, features, wall, PASSES, 4, true)

  it('does not name it by its tag, because the tag cannot say which faces', () => {
    expect(cutByDirection(features, handed, 'rough').has('wall')).toBe(false)
  })

  it('paints every face it actually cuts, added ones included', () => {
    const painted = cutRegionsByDirection(features, handed, 'rough')

    expect([...painted.keys()].sort((a, b) => a - b)).toEqual([0, 1, 4])
  })

  it('still names a reading cutting exactly its own by its tag, which is cheaper', () => {
    const whole = setPassFor(EMPTY_PLAN, TEST_DIRECTIONS, features, [wall], PASSES)

    expect(cutByDirection(features, whole, 'rough').get('wall')).toBe(0)
    expect(cutRegionsByDirection(features, whole, 'rough').size).toBe(0)
  })
})

describe('whether a way up has anything left to pick up', () => {
  /*
   * `Fill` greys when there is nothing to offer, and the only way its greyed
   * state and its press can agree is to ask the same function. `inferable` is
   * what `propose` runs, and `propose` returns nothing when it comes back
   * empty — a second copy of the reasoning is the shape this codebase has been
   * bitten by four times.
   */
  const part = testPart()
  const pocket = testFeature('pocket', 'pocket', TEST_DIRECTIONS[0]!, [0])
  const wall = testFeature('wall', 'wall', TEST_DIRECTIONS[0]!, [1])
  const features = [pocket, wall]

  const groupsFor = (plan: SetupPlan) =>
    setupGroups({ regions: part.regions }, features, TEST_DIRECTIONS, plan)

  it('can infer while something it reads is unmapped', () => {
    const plan = setPassFor(EMPTY_PLAN, TEST_DIRECTIONS, features, [pocket], PASSES)

    expect(groupsFor(plan)[0]?.canInfer).toBe(true)
  })

  it('cannot once every reading it can reach is mapped', () => {
    const plan = setPassFor(EMPTY_PLAN, TEST_DIRECTIONS, features, [pocket, wall], PASSES)

    expect(groupsFor(plan)[0]?.canInfer).toBe(false)
  })

  /*
   * A way up somebody named that the Engine never analysed. Nothing is
   * attributed to it, so there is nothing to infer — which is what the button
   * should say rather than offering a press that returns nothing.
   */
  it('cannot on a way up the Engine never looked from', () => {
    const named = {
      ...setupFor(TEST_DIRECTIONS, 0, 0),
      direction: undefined,
      directionIndex: 99,
    }
    const plan: SetupPlan = { setups: [named], assigned: {} }

    expect(groupsFor(plan)[0]?.canInfer).toBe(false)
  })
})
