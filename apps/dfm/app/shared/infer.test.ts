import { describe, expect, it } from 'vitest'

import { INFER_SCOPES, coverFaces, inferable, readingsFor } from './infer'
import { EMPTY_PLAN } from './setups'
import { setPassFor } from './plan-actions'
import { TEST_DIRECTIONS, testFeature, testPart } from './test-part'
import type { PartFeature } from './contracts'

/**
 * Inference — the app volunteering work, and every rule that keeps it honest.
 *
 * The spec is `docs/inference.md` in the picker. Each rule below was a reported
 * bug there first.
 */

const UP = TEST_DIRECTIONS[0]!
const DOWN = TEST_DIRECTIONS[1]!
const part = testPart()

describe('what a way up would also cut', () => {
  it('offers nothing until it is asked', () => {
    // The rule the whole flow is built on. Everything else here assumes it.
    expect(INFER_SCOPES.map((scope) => scope.kind)).toEqual(['only here', 'everything', 'holes'])
  })

  it('never volunteers an undercut', () => {
    // Reachable in the Engine's sense, but it wants a cutter that goes in
    // sideways. Offering it promises a shop something no endmill will do.
    const ordinary = testFeature('wall', 'wall', UP, [0])
    const awkward = testFeature('slot', 'undercut_tslot', UP, [1])

    const offered = inferable([ordinary, awkward], EMPTY_PLAN, UP)

    expect(offered.map((feature) => feature.featureTag)).toEqual(['wall'])
  })

  it('offers what another setup cuts, because moving work is an ordinary choice', () => {
    // A version that skipped everything already spoken for answered "0
    // features" on every part that had been mapped.
    const mine = testFeature('mine', 'wall', UP, [0])
    const theirs = testFeature('theirs', 'wall', DOWN, [1])
    const all = [mine, theirs]
    const plan = setPassFor(EMPTY_PLAN, TEST_DIRECTIONS, all, [theirs], ['rough'])

    // −Z holds region 1, so +Z is not offered it; but nothing else is hidden.
    expect(inferable(all, plan, UP).map((f) => f.featureTag)).toEqual(['mine'])
  })

  it('does not offer back what this setup already cuts', () => {
    const mine = testFeature('mine', 'wall', UP, [0])
    const other = testFeature('other', 'wall', UP, [1])
    const all = [mine, other]
    const plan = setPassFor(EMPTY_PLAN, TEST_DIRECTIONS, all, [mine], ['rough'])
    const setupId = plan.setups[0]!.id

    expect(inferable(all, plan, UP, 'everything', [], setupId).map((f) => f.featureTag)).toEqual([
      'other',
    ])
  })

  it('builds the offer smallest reading first, so it can be argued with', () => {
    // Eight walls can have one clicked off; the profile covering the same eight
    // faces can only be taken or left, and taking it decides seven faces nobody
    // was asked about. Where the small readings cover the ground between them,
    // they win and the profile is never offered.
    const wide = testFeature('wide', 'profile', UP, [0, 1, 2])
    const a = testFeature('a', 'wall', UP, [0])
    const b = testFeature('b', 'wall', UP, [1])
    const c = testFeature('c', 'wall', UP, [2])

    expect(
      inferable([wide, a, b, c], EMPTY_PLAN, UP)
        .map((f) => f.featureTag)
        .sort(),
    ).toEqual(['a', 'b', 'c'])
  })

  it('takes the larger reading when the small one it displaces covers nothing else', () => {
    // The other half of the same rule: granularity is only worth having where
    // it buys a choice. A wall wholly inside a profile that reaches further is
    // not a choice, it is a smaller amount of the same work.
    const wide = testFeature('wide', 'profile', UP, [0, 1, 2])
    const narrow = testFeature('narrow', 'wall', UP, [0])

    expect(inferable([wide, narrow], EMPTY_PLAN, UP).map((f) => f.featureTag)).toEqual(['wide'])
  })

  it('gives a face a second hearing when a small reading blocked a large one', () => {
    // A fillet taken early blocks the pocket sharing its face, and the pocket's
    // other faces end up covered by nothing at all — the offer comes back short
    // and they read as unreachable from a direction that can plainly reach them.
    const fillet = testFeature('fillet', 'outer_fillet', UP, [1])
    const pocket = testFeature('pocket', 'pocket', UP, [1, 2, 3])
    const offered = inferable([fillet, pocket], EMPTY_PLAN, UP)
    const covered = new Set(offered.flatMap((feature) => feature.regionIdxs))

    expect(covered.has(2)).toBe(true)
    expect(covered.has(3)).toBe(true)
    // And the reading it gave back is gone, so no face is cut twice.
    expect(offered.map((f) => f.featureTag)).toEqual(['pocket'])
  })

  it('leaves a face uncovered rather than displacing a reading that reaches elsewhere', () => {
    // The rescue only takes back readings it wholly contains. A fillet spanning
    // a face the pocket cannot reach is not the offer's to give away.
    const fillet = testFeature('fillet', 'outer_fillet', UP, [0, 1])
    const pocket = testFeature('pocket', 'pocket', UP, [1, 2, 3])

    expect(inferable([fillet, pocket], EMPTY_PLAN, UP).map((f) => f.featureTag)).toEqual(['fillet'])
  })

  it('cuts each face exactly once, whatever it offers', () => {
    const offered = inferable(part.features, EMPTY_PLAN, UP)
    const seen = new Set<number>()

    for (const feature of offered) {
      for (const idx of feature.regionIdxs) {
        expect(seen.has(idx)).toBe(false)
        seen.add(idx)
      }
    }
  })
})

