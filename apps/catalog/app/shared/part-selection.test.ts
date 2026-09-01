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
  /**
   * Six arrows over an untouched part are six questions nobody asked (Paul,
   * 2026-08-31). The part is the thing to click; the arrows are what a click
   * produces.
   */
  it('draws no arrows until something is clicked', () => {
    expect(arrowsFor({})).toEqual({ visible: false, shown: -1, active: null })
    expect(arrowsFor({ candidateDirections: [] })).toEqual({
      visible: false,
      shown: -1,
      active: null,
    })
  })

  /** A face that reads one way up gets one arrow, and it points at what is on screen. */
  it('draws the one way up a face reads from', () => {
    expect(arrowsFor({ candidateDirections: [2] })).toEqual({
      visible: true,
      shown: [2],
      active: null,
    })
  })

  /**
   * A face that reads several gets several, and pressing one is how somebody
   * says which of them they meant. None of them scopes: hiding the others
   * would take away the only control that switches between the readings.
   */
  it('draws every way up a face reads from, and scopes to none of them', () => {
    expect(arrowsFor({ candidateDirections: [0, 3] })).toEqual({
      visible: true,
      shown: [0, 3],
      active: null,
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

describe('the arrows on the part', () => {
  /**
   * Reading every hole: a size open at both ends is made from one side, and
   * the arrow says which — turning the size over turns the arrow over with it
   * (Paul, 2026-09-01).
   */
  it('points one arrow at the way up a size is made from', () => {
    expect(arrowsFor({ active: 2 })).toEqual({ visible: true, shown: [2], active: 2 })
  })

  it('draws every way up the click offered when none is decided', () => {
    expect(arrowsFor({ candidateDirections: [0, 3] })).toEqual({
      visible: true,
      shown: [0, 3],
      active: null,
    })
  })

  it('draws none with nothing picked', () => {
    expect(arrowsFor({})).toEqual({ visible: false, shown: -1, active: null })
    expect(arrowsFor({ candidateDirections: [], active: -1 })).toEqual({
      visible: false,
      shown: -1,
      active: null,
    })
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

  /**
   * A row in the all-holes table asks "where are these", and the answer is
   * those holes on a dark part — not those holes plus whatever the other mode
   * had kept (Paul, 2026-09-01).
   */
  it('lights a picked hole group alone', () => {
    expect(partHighlight({ kept: ['a'], focused: 'b', group: ['h1', 'h2'] })).toEqual(['h1', 'h2'])
  })

  it('falls back to the reading when no group is picked', () => {
    expect(partHighlight({ kept: ['a'], focused: 'b', group: null })).toEqual(['a', 'b'])
    expect(partHighlight({ kept: ['a'], focused: null, group: [] })).toEqual(['a'])
  })

  it('lights each hole of a group once', () => {
    expect(partHighlight({ kept: [], focused: null, group: ['h1', 'h1', 'h2'] })).toEqual([
      'h1',
      'h2',
    ])
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
