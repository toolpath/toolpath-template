import { describe, expect, it } from 'vitest'
import type { PartFeature } from '@toolpath/part-contracts'
import {
  arrowsFor,
  byLargest,
  dropAll,
  dropFeature,
  escapeStep,
  keepAll,
  keepFeature,
  keptFeatures,
  partHighlight,
  preferLargest,
  surfaceArea,
  toggleKept,
} from './part-selection'

const DOWN = { x: 0, y: 0, z: 1 }
const SIDE = { x: 1, y: 0, z: 0 }

const feature = (tag: string, type: string, direction = DOWN): PartFeature =>
  ({
    featureTag: tag,
    featureType: type,
    regionIdxs: [],
    machiningDirection: direction,
  }) as unknown as PartFeature

const PART = [
  feature('hole-1', 'Hole'),
  feature('pocket-1', 'Pocket'),
  feature('hole-2', 'CounterboreHole'),
  feature('slot-1', 'Slot', SIDE),
  feature('hole-3', 'Hole', SIDE),
]

describe('the group being asked about', () => {
  it('keeps in the order things were kept', () => {
    expect(keepFeature(keepFeature([], 'b'), 'a')).toEqual(['b', 'a'])
  })

  it('keeps a feature once however often it is offered', () => {
    expect(keepFeature(['a'], 'a')).toEqual(['a'])
  })

  it('toggles one off and leaves the rest in place', () => {
    expect(toggleKept(['a', 'b', 'c'], 'b')).toEqual(['a', 'c'])
  })

  it('keeps everything offered without disturbing what is there', () => {
    expect(keepAll(['b'], ['a', 'b', 'c'])).toEqual(['b', 'a', 'c'])
  })

  it('drops exactly what was offered', () => {
    expect(dropAll(['a', 'b', 'c'], ['a', 'c'])).toEqual(['b'])
    expect(dropFeature(['a', 'b'], 'a')).toEqual(['b'])
  })

  /** Read in the part's order: a list that reorders as it grows loses your place. */
  it('reads the kept group in the part’s own order', () => {
    expect(keptFeatures(PART, ['slot-1', 'hole-1']).map((each) => each.featureTag)).toEqual([
      'hole-1',
      'slot-1',
    ])
  })

  it('ignores a kept tag the part does not have', () => {
    expect(keptFeatures(PART, ['from-another-part'])).toEqual([])
  })
})

describe('what the part shows, and when', () => {
  /** They are half the question; hiding them leaves nothing to press. */
  it('draws every way up while nothing is being read', () => {
    expect(arrowsFor({})).toEqual({ visible: true, shown: null, active: null })
    expect(arrowsFor({ focusedDirection: null })).toEqual({
      visible: true,
      shown: null,
      active: null,
    })
  })

  /**
   * A reading points at its own way up without taking the others away.
   *
   * Its arrow is drawn — one among six is a pointer — but nothing is scoped:
   * hiding the rest because a reading happens to be on screen would make a
   * choice on somebody's behalf, and the next face click would silently be
   * read from a setup they never picked.
   */
  it('points at the reading’s way up without scoping to it', () => {
    expect(arrowsFor({ focusedDirection: 2 })).toEqual({
      visible: true,
      shown: 2,
      active: null,
    })
  })

  /**
   * Pressing an arrow is a statement about which way up. Leaving the other five
   * on screen makes it look like nothing happened, so this one *scopes*.
   */
  it('draws only the arrow that was pressed, even before it reads anything', () => {
    expect(arrowsFor({ activeDirection: 1 })).toEqual({ visible: true, shown: 1, active: 1 })
  })

  it('lets the pressed arrow stand over the reading’s own', () => {
    expect(arrowsFor({ activeDirection: 1, focusedDirection: 2 })).toEqual({
      visible: true,
      shown: 1,
      active: 1,
    })
  })
})

describe('Escape, outward one press at a time', () => {
  /** The click is the newest thing said, so it goes first. */
  it('puts the reading down before the list', () => {
    expect(escapeStep({ reading: true, keptCount: 3 })).toBe('selection')
  })

  /** The work is last: losing it to undo a click is what the ladder prevents. */
  it('clears the list only once nothing is being read', () => {
    expect(escapeStep({ reading: false, keptCount: 3 })).toBe('kept')
  })

  it('has nothing left to do on a part with nothing kept', () => {
    expect(escapeStep({ reading: false, keptCount: 0 })).toBeNull()
  })
})

describe('partHighlight', () => {
  it('lights the kept group and whatever is being read', () => {
    expect(partHighlight({ kept: ['a', 'b'], focused: 'c' })).toEqual(['a', 'b', 'c'])
  })

  it('lights a read feature once when it is already kept', () => {
    expect(partHighlight({ kept: ['a'], focused: 'a' })).toEqual(['a'])
  })

  it('lights nothing when nothing is kept or read', () => {
    expect(partHighlight({ kept: [], focused: null })).toEqual([])
  })
})

describe('which reading a fresh click opens', () => {
  const sized = (tag: string, walls?: number, floors?: number): PartFeature =>
    ({
      featureTag: tag,
      featureType: 'Pocket',
      regionIdxs: [],
      machiningDirection: DOWN,
      datasheet: { wallishArea: walls, floorishArea: floors },
    }) as unknown as PartFeature

  it('adds walls and floors', () => {
    expect(surfaceArea(sized('a', 30, 12))).toBe(42)
  })

  it('reads a feature stating no area as zero rather than as missing', () => {
    expect(surfaceArea(sized('a'))).toBe(0)
  })

  /** The biggest reading is the one whose shape the clicked face is most of. */
  it('opens the largest of a face’s readings', () => {
    const features = [sized('small', 5), sized('big', 90), sized('middling', 40)]

    expect(preferLargest(features)(['small', 'big', 'middling'])).toBe('big')
  })

  /** A tie keeps the click's own order rather than reshuffling the kernel's ranking. */
  it('keeps the click’s order when two readings are the same size', () => {
    const features = [sized('first', 10), sized('second', 10)]

    expect(preferLargest(features)(['first', 'second'])).toBe('first')
  })

  it('falls back to the first tag when it knows none of them', () => {
    expect(preferLargest([])(['unknown', 'other'])).toBe('unknown')
  })

  it('has nothing to open when a face resolves to nothing', () => {
    expect(preferLargest([])([])).toBeNull()
  })
})

describe('the order a face’s readings are drawn in', () => {
  const sized = (tag: string, area: number): PartFeature =>
    ({
      featureTag: tag,
      featureType: 'Pocket',
      regionIdxs: [],
      machiningDirection: DOWN,
      datasheet: { wallishArea: area },
    }) as unknown as PartFeature

  /** The reading a click opens is the largest, so the list opens on it. */
  it('puts the biggest reading first, where the default is', () => {
    const drawn = byLargest([sized('small', 5), sized('big', 90), sized('middling', 40)])

    expect(drawn.map((each) => each.featureTag)).toEqual(['big', 'middling', 'small'])
  })

  it('keeps the click’s own order for readings of equal size', () => {
    const drawn = byLargest([sized('first', 10), sized('second', 10), sized('third', 10)])

    expect(drawn.map((each) => each.featureTag)).toEqual(['first', 'second', 'third'])
  })

  it('leaves the caller’s list alone', () => {
    const given = [sized('small', 5), sized('big', 90)]
    byLargest(given)

    expect(given.map((each) => each.featureTag)).toEqual(['small', 'big'])
  })
})