describe('only here', () => {
  it('offers only the readings covering a face nothing else can reach', () => {
    // Not a choice — drop one and a surface has nobody to cut it.
    const forcedOnly = inferable(part.features, EMPTY_PLAN, DOWN, 'only here')
    const everything = inferable(part.features, EMPTY_PLAN, DOWN, 'everything')

    expect(forcedOnly.length).toBeLessThan(everything.length)
    expect(forcedOnly.every((f) => f.regionIdxs.some((idx) => [4, 5].includes(idx)))).toBe(true)
  })
})

describe('holes on axis', () => {
  it('offers only the holes', () => {
    const hole = {
      ...testFeature('hole', 'through_hole', UP, [0]),
      datasheet: { facts: { kind: 'Hole' } },
    } as unknown as PartFeature
    const wall = testFeature('wall', 'wall', UP, [1])

    expect(inferable([hole, wall], EMPTY_PLAN, UP, 'holes').map((f) => f.featureTag)).toEqual([
      'hole',
    ])
  })
})

describe('re-covering an offer after a face is pruned', () => {
  it('keeps the rest of a reading when one of its faces leaves', () => {
    // Losing one face of a wall does not mean losing its other seven.
    const wall = testFeature('wall', 'wall', UP, [0, 1, 2])
    const face0 = testFeature('face0', 'face', UP, [0])
    const face1 = testFeature('face1', 'face', UP, [1])
    const all = [wall, face0, face1]

    const covered = coverFaces(all, UP, new Set([0, 1]))

    expect(covered.map((f) => f.featureTag).sort()).toEqual(['face0', 'face1'])
  })

  it('never reaches outside the wanted set', () => {
    // Cutting it would cut a face nobody asked for.
    const wall = testFeature('wall', 'wall', UP, [0, 1, 9])

    expect(coverFaces([wall], UP, new Set([0, 1]))).toEqual([])
  })

  it('keeps what somebody already chose rather than improving on it', () => {
    // "When I select this wall, it's chaining the wall into the full profile."
    const wall = testFeature('wall', 'wall', UP, [0])
    const profile = testFeature('profile', 'profile', UP, [0, 1])
    const face1 = testFeature('face1', 'face', UP, [1])
    const all = [wall, profile, face1]

    const covered = coverFaces(all, UP, new Set([0, 1]), [], new Set(['wall']))

    expect(covered.map((f) => f.featureTag)).toContain('wall')
    expect(covered.map((f) => f.featureTag)).not.toContain('profile')
  })
})

describe('what painting a face asks for', () => {
  it('takes the readings that reach the painted faces, not the ones inside them', () => {
    // A through pocket has walls and a floor, and nobody paints all eight faces
    // of three pockets to ask an obvious question.
    const pocket = testFeature('pocket', 'pocket', UP, [0, 1, 2])

    expect(readingsFor([pocket], UP, new Set([1])).map((f) => f.featureTag)).toEqual(['pocket'])
  })

  it('answers only for the way up being held', () => {
    const mine = testFeature('mine', 'wall', UP, [0])
    const theirs = testFeature('theirs', 'wall', DOWN, [0])

    expect(readingsFor([mine, theirs], UP, new Set([0])).map((f) => f.featureTag)).toEqual(['mine'])
  })

  it('never cuts one face twice', () => {
    const wide = testFeature('wide', 'profile', UP, [0, 1])
    const narrow = testFeature('narrow', 'wall', UP, [0])

    const chosen = readingsFor([wide, narrow], UP, new Set([0, 1]))
    const seen = new Set<number>()
    for (const feature of chosen) {
      for (const idx of feature.regionIdxs) {
        expect(seen.has(idx)).toBe(false)
        seen.add(idx)
      }
    }
  })
})
