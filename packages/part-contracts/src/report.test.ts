import { describe, expect, test } from 'vitest'
import type { PartFeature } from './report.js'
import {
  featureDetailRows,
  featureFromTags,
  featureSummary,
  filterFeatures,
  reachableFrom,
  tagsOfType,
} from './report.js'

const hole = {
  featureTag: 'hole-123',
  featureType: 'blind_hole',
  regionIdxs: [3, 4],
  machiningDirection: { x: 0, y: 0, z: 1 },
  axis: { x: 0, y: 0, z: 1 } as never,
  datasheet: { facts: { kind: 'Hole', diameter: 6.35 } },
} as unknown as PartFeature

const wall: PartFeature = {
  featureTag: 'wall-456',
  featureType: 'wall',
  regionIdxs: [1],
  machiningDirection: { x: -1, y: 0, z: 0 },
  axis: { x: 1, y: 0, z: 0 } as never,
}

describe('report view model', () => {
  test('derives readable feature information without mutating Engine data', () => {
    expect(featureSummary(hole)).toEqual({
      tag: 'hole-123',
      type: 'Blind Hole',
      direction: '+Z',
      regionCount: 2,
      headline: '⌀ 6.35 mm',
    })
    expect(filterFeatures([hole, wall], '−x')).toEqual([wall])
    expect(featureDetailRows(hole)).toContainEqual({ label: 'Diameter', value: '6.35 mm' })
  })

  test('keeps every ownership candidate from an ambiguous mesh click', () => {
    // In the order they were named — they arrive ranked, and this used to hand
    // them back in report order instead.
    expect(featureFromTags([hole, wall], ['wall-456', 'hole-123'])).toEqual([wall, hole])
  })
})

describe('featureFromTags', () => {
  const features = [hole, wall]

  test('returns them in the order they were named, not report order', () => {
    // The candidates are ranked. Shown in report order while the keyboard walks
    // the ranking, the highlight jumps around the list.
    expect(featureFromTags(features, ['wall-456', 'hole-123']).map((f) => f.featureTag)).toEqual([
      'wall-456',
      'hole-123',
    ])
  })

  test('skips a tag no feature answers to', () => {
    expect(featureFromTags(features, ['nope', 'wall-456']).map((f) => f.featureTag)).toEqual([
      'wall-456',
    ])
  })
})

describe('tagsOfType', () => {
  const features = [hole, wall, { ...hole, featureTag: 'hole-789' }]

  test('names every feature of the kind that was opened', () => {
    expect(tagsOfType(features, 'blind_hole', null)).toEqual(['hole-123', 'hole-789'])
  })

  test('narrows to the direction being held, like the count beside it does', () => {
    expect(tagsOfType(features, 'blind_hole', { x: 0, y: 0, z: 1 })).toEqual([
      'hole-123',
      'hole-789',
    ])
    expect(tagsOfType(features, 'blind_hole', { x: -1, y: 0, z: 0 })).toEqual([])
  })

  test('lights nothing when no type is open', () => {
    expect(tagsOfType(features, null, null)).toEqual([])
  })
})

describe('reachableFrom', () => {
  /*
   * The list this is asked about is the **part's**, and a reading somebody drew
   * here is only in that one. Asked with the report's readings instead, a made
   * tag is not found, the answer is "no", and holding the way up that reading is
   * cut from drops it from the list it belongs at the top of — which is the bug
   * this was lifted out of `part-inspector` to pin.
   */
  const made: PartFeature = {
    ...wall,
    featureTag: 'made-1',
    machiningDirection: { x: 0, y: 0, z: 1 },
  }

  test('a reading drawn here is reached from the way up it is cut from', () => {
    expect(reachableFrom([hole, made], { x: 0, y: 0, z: 1 })('made-1')).toBe(true)
  })

  test('and is not reached from a way up it is not cut from', () => {
    expect(reachableFrom([hole, made], { x: -1, y: 0, z: 0 })('made-1')).toBe(false)
  })

  test('a tag no reading answers to is reached from nowhere', () => {
    expect(reachableFrom([hole, made], { x: 0, y: 0, z: 1 })('absent')).toBe(false)
  })

  test('nothing held reaches everything, so releasing an arrow puts the list back', () => {
    const anything = reachableFrom([hole, made], null)
    expect([anything('made-1'), anything('absent')]).toEqual([true, true])
  })
})
