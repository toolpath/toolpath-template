import { focusForPick, type PartPick } from '@toolpath/viewer'
import { holdFace, sharedReadings } from './picks'

/**
 * What the viewport has been asked about, and what is being read because of it.
 *
 * Held apart from the feature list on purpose: a click resolves to five to
 * eight readings, so "what was clicked" and "what is being read" are different
 * questions and answering them with one value is where this goes wrong.
 */
export interface SelectionState {
  /** The faces being held, most recent last. */
  readonly picks: readonly PartPick[]
  /** The readings those faces share, best first. */
  readonly candidates: readonly string[]
  readonly focused: string | null
}

export const NOTHING_SELECTED: SelectionState = { picks: [], candidates: [], focused: null }

/**
 * A click on the part.
 *
 * Plain, it replaces what was held. With a modifier it adds a face, and the
 * candidates narrow to the readings that own every held face — two walls of a
 * pocket resolve to the pocket.
 *
 * Clicking the same face again walks its readings, and walking back onto the
 * one already being read clears the selection. That last rule is deliberately
 * limited to the same face: a click on a *different* face that happens to
 * resolve to the same reading is still a click on something, and clearing there
 * makes a feature that spans two faces impossible to keep selected.
 */
export function pickFace(state: SelectionState, pick: PartPick | null): SelectionState {
  if (!pick) return NOTHING_SELECTED

  const adding = pick.modifiers.meta || pick.modifiers.ctrl
  const held = adding ? holdFace(state.picks, pick) : [pick]
  if (held.length === 0) return NOTHING_SELECTED

  if (held.length > 1) {
    const candidates = sharedReadings(held)
    return { picks: held, candidates, focused: candidates[0] ?? null }
  }

  const previous = state.picks.length === 1 ? (state.picks[0]?.region ?? null) : null
  const focused = focusForPick(pick, previous, state.focused)

  if (previous === pick.region && focused !== null && focused === state.focused) {
    return NOTHING_SELECTED
  }

  return { picks: held, candidates: [...pick.ranked], focused }
}

/** Moves through the candidates with the keyboard, wrapping at both ends. */
export function stepCandidate(state: SelectionState, step: number): SelectionState {
  if (state.candidates.length === 0) return state

  const at = state.focused === null ? -1 : state.candidates.indexOf(state.focused)
  const next = (at + step + state.candidates.length) % state.candidates.length

  return { ...state, focused: state.candidates[next] ?? null }
}

/**
 * Re-reads the faces already held, from a different direction.
 *
 * Pressing an arrow with a face selected is a question about *that face*: which
 * reading covers it from over there. Dropping the selection answered a
 * different question, and left somebody to click the same face again to ask the
 * one they meant.
 *
 * With nothing held there is nothing to re-read, and the direction is simply a
 * scope for the next click.
 */
export function scopeToDirection(
  state: SelectionState,
  reachable: (tag: string) => boolean,
): SelectionState {
  if (state.picks.length === 0) return state

  const candidates = sharedReadings(state.picks).filter(reachable)

  return {
    picks: state.picks,
    candidates,
    // The reading being read survives if that direction can still reach it, so
    // a filter that changes nothing about the answer does not move it either.
    focused:
      state.focused !== null && candidates.includes(state.focused)
        ? state.focused
        : (candidates[0] ?? null),
  }
}

/**
 * Whether anything is being read at all.
 *
 * Escape works outward: it clears the selection first, and only once there is
 * no selection does it give up the direction being worked in. Clearing both at
 * once would throw away the scope somebody set deliberately along with the
 * click they are undoing.
 */
export function isEmptySelection(state: SelectionState): boolean {
  return state.picks.length === 0 && state.candidates.length === 0 && state.focused === null
}

/** The faces being held, for painting them so a second click has something to aim at. */
export function heldRegions(state: SelectionState): number[] {
  return state.picks.map((pick) => pick.region)
}
