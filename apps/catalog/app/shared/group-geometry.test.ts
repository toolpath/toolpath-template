import { describe, expect, it } from 'vitest'
import type { PartFeature } from '@toolpath/part-contracts'
import { groupReadings } from './group-geometry'

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
