import { describe, expect, test } from 'vitest'
import { listHighlight } from './highlighting'

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
