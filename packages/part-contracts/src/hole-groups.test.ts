import { describe, expect, it } from 'vitest'

import { groupAcrossPart, groupHoles, holeKey, isHole, sameHoles } from './hole-groups.js'
import { TEST_DIRECTIONS } from './test-part.js'
import type { PartFeature } from './contracts.js'

const UP = TEST_DIRECTIONS[0]!
const DOWN = TEST_DIRECTIONS[1]!

const hole = (
  tag: string,
  diameter: number,
  depth: number,
  direction = UP,
  kind = 'Hole',
): PartFeature =>
  ({
    featureTag: tag,
    featureType: 'through_hole',
    machiningDirection: direction,
    axis: direction,
    regionIdxs: [0],
    datasheet: { facts: { kind, diameter }, zMin: -depth, zMax: 0 },
  }) as unknown as PartFeature

describe('holes that are the same hole', () => {
  it('gathers ones a shop would drill in one go', () => {
    // Eight on a bolt circle are one decision and one tool.
    const eight = Array.from({ length: 8 }, (_, i) => hole(`h${String(i)}`, 6.35, 10))

    const groups = groupHoles(eight)

    expect(groups).toHaveLength(1)
    expect(groups[0]?.holes).toHaveLength(8)
  })

  it('keeps a different way up apart', () => {
    // Not even in the same setup, whatever the size.
    expect(groupHoles([hole('a', 6.35, 10, UP), hole('b', 6.35, 10, DOWN)])).toHaveLength(2)
  })

  it('keeps a different diameter apart', () => {
    expect(groupHoles([hole('a', 6.35, 10), hole('b', 8, 10)])).toHaveLength(2)
  })

  it('keeps a genuinely different depth apart', () => {
    // Same tool, very different cut — and the deep one may not be drillable.
    expect(groupHoles([hole('a', 6.35, 4), hole('b', 6.35, 40)])).toHaveLength(2)
  })

  it('forgives the depth a curved face reports', () => {
    /*
     * Depth is measured to where the hole meets the surface, so the same drill
     * through a curved or slanted face reports a different number every time —
     * observed at 1.036 against 1.052 on a real part, which is one hole by any
     * reading a shop would give it. Matching exactly split those in two.
     */
    expect(groupHoles([hole('a', 2.101, 1.036), hole('b', 2.101, 1.052)])).toHaveLength(1)
  })

  it('still keeps a third of a millimetre apart on a shallow hole', () => {
    // The tolerance is relative, with a floor, so it does not swallow small
    // holes whose whole depth is the size of the allowance.
    expect(groupHoles([hole('a', 2, 0.2), hole('b', 2, 0.6)])).toHaveLength(2)
  })

  it('never merges two diameters', () => {
    // A different diameter is a different drill, however close.
    expect(groupHoles([hole('a', 3.81, 5), hole('b', 3.823, 5)])).toHaveLength(2)
  })

  it('leaves anything that is not a hole alone', () => {
    const pocket = hole('pocket', 6.35, 10, UP, 'Pocket')

    expect(groupHoles([hole('a', 6.35, 10), pocket])).toHaveLength(2)
  })

  it('never heaps unmeasured holes together', () => {
    // Grouping on a missing number would put every hole the Engine could not
    // measure into one row.
    const bare = { ...hole('bare', 0, 0), datasheet: { facts: { kind: 'Hole' } } } as PartFeature
    const other = { ...hole('other', 0, 0), datasheet: { facts: { kind: 'Hole' } } } as PartFeature

    expect(groupHoles([bare, other])).toHaveLength(2)
  })

  it('takes the place of the first hole in it, so a list does not reshuffle', () => {
    const order = [hole('wall', 8, 5), hole('a', 6.35, 10), hole('b', 8, 5)]

    expect(groupHoles(order).map((g) => g.holes[0]?.featureTag)).toEqual(['wall', 'a'])
  })

  it('knows a hole by the Engine family, not the spelling of its type', () => {
    expect(isHole(hole('a', 6.35, 10))).toBe(true)
    expect(isHole(hole('p', 6.35, 10, UP, 'Pocket'))).toBe(false)
  })

  it('rounds, because two holes a shop calls identical differ in the last bits', () => {
    expect(holeKey(hole('a', 6.3500001, 10))).toBe(holeKey(hole('b', 6.35, 10)))
  })
})

describe('the holes a click means', () => {
  it('finds every identical hole on the part, not just the one clicked', () => {
    /*
     * The list a click produces holds the readings of one face, so a hole
     * arrives there alone however many identical ones the part has. Finding the
     * other seven by clicking each in turn is the work the grouping removes.
     */
    const all = [
      hole('a', 6.35, 10),
      hole('b', 6.35, 10),
      hole('c', 6.35, 10),
      hole('elsewhere', 8, 10),
    ]

    expect(sameHoles(all, all[0]!).map((h) => h.featureTag)).toEqual(['a', 'b', 'c'])
  })

  it('is never empty, so one hole and eight are handled the same way', () => {
    const lone = hole('lone', 6.35, 10)

    expect(sameHoles([lone], lone)).toEqual([lone])
  })

  it('leaves anything that is not a hole as itself', () => {
    const pocket = hole('pocket', 6.35, 10, UP, 'Pocket')

    expect(sameHoles([pocket, hole('a', 6.35, 10)], pocket)).toEqual([pocket])
  })

  it('never gathers holes the Engine could not measure', () => {
    const bare = { ...hole('bare', 0, 0), datasheet: { facts: { kind: 'Hole' } } } as PartFeature
    const other = { ...hole('other', 0, 0), datasheet: { facts: { kind: 'Hole' } } } as PartFeature

    expect(sameHoles([bare, other], bare)).toEqual([bare])
  })
})

describe('a list that reaches across the part', () => {
  const part = [hole('a', 6.35, 10), hole('b', 6.35, 10), hole('c', 6.35, 10), hole('big', 8, 10)]

  it('makes one hole stand for every identical one, which grouping in place cannot', () => {
    // The candidates hold the readings of one face, so a hole arrives alone —
    // and `groupHoles` over that list would say "×1" about a row the part is
    // lighting three of.
    expect(groupHoles([part[0]!])[0]?.holes).toHaveLength(1)
    expect(groupAcrossPart(part, [part[0]!])[0]?.holes.map((h) => h.featureTag)).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  it('keeps the reading the list supplied first, so a group opens onto the hole clicked', () => {
    expect(groupAcrossPart(part, [part[2]!])[0]?.holes.map((h) => h.featureTag)).toEqual([
      'c',
      'a',
      'b',
    ])
  })

  it('makes one row of two candidates from the same group', () => {
    // Two of the eight ⌘-clicked is still one decision and one tool.
    const rows = groupAcrossPart(part, [part[0]!, part[1]!])

    expect(rows).toHaveLength(1)
    expect(rows[0]?.holes).toHaveLength(3)
  })

  it('leaves everything that is not a hole exactly where it was', () => {
    const pocket = hole('pocket', 6.35, 10, UP, 'Pocket')

    expect(groupAcrossPart([...part, pocket], [pocket, part[3]!]).map((g) => g.key)).toEqual([
      'pocket',
      'big',
    ])
  })
})
