import type { PartPick } from '@toolpath/viewer'
import { describe, expect, it } from 'vitest'
import {
  NOTHING_SELECTED,
  heldRegions,
  isEmptySelection,
  pickFace,
  scopeToDirection,
  stepCandidate,
  focusWithin,
  stepThrough,
} from './selection'

const pick = (region: number, ranked: string[], holding = false): PartPick => ({
  region,
  owners: ranked,
  ranked,
  best: ranked[0] ?? null,
  triangleIndex: region,
  point: [0, 0, 0],
  normal: [0, 0, 1],
  modifiers: { alt: false, ctrl: false, meta: holding, shift: false, secondary: false },
})

const wallA = pick(1, ['pocket', 'wall-a', 'profile'])
const wallB = pick(2, ['pocket', 'wall-b', 'profile'], true)

describe('pickFace', () => {
  it('offers a face’s readings and reads the best of them', () => {
    const state = pickFace(NOTHING_SELECTED, wallA)

    expect(state.candidates).toEqual(['pocket', 'wall-a', 'profile'])
    expect(state.focused).toBe('pocket')
  })

  it('narrows to the readings that own every held face', () => {
    const state = pickFace(pickFace(NOTHING_SELECTED, wallA), wallB)

    // The two walls own one face each and drop out; what is left covers both.
    expect(state.candidates).toEqual(['pocket', 'profile'])
    expect(heldRegions(state)).toEqual([1, 2])
  })

  it('releases a held face when it is clicked again', () => {
    const held = pickFace(pickFace(NOTHING_SELECTED, wallA), wallB)

    expect(heldRegions(pickFace(held, pick(2, ['pocket'], true)))).toEqual([1])
  })

  it('says nothing when held faces share no reading', () => {
    const state = pickFace(pickFace(NOTHING_SELECTED, wallA), pick(9, ['lonely'], true))

    expect(state.candidates).toEqual([])
    expect(state.focused).toBeNull()
  })

  it('walks the readings of one face on repeated clicks', () => {
    const first = pickFace(NOTHING_SELECTED, wallA)
    const second = pickFace(first, wallA)

    expect(first.focused).toBe('pocket')
    expect(second.focused).toBe('wall-a')
  })

  it('clears when a click lands back on the reading already being read', () => {
    let state = pickFace(NOTHING_SELECTED, pick(1, ['only']))
    state = pickFace(state, pick(1, ['only']))

    expect(state).toEqual(NOTHING_SELECTED)
  })

  /**
   * The rule above is limited to the same face on purpose. A feature spans
   * several faces, so clicking a second face of the one being read resolves to
   * the same reading — and clearing there makes it impossible to keep a
   * multi-face feature selected while looking around it.
   */
  it('keeps the selection when another face resolves to the same reading', () => {
    const first = pickFace(NOTHING_SELECTED, pick(1, ['pocket', 'wall-a']))
    const second = pickFace(first, pick(2, ['pocket', 'wall-b']))

    expect(second.focused).toBe('pocket')
    expect(heldRegions(second)).toEqual([2])
  })

  it('clears on a click that hits nothing', () => {
    expect(pickFace(pickFace(NOTHING_SELECTED, wallA), null)).toEqual(NOTHING_SELECTED)
  })
})

describe('scopeToDirection', () => {
  // The same face read two ways: a wall reached from +Z, a face cut from -Y.
  const shared = pick(1, ['pz-wall', 'ny-face', 'pz-profile'])
  const fromPz = (tag: string) => tag.startsWith('pz')
  const fromNy = (tag: string) => tag.startsWith('ny')

  it('re-reads the held face from the new direction', () => {
    const state = scopeToDirection(pickFace(NOTHING_SELECTED, shared), fromNy)

    // Pressing an arrow with a face selected asks which reading covers *that
    // face* from over there — not "put the selection down".
    expect(state.focused).toBe('ny-face')
    expect(state.candidates).toEqual(['ny-face'])
    expect(heldRegions(state)).toEqual([1])
  })

  it('keeps the reading being read when that direction still reaches it', () => {
    const held = pickFace(NOTHING_SELECTED, shared)
    const walked = stepCandidate(held, 2)
    expect(walked.focused).toBe('pz-profile')

    // A filter that changes nothing about the answer should not move it.
    expect(scopeToDirection(walked, fromPz).focused).toBe('pz-profile')
  })

  it('reads nothing when the face cannot be reached that way', () => {
    const state = scopeToDirection(pickFace(NOTHING_SELECTED, shared), () => false)

    // A real answer: nothing here is cut from over there.
    expect(state.candidates).toEqual([])
    expect(state.focused).toBeNull()
  })

  it('leaves an empty selection alone, since a direction is then only a scope', () => {
    expect(scopeToDirection(NOTHING_SELECTED, fromPz)).toEqual(NOTHING_SELECTED)
  })

  /**
   * `ranked` was narrowed by whatever direction was in force when the face was
   * clicked, so re-reading has to start from `owners` or the readings from the
   * new direction would already have been filtered out.
   */
  it('finds readings that the direction at click time had ruled out', () => {
    const scoped: PartPick = { ...shared, ranked: ['pz-wall', 'pz-profile'] }
    const state = scopeToDirection(pickFace(NOTHING_SELECTED, scoped), fromNy)

    expect(state.focused).toBe('ny-face')
  })
})

