import { NO_MODIFIERS, focusForPick, type PartPick } from '@toolpath/viewer'
import { holdFace, sharedReadings } from './picks.js'

/**
 * What the viewport has been asked about, and what is being read because of it.
 *
 * **Taken from the DFM application so the two agree exactly**, 2026-08-28: a
 * face click means the same thing in both, walks the same way, and narrows the
 * same way. Two implementations of "what did that click select" is two
 * applications disagreeing about one part.
 *
 * Held apart from the feature list on purpose: a click resolves to five to
 * eight readings, so "what was clicked" and "what is being read" are different
 * questions and answering them with one value is where this goes wrong.
 */
export interface SelectionState {
  /** The faces being held, most recent last. */
  readonly picks: ReadonlyArray<PartPick>
  /** The readings those faces share, best first. */
  readonly candidates: ReadonlyArray<string>
  readonly focused: string | null
  /**
   * Whether the reading being read stands for **itself** rather than for the
   * group of identical holes it belongs to.
   *
   * Naming a hole normally names all sixteen — one tool, one operation, and the
   * part lights every one of them. But a group can be opened, and a hole named
   * from inside its own group is the one place somebody has said *this one*.
   * Without this the app would answer that by lighting the fifteen they did not
   * point at.
   */
  readonly alone: boolean
}

export const NOTHING_SELECTED: SelectionState = {
  picks: [],
  candidates: [],
  focused: null,
  alone: false,
}

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
export const pickFace = (
  state: SelectionState,
  pick: PartPick | null,
  /**
   * Which of a fresh pick's readings to open — the easiest of them, by score.
   *
   * A click on a face has five to eight answers and has to open one of them.
   * Ranked by geometry it opened whichever the Engine happened to report first,
   * which is a coin toss; the reading a shop wants first is the one that is
   * least trouble to cut, and the rules already say which that is.
   *
   * Only for a **fresh** pick. Clicking the same face again walks its readings
   * in the order the click ranked them, and re-sorting under a walk would make
   * the second press land somewhere unpredictable.
   */
  prefer?: (tags: ReadonlyArray<string>) => string | null,
): SelectionState => {
  if (!pick) {
    return NOTHING_SELECTED
  }

  const adding = pick.modifiers.meta || pick.modifiers.ctrl
  const held = adding ? holdFace(state.picks, pick) : [pick]
  if (held.length === 0) {
    return NOTHING_SELECTED
  }

  if (held.length > 1) {
    const candidates = sharedReadings(held)
    return {
      picks: held,
      candidates,
      focused: prefer?.(candidates) ?? candidates[0] ?? null,
      alone: false,
    }
  }

  const previous = state.picks.length === 1 ? (state.picks[0]?.region ?? null) : null
  const again = previous === pick.region
  const walked = focusForPick(pick, previous, state.focused)
  const focused = again ? walked : (prefer?.(pick.ranked) ?? walked)

  if (again && focused !== null && focused === state.focused) {
    return NOTHING_SELECTED
  }

  return { picks: held, candidates: [...pick.ranked], focused, alone: false }
}

/**
 * Moves through the candidates with the keyboard, wrapping at both ends.
 *
 * **No longer what the face list arrows through.** It walks `candidates`, which
 * is the order a click produced; the list is drawn grouped by way up, and those
 * two orders differ. {@link stepThrough} takes the drawn order instead. This
 * stays because it is still the honest answer to "next candidate" and is used
 * to set up other tests.
 */
export const stepCandidate = (state: SelectionState, step: number): SelectionState => {
  if (state.candidates.length === 0) {
    return state
  }

  const at = state.focused === null ? -1 : state.candidates.indexOf(state.focused)
  const next = (at + step + state.candidates.length) % state.candidates.length

  return { ...state, focused: state.candidates[next] ?? null, alone: false }
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
export const scopeToDirection = (
  state: SelectionState,
  reachable: (tag: string) => boolean,
): SelectionState => {
  if (state.picks.length === 0) {
    return state
  }

  const candidates = sharedReadings(state.picks).filter(reachable)

  return {
    picks: state.picks,
    candidates,
    alone: false,
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
export const isEmptySelection = (state: SelectionState): boolean =>
  state.picks.length === 0 && state.candidates.length === 0 && state.focused === null

/** The faces being held, for painting them so a second click has something to aim at. */
export const heldRegions = (state: SelectionState): Array<number> =>
  state.picks.map((pick) => pick.region)

/**
 * Naming a reading from **inside** the face list.
 *
 * The rule under §3.2, and the one that has gone wrong twice: naming a feature
 * from a list *about the plan* asks the part a fresh question, so the face list
 * refills — but naming one from inside the face list is an **answer** to the
 * question that list is already asking. The picked faces and the readings they
 * produced stay exactly as they were; only which one is being read changes.
 *
 * Clearing them here empties the list a reading has just been chosen from,
 * which reads as the app throwing the question away the moment it is answered.
 */
export const focusWithin = (
  state: SelectionState,
  featureTag: string,
  /** True only when the row named is one hole inside an opened group. */
  alone = false,
): SelectionState => ({ ...state, focused: featureTag, alone })

/**
 * The next reading in a list, wrapping at both ends.
 *
 * Takes the order **as displayed** rather than the order the click produced.
 * Once the face list is grouped by way up, those two differ — and arrowing
 * through one while looking at the other jumps around the list for no reason
 * anybody watching can see.
 */
export const stepThrough = (
  tags: ReadonlyArray<string>,
  focused: string | null,
  step: number,
): string | null => {
  if (tags.length === 0) {
    return null
  }
  const at = focused === null ? -1 : tags.indexOf(focused)
  return tags[(at + step + tags.length) % tags.length] ?? null
}

/**
 * A pick made from a **list** rather than from the part.
 *
 * The uncut list is a column of faces, and pressing one has to mean what
 * clicking that face on the model means, or the app has two ideas of what
 * selecting a face is. It goes through `pickFace` like any other pick, so it
 * gets the same walking, the same narrowing and the same opened reading.
 *
 * Two things it cannot carry, and does not pretend to: there is no pointer, so
 * `triangleIndex`, `point` and `normal` are the face's own zero, and no camera,
 * so `ranked` is the report's order rather than a ranking by what faces the
 * viewer. A list has no viewpoint to rank from, and inventing one here would be
 * a second answer to a question the part already answers.
 */
export const pickForRegion = (region: number, owners: ReadonlyArray<string>): PartPick => {
  return {
    region,
    owners,
    ranked: owners,
    best: owners[0] ?? null,
    triangleIndex: 0,
    point: [0, 0, 0],
    normal: [0, 0, 0],
    modifiers: NO_MODIFIERS,
  }
}
