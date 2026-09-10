/**
 * What the column over the part shows, given what the box in it is doing.
 *
 * The three presses, the box and the order list stand in one column over the
 * viewer (Paul, 2026-09-10), and every one of them can be in the way of the
 * part. Which of them is drawn is two sentences somebody can be wrong about, so
 * they live here rather than as conditions inline in `routes/part.tsx` — the
 * same reason `part-interaction.ts` exists.
 */

/** What the box over the part is doing, as the two rules below need it. */
export interface BoxState {
  /** Whether the box is on screen at all — a group being built, a reading, a stack. */
  readonly open: boolean
  /**
   * Whether it holds something somebody is building or working on, rather than
   * a face they have merely clicked.
   *
   * A draft — a group, a tool assembly, a feature being kept — or a row of the
   * order list selected. A preview is neither: it is the part answering a
   * click, and nothing has been decided about it yet.
   */
  readonly building: boolean
  /** Whether the order list has been unfolded under the box by hand. */
  readonly unfolded: boolean
}

/**
 * Whether _+ Feature_, _+ Group_ and _+ Tool Assembly_ are on screen.
 *
 * **They go while something is being built** (Paul, 2026-09-10: "we should hide
 * the + buttons while the dialog is active as well — the dialog is the action,
 * and having the + floating there encourages people to click it"). A box open
 * over the part is one question being answered, and three presses hovering
 * above it are three ways to abandon it by accident.
 *
 * **They stay over a preview**, which is the one state that looks like the same
 * thing and is not: a click on the part opens the box on a face nobody has kept
 * yet, and the presses are what keeps it — _+ Feature_ takes the reading,
 * _+ Group_ seeds a group with it. Hiding them there would leave a clicked face
 * with no way to become a group at all.
 *
 * They also stay while _+ Feature_ is waiting for a face, where the prompt under
 * them names the very button it would be hiding.
 */
export const pressesShown = (box: BoxState): boolean => !box.open || !box.building

/**
 * Whether the order list's rows are drawn.
 *
 * **The box folds them away** (Paul, 2026-09-10: "when a dialog is active, fold
 * up the order list. Provide a button to be able to expand it underneath the
 * open feature, group, or tool assembly dialog if desired"). One column
 * carrying both covers the part from the top of the viewer to the bottom, and
 * the question being asked is what somebody is looking at.
 *
 * `unfolded` is the press under the box, and it is not remembered past the box
 * closing: the next thing asked starts the way this one did.
 */
export const rowsShown = (box: BoxState): boolean => !box.open || box.unfolded

/**
 * Whether _+ Tool Assembly_ can be pressed, out of the three that are drawn.
 *
 * **Greyed over a reading** (Paul, 2026-09-10: "+ tool assembly should be greyed
 * out when I click on a feature"). A tool assembly answers no feature — it is
 * the row kind that exists for the facing mill nobody's part asked for — so
 * pressing it with a face clicked throws that click away without a word, and the
 * page comes back on a stack that has nothing to do with what was on screen.
 *
 * The other two are what a clicked face is *for*: _+ Feature_ keeps the reading
 * and _+ Group_ seeds a group with it. This one has nothing to do with it, so it
 * waits until the reading is put down.
 *
 * `open` rather than `building`, because the states where the presses are drawn
 * at all are exactly two — nothing on screen, and a face somebody has clicked —
 * and the difference between them is whether the box is open. _+ Feature_
 * waiting for a face opens no box, so it is still a change of mind that can be
 * made.
 */
export const assemblyPressEnabled = (box: BoxState): boolean => !box.open