describe('isEmptySelection', () => {
  it('is true only when nothing is held, offered, or read', () => {
    expect(isEmptySelection(NOTHING_SELECTED)).toBe(true)
    expect(isEmptySelection(pickFace(NOTHING_SELECTED, wallA))).toBe(false)
    // A reading named in the list holds no faces, and is still a selection.
    expect(isEmptySelection({ picks: [], candidates: [], focused: 'pocket', alone: false })).toBe(
      false,
    )
  })
})

describe('stepCandidate', () => {
  it('walks the candidates and wraps at both ends', () => {
    const state = pickFace(NOTHING_SELECTED, wallA)

    expect(stepCandidate(state, 1).focused).toBe('wall-a')
    expect(stepCandidate(stepCandidate(state, -1), 0).focused).toBe('profile')
  })

  it('does nothing when there is nothing to walk', () => {
    expect(stepCandidate(NOTHING_SELECTED, 1)).toEqual(NOTHING_SELECTED)
  })
})

describe('naming a reading from inside the face list', () => {
  it('leaves the picked faces and the list alone', () => {
    // §3.2: an answer to the question the list is already asking, not a new
    // question. Clearing here empties the list a reading was just chosen from.
    const state = {
      picks: [pick(0, ['a', 'b'])],
      candidates: ['a', 'b'],
      focused: 'a',
      alone: false,
    }

    const next = focusWithin(state, 'b')

    expect(next.focused).toBe('b')
    expect(next.candidates).toEqual(['a', 'b'])
    expect(next.picks).toHaveLength(1)
  })

  it('says when a hole was named on its own, so the part lights only that one', () => {
    /*
     * Naming a hole normally names all sixteen. Inside an opened group it does
     * not: that row is the one place somebody has pointed at *this one*, and
     * lighting the other fifteen would be the app ignoring them.
     */
    const state = { picks: [], candidates: [], focused: 'a', alone: false }

    expect(focusWithin(state, 'b').alone).toBe(false)
    expect(focusWithin(state, 'b', true).alone).toBe(true)
  })

  it('lets go of it again the moment a fresh question is asked', () => {
    // A click on the part, or a direction filter, is not about one hole.
    const named = focusWithin(
      { picks: [], candidates: ['a'], focused: 'a', alone: false },
      'a',
      true,
    )

    expect(stepCandidate(named, 1).alone).toBe(false)
  })
})

describe('arrowing through the list as it is displayed', () => {
  const shown = ['a', 'b', 'c']

  it('follows the order on screen, not the order the click produced', () => {
    expect(stepThrough(shown, 'a', 1)).toBe('b')
    expect(stepThrough(shown, 'b', -1)).toBe('a')
  })

  it('wraps at both ends', () => {
    expect(stepThrough(shown, 'c', 1)).toBe('a')
    expect(stepThrough(shown, 'a', -1)).toBe('c')
  })

  it('starts at the top when nothing is being read', () => {
    expect(stepThrough(shown, null, 1)).toBe('a')
  })

  it('starts at the top when what is being read is not in the list', () => {
    // A reading chosen elsewhere is not a position in this list.
    expect(stepThrough(shown, 'gone', 1)).toBe('a')
  })

  it('has nowhere to go in an empty list', () => {
    expect(stepThrough([], null, 1)).toBeNull()
  })
})

describe('clicking the same face again', () => {
  it('walks its readings rather than stopping at the end', () => {
    /*
     * A face has five to eight readings and only one can be on screen, so a
     * second click means "not that one, the next". `pickFace` clears when a walk
     * returns to where it started; the page wraps instead, because the readings
     * are a list somebody is reading down. Escape and empty space are how you
     * put it all down.
     */
    const shown = ['a', 'b', 'c']

    expect(stepThrough(shown, 'a', 1)).toBe('b')
    expect(stepThrough(shown, 'c', 1)).toBe('a')
  })
})
