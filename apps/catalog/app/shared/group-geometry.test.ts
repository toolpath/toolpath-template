import { describe, expect, it } from 'vitest'
import type { PartFeature, ReachCurve } from '@toolpath/part-contracts'
import { heightAt } from '@toolpath/catalog-data'
import { askedCurve, groupCurve, groupReadings, sharedHoleDiameter } from './group-geometry'

/**
 * A feature as the kernel reports one, cut straight down.
 *
 * `extendedZMax` is what `partTop` reads, so every fixture states it: the part
 * top is what makes "depth below top" answerable at all.
 */
const feature = (
  featureTag: string,
  featureType: string,
  datasheet: Record<string, unknown>,
): PartFeature =>
  ({
    featureTag,
    featureType,
    regionIdxs: [],
    machiningDirection: { x: 0, y: 0, z: 1 },
    datasheet: { extendedZMax: 0, zMax: 0, ...datasheet },
  }) as unknown as PartFeature

const hole = (tag: string, depth: number, diameter: number): PartFeature =>
  feature(tag, 'ThroughHole', { zMin: -depth, facts: { kind: 'Hole', diameter } })

const pocket = (tag: string, depth: number, cutter: number): PartFeature =>
  feature(tag, 'Pocket', {
    zMin: -depth,
    facts: { kind: 'Pocket', cd: { ignore: { min: cutter } } },
  })

const named = (readings: ReadonlyArray<{ name: string }>): Array<string> =>
  readings.map((each) => each.name)

const at = (readings: ReturnType<typeof groupReadings>, name: string) =>
  readings.find((each) => each.name === name)

describe('what a group measures', () => {
  /**
   * **A group is one tool for all of them**, so a demand on the tool is the
   * largest of the group's: the tool has to reach the deepest of them, and a
   * tool chosen for the shallowest would come up short on every other.
   */
  it('takes the hardest demand, and says whose it is', () => {
    const readings = groupReadings([hole('shallow', 20, 8), hole('deep', 40, 8)])

    expect(at(readings, 'depth below top')).toMatchObject({
      value: 40,
      featureTag: 'deep',
      bound: 'floor',
    })
    expect(at(readings, 'L/D')).toMatchObject({ value: 5, featureTag: 'deep' })
  })

  /**
   * A ceiling is the other way round: it is a limit on the tool, so the
   * smallest of them is the one every tool has to clear.
   */
  it('takes the tightest limit, and says whose it is', () => {
    const readings = groupReadings([pocket('wide', 10, 6), pocket('tight', 10, 4)])

    expect(at(readings, 'largest tool diameter')).toMatchObject({
      value: 4,
      featureTag: 'tight',
      bound: 'ceiling',
    })
  })

  /** Nothing to attribute where they all read the same: the number is the group's. */
  it('names no feature where every one of them agrees', () => {
    const readings = groupReadings([hole('a', 20, 8), hole('b', 20, 8)])

    expect(at(readings, 'depth below top')).toMatchObject({ value: 20, featureTag: null })
    expect(at(readings, 'hole diameter')).toMatchObject({ value: 8, featureTag: null })
  })

  /**
   * **A `match` has no worst case** (`GroupBound` in `feature-defaults.ts`).
   * Two holes of different diameters do not have a harder one — they have no
   * one drill — and answering "⌀6" about them would be picking one hole and
   * hiding the other.
   */
  it('says a field differs rather than picking a side of it', () => {
    const readings = groupReadings([hole('small', 20, 6), hole('large', 20, 8)])

    expect(at(readings, 'hole diameter')).toMatchObject({
      value: null,
      featureTag: null,
      bound: 'match',
    })
    expect(at(readings, 'hole diameter')?.per).toEqual([
      { featureTag: 'small', value: 6 },
      { featureTag: 'large', value: 8 },
    ])
  })

  /**
   * The fields are the sheet's, per feature, in the order they were first
   * asked for — so a group of two kinds shows what each kind is shown by, and
   * a field only one of them reports is folded from that one alone.
   */
  it('shows the union of its features fields, first asked first', () => {
    const readings = groupReadings([hole('bore', 20, 8), pocket('cavity', 30, 6)])

    expect(named(readings)).toEqual([
      'depth below top',
      'feature depth',
      'hole diameter',
      'L/D',
      'largest tool diameter',
    ])
    expect(at(readings, 'hole diameter')).toMatchObject({ value: 8, featureTag: null })
    expect(at(readings, 'largest tool diameter')).toMatchObject({ value: 6, featureTag: null })
  })

  /** A group of one reads exactly as the feature box does, with nothing to attribute. */
  it('reads a group of one as that feature', () => {
    const readings = groupReadings([hole('only', 20, 8)])

    expect(readings.map((each) => [each.name, each.value, each.featureTag])).toEqual([
      ['depth below top', 20, null],
      ['feature depth', 20, null],
      ['hole diameter', 8, null],
      ['L/D', 2.5, null],
    ])
  })

  /** Depth is measured from the top of the part, so the whole part goes in. */
  it('measures depth from the part top rather than from the group', () => {
    const above = feature('face', 'Face', {
      extendedZMax: 10,
      zMax: 10,
      zMin: 0,
      facts: { kind: 'Face', cd: { ignore: { min: 20 } } },
    })
    const readings = groupReadings([hole('bore', 20, 8)], [above, hole('bore', 20, 8)])

    expect(at(readings, 'depth below top')).toMatchObject({ value: 30 })
  })

  it('has nothing to say about an empty group', () => {
    expect(groupReadings([])).toEqual([])
  })
})

