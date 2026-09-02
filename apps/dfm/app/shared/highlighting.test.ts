import { describe, expect, test } from 'vitest'
import { listHighlight, paintByCut, partHighlight } from './highlighting'
import { EMPTY_PLAN, type SetupPlan } from './setups'
import { TEST_DIRECTIONS, testFeature } from './test-part'

const OPEN_TYPE = ['wall-1', 'wall-2']

describe('listHighlight', () => {
  test('lights the open type while nothing more specific is being asked', () => {
    expect(listHighlight({ hovered: [], ofType: OPEN_TYPE, pointerOnPart: false })).toEqual(
      OPEN_TYPE,
    )
  })

  test('drops it while the pointer is over the part', () => {
    // Reaching for a face through a lit type is reaching through the type.
    expect(listHighlight({ hovered: [], ofType: OPEN_TYPE, pointerOnPart: true })).toEqual([])
  })

  test('lets a row under the pointer replace it', () => {
    expect(listHighlight({ hovered: ['wall-2'], ofType: OPEN_TYPE, pointerOnPart: false })).toEqual(
      ['wall-2'],
    )
  })

  test('paints nothing once the type has stopped being the question', () => {
    // Which is how a click puts the group down: the caller stops handing the
    // type's features over at all.
    expect(listHighlight({ hovered: [], ofType: [], pointerOnPart: false })).toEqual([])
  })
})

describe('what the part lights up', () => {
  test('paints the ticked readings and the one being read', () => {
    const { tags } = partHighlight({
      selected: ['a', 'b'],
      focused: 'c',
      picked: [],
    })

    expect(tags.sort()).toEqual(['a', 'b', 'c'])
  })

  test('does not paint the focused reading twice when it is also ticked', () => {
    const { tags } = partHighlight({ selected: ['a'], focused: 'a', picked: [] })

    expect(tags).toEqual(['a'])
  })

  test('paints nothing when nothing is chosen', () => {
    expect(partHighlight({ selected: [], focused: null, picked: [] })).toEqual({
      tags: [],
      regions: [],
    })
  })

  test('paints the faces picked on the part, de-duplicated', () => {
    const { regions } = partHighlight({ selected: [], focused: null, picked: [1, 2, 2] })

    expect(regions.sort()).toEqual([1, 2])
  })
})

describe('painting a reading that cuts only part of itself', () => {
  const wall = testFeature('wall-1', 'wall', TEST_DIRECTIONS[1]!, [0])
  const profile = testFeature('profile-1', 'profile', TEST_DIRECTIONS[0]!, [0, 1, 2])
  const features = [wall, profile]

  const split: SetupPlan = {
    setups: [{ id: 'a', directionIndex: 0, name: '+Z' }],
    assigned: { 'profile-1': { rough: 'a', without: { rough: [0] } } },
  }

  test('names a whole reading by its tag, which is what the viewer expands', () => {
    const painted = paintByCut(['wall-1'], features, split, 'rough')

    expect(painted.whole).toEqual(['wall-1'])
    expect(painted.faces).toEqual([])
  })

  test('names a part-cut reading by its faces instead', () => {
    /*
     * The viewer paints a feature by expanding its tag to every region it
     * covers. A reading that gave a face away would light that face too, saying
     * the plan still holds it.
     */
    const painted = paintByCut(['profile-1'], features, split, 'rough')

    expect(painted.whole).toEqual([])
    expect(painted.faces).toEqual([1, 2])
  })

  test('names a reading handed a face by its faces too, tag and all', () => {
    /*
     * The same problem from the other side: the tag expands to what the Engine
     * reported, so a face added by hand was in the plan, in the editor's list,
     * and on none of the paint.
     */
    const handed: SetupPlan = {
      setups: [{ id: 'a', directionIndex: 1, name: '−Z' }],
      assigned: { 'wall-1': { rough: 'a', also: { rough: [2] } } },
    }

    const painted = paintByCut(['wall-1'], features, handed, 'rough')

    expect(painted.whole).toEqual([])
    expect(painted.faces.sort()).toEqual([0, 2])
  })

  test('paints a handed face in the pass that is not cutting it, rather than nothing', () => {
    // A selected reading that lights up nowhere reads as a click that missed.
    const finished: SetupPlan = {
      setups: [{ id: 'a', directionIndex: 1, name: '−Z' }],
      assigned: { 'wall-1': { finish: 'a', also: { finish: [2] } } },
    }

    expect(paintByCut(['wall-1'], features, finished, 'rough').faces.sort()).toEqual([0, 2])
  })

  test('splits a mixed set, so one part-cut reading does not cost the rest their tags', () => {
    const painted = paintByCut(['wall-1', 'profile-1'], features, split, 'rough')

    expect(painted.whole).toEqual(['wall-1'])
    expect(painted.faces).toEqual([1, 2])
  })

  test('keeps the tag for a reading the plan says nothing about', () => {
    // Nothing given up, because nothing is held — the tag is still the truth.
    const painted = paintByCut(['profile-1'], features, EMPTY_PLAN, 'rough')

    expect(painted.whole).toEqual(['profile-1'])
  })

  test('counts each pass on its own', () => {
    // Roughed on two faces and finished on all three is a real state, and the
    // part shows one pass at a time.
    expect(paintByCut(['profile-1'], features, split, 'finish').whole).toEqual(['profile-1'])
  })
})
