/**
 * What a click on the part means, before anything is done about it.
 *
 * Four panels can each claim a click on the model, and which one gets it is
 * decided entirely by what is already on screen. That precedence was a
 * hundred-and-sixty-line ladder of `if` and `return` inside the page component,
 * tangled up with the eight `setState` calls that carry each branch out — so
 * the rule could only be read by reading the effects, and could only be tested
 * by driving a browser.
 *
 * The ladder is the part that is hard and the part that keeps being got wrong.
 * It is here on its own, as a table from *what is open* to *what a press does*,
 * and the page is left applying the answer.
 *
 * **Order is the whole of it.** Every rung below was a bug first:
 *
 * | Drawing   | while a reading is being drawn every click on the part is one of  |
 * |           | its faces — and this sat *inside* the right-click branch, so a    |
 * |           | left click fell through to the ordinary pick and grabbed whole    |
 * |           | features, in the one mode where that is exactly wrong             |
 * | Right     | reads and changes nothing, anywhere, which is what makes the part |
 * |           | safe to interrogate half-way through a decision                   |
 * | Editing   | the face editor is entered and left deliberately, so a click      |
 * |           | inside it is not ambiguous and nothing needs arming               |
 * | Offered   | while an offer stands the part *is* the offer: a face in it comes |
 * |           | out, a face outside it goes in                                    |
 * | Holding   | a way up is chosen, so a click asks what work is there rather     |
 * |           | than which face — the whole reading goes on or comes off          |
 */

/** What a press on the part is asking for. */
export type PartClick =
  /** Add this face to the reading being drawn. */
  | 'draw'
  /** Show this face's row in the editor's list, changing nothing. */
  | 'reveal'
  /** Say what this face is, changing nothing. */
  | 'peek'
  /** Claim it for the reading the face editor is open on. */
  | 'claim'
  /** Take it out of the offer that stands. */
  | 'prune'
  /** Put it into the offer that stands. */
  | 'join'
  /** Paint the whole reading of it, from the way up being held. */
  | 'paint'
  /** Nothing claimed the click: pick the face and open what is worth opening. */
  | 'select'

/**
 * What is on screen when the click lands.
 *
 * Booleans rather than the state itself, so the rule can be read as the table
 * it is. The page works each one out from the state it holds — which reading
 * the editor is open on, what the offer covers — and the answers, not the
 * reasoning, are what the precedence is about.
 */
export interface PartClickState {
  /** A reading is being drawn, and every face clicked joins it. */
  drawing: boolean
  /** The press was the reading button — it may only ever read. */
  secondary: boolean
  /** The face editor is open. */
  editing: boolean
  /** …and this face is one the reading it is open on covers. */
  editingCovers: boolean
  /** An offer stands. */
  offered: boolean
  /** …and this face is in it. */
  offeredHere: boolean
  /** A way up is held, so a click means the reading rather than the face. */
  holding: boolean
}

export const partClick = (state: PartClickState): PartClick => {
  // Before the right-click branch, and that is the whole of it.
  if (state.drawing) {
    return 'draw'
  }

  if (state.secondary) {
    // Inside the editor a read still belongs to the editor: it says which row
    // this face is, rather than which reading owns it.
    return state.editing && state.editingCovers ? 'reveal' : 'peek'
  }

  if (state.editing) {
    return 'claim'
  }

  if (state.offered) {
    return state.offeredHere ? 'prune' : 'join'
  }

  if (state.holding) {
    return 'paint'
  }

  return 'select'
}
