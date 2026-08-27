import type { SelectionState } from './selection'
import { NOTHING_SELECTED } from './selection'

/**
 * What a click on the part means, decided before the click happens.
 *
 * §3.9 of the parity plan. The toggle is always visible rather than behind a
 * menu: how a click will be read is a choice to make *before* clicking, and one
 * hidden until afterwards is one discovered by making the wrong kind.
 */
export type PickMode = 'direction' | 'face'

export interface PickModeState {
  mode: PickMode
  selection: SelectionState
  /** Faces painted into a set, while mapping by direction. */
  painted: ReadonlySet<number>
  /** The way up a painted set would be cut from, held by pressing its arrow. */
  holding: number | null
}

/**
 * By face to begin with, and first in the toggle.
 *
 * By direction cannot be used until a way up is held, and holding one means
 * pressing an arrow — so entering that mode has to put the arrows on screen.
 * Starting there would open the page in a mode that needs a gesture nobody has
 * been offered yet. Which is also why it is not the leftmost button: where the
 * page opens and where the eye lands should be the same place.
 */
export const START: PickModeState = {
  mode: 'face',
  selection: NOTHING_SELECTED,
  painted: new Set(),
  holding: null,
}

/**
 * Switching modes throws away what the other mode was asking.
 *
 * A set painted for one question is not an answer to the other, so the picked
 * faces and the candidates go. Switching back to `face` also lets go of the
 * held direction — holding one is only meaningful while a click paints.
 */
export const switchMode = (state: PickModeState, mode: PickMode): PickModeState => {
  if (mode === state.mode) {
    return state
  }

  return {
    mode,
    selection: NOTHING_SELECTED,
    painted: new Set(),
    holding: mode === 'face' ? null : state.holding,
  }
}

/**
 * Painting a face into the set.
 *
 * Every click adds a face and a click on a painted face takes it off, with **no
 * modifier** — the mode has already said what a click means. Nothing is painted
 * until a direction is held: without one there is no question for the set to be
 * an answer to.
 */
export const paintFace = (state: PickModeState, region: number): PickModeState => {
  if (state.mode !== 'direction' || state.holding === null) {
    return state
  }

  const painted = new Set(state.painted)
  if (painted.has(region)) {
    painted.delete(region)
  } else {
    painted.add(region)
  }

  return { ...state, painted }
}

/**
 * Painting what a click **cuts**, rather than the face under it.
 *
 * With a way up held, a click is not asking about a face — the direction has
 * already been chosen, so the question is what work is there. A feature is one
 * operation over the faces it covers, so the whole reading goes on or comes off
 * together: painting three of a pocket's eight faces describes nothing anybody
 * can run.
 *
 * Which reading a face belongs to is the caller's to work out — it needs the
 * part — and this only records the answer.
 */
export const paintReading = (
  state: PickModeState,
  region: number,
  regions: ReadonlyArray<number>,
): PickModeState => {
  if (state.mode !== 'direction' || state.holding === null) {
    return state
  }
  if (regions.length === 0) {
    return paintFace(state, region)
  }

  const painted = new Set(state.painted)
  // Judged on the face that was clicked: it is the one somebody pointed at, and
  // a reading half in the set would otherwise toggle unpredictably.
  const removing = painted.has(region)

  for (const idx of regions) {
    if (removing) {
      painted.delete(idx)
    } else {
      painted.add(idx)
    }
  }

  return { ...state, painted }
}

/** Pressing an arrow holds that way up; pressing it again lets go. */
export const holdDirection = (state: PickModeState, index: number): PickModeState => {
  if (state.holding === index) {
    return { ...state, holding: null, painted: new Set() }
  }
  return { ...state, holding: index }
}

/** Empty space, or Escape: everything either mode was asking goes. */
export const clearAll = (state: PickModeState): PickModeState => ({
  ...state,
  selection: NOTHING_SELECTED,
  painted: new Set(),
})