/**
 * **A tap has one nominal size** (Paul, 2026-09-09: threading the full group
 * from the Group dialog). So a group can be threaded as a group only where it
 * is holes of one bore, and the editor says so rather than offering a control
 * that would have to pick one of two.
 */
describe('the bore a group shares', () => {
  it('answers the diameter when every hole is the same', () => {
    expect(sharedHoleDiameter([hole('a', 20, 5), hole('b', 30, 5)])).toBe(5)
  })

  it('answers nothing when the holes disagree', () => {
    expect(sharedHoleDiameter([hole('a', 20, 5), hole('b', 20, 6)])).toBeNull()
  })

  it('answers nothing for a group holding anything that is not a hole', () => {
    expect(sharedHoleDiameter([hole('a', 20, 5), pocket('p', 10, 4)])).toBeNull()
  })

  it('answers nothing for an empty group', () => {
    expect(sharedHoleDiameter([])).toBeNull()
  })
})

/**
 * **One tool goes into all of them**, so the material it has to get past is
 * every feature's at once. The curve was read off the face clicked last, which
 * made the drawing and the verdict under it depend on the order a group was
 * picked in (Paul, 2026-09-11).
 */
describe('the material a group has to clear', () => {
  const walled = (tag: string, curve: ReachCurve): PartFeature =>
    feature(tag, 'Pocket', {
      zMin: -10,
      facts: { kind: 'Pocket', cd: { ignore: { min: 6 } } },
      reachCurve: curve,
    })

  /** What every reader of a curve agrees it means, asked across a span of offsets. */
  const sampled = (curve: ReachCurve | null): Array<number> | null =>
    curve === null
      ? null
      : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 20].map((offset) => heightAt(curve, offset))

  it('takes the taller of the two at every offset, not the one clicked last', () => {
    const shallow: ReachCurve = { horizontalOffset: [2, 8], verticalOffset: [4, 6] }
    const deep: ReachCurve = { horizontalOffset: [5, 10], verticalOffset: [12, 30] }
    const union = groupCurve([walled('shallow', shallow), walled('deep', deep)])

    const tallest = sampled(shallow)?.map((height, index) =>
      Math.max(height, sampled(deep)?.[index] ?? 0),
    )
    expect(sampled(union)).toEqual(tallest)
    // Every input knot is considered, and the two the run after them repeats
    // come back out: the deep wall is over the shallow one's head throughout,
    // so the answer is a staircase of two rather than of four.
    expect(union).toEqual({ horizontalOffset: [5, 10], verticalOffset: [12, 30] })
  })

  it('answers the same whichever order the group was picked in', () => {
    const a = walled('a', { horizontalOffset: [3, 9], verticalOffset: [7, 11] })
    const b = walled('b', { horizontalOffset: [4], verticalOffset: [25] })
    expect(groupCurve([a, b])).toEqual(groupCurve([b, a]))
  })

  it('drops a knot whose height the run after it repeats', () => {
    const low = walled('low', { horizontalOffset: [1, 2, 3], verticalOffset: [5, 5, 5] })
    const high = walled('high', { horizontalOffset: [3], verticalOffset: [9] })

    expect(groupCurve([low, high])).toEqual({ horizontalOffset: [3], verticalOffset: [9] })
  })

  it("is one feature's own curve, unchanged, when it is the only one", () => {
    const curve: ReachCurve = { horizontalOffset: [2, 8], verticalOffset: [4, 6] }
    expect(groupCurve([walled('one', curve)])).toEqual(curve)
  })

  it('ignores a feature that states no curve rather than reading it as flat', () => {
    const curve: ReachCurve = { horizontalOffset: [2, 8], verticalOffset: [4, 6] }
    expect(groupCurve([walled('one', curve), hole('bare', 20, 8)])).toEqual(curve)
  })

  it('answers nothing where no feature states one', () => {
    expect(groupCurve([hole('a', 20, 8), hole('b', 20, 8)])).toBeNull()
    expect(groupCurve([])).toBeNull()
  })
})

/**
 * Which features the curve is folded over: what the page is being asked, and
 * not one feature of it. The drawing was reading the face clicked last while
 * the tool list beside it was judged against the whole question.
 */
describe('the scope the material is folded over', () => {
  const walled = (tag: string, height: number): PartFeature =>
    feature(tag, 'Pocket', {
      zMin: -10,
      facts: { kind: 'Pocket', cd: { ignore: { min: 6 } } },
      reachCurve: { horizontalOffset: [4], verticalOffset: [height] },
    })

  const shallow = walled('shallow', 4)
  const deep = walled('deep', 40)

  it('folds every feature asked about, whichever of them is being read', () => {
    expect(askedCurve('all', [shallow, deep], shallow, [shallow, deep])).toEqual({
      horizontalOffset: [4],
      verticalOffset: [40],
    })
  })

  it('reads the feature in front of it for a group answered one tool each', () => {
    expect(askedCurve('each', [shallow, deep], shallow, [shallow, deep])).toEqual({
      horizontalOffset: [4],
      verticalOffset: [4],
    })
  })

  it('reads the feature in front of it when nothing is being asked', () => {
    expect(askedCurve('all', [], deep, [shallow, deep])).toEqual({
      horizontalOffset: [4],
      verticalOffset: [40],
    })
    expect(askedCurve('all', [], null, [shallow, deep])).toBeNull()
  })
})
