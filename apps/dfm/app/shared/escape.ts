/** What one press of Escape puts down. */
export type EscapeStep =
  | 'editing'
  | 'selection'
  | 'expandedType'
  | 'direction'
  | 'arrows'
  | 'mode'
  | null

/**
 * Escape works outward, one thing per press.
 *
 * The order is how recently something was asked for, not how big it is: the
 * click is the newest, the open type is what was being browsed before it, and
 * the direction is a scope somebody set deliberately and would be annoyed to
 * lose while undoing a click. Clearing them all at once throws away two
 * decisions to undo one.
 *
 * The editor is innermost of all: it is the only rung that undoes something,
 * because leaving it any way but `Save` is a decision not to keep the work.
 *
 * **It runs all the way out.** The last two rungs put the arrows away and then
 * return to By face, which is where the page opens — so pressing Escape until
 * nothing happens always lands somewhere known, whatever was on screen. Before
 * they existed the ladder stopped one short of the two things a mode leaves
 * behind, and leaving Create meant finding the toolbar.
 */
export const escapeStep = ({
  editing,
  hasSelection,
  expandedType,
  direction,
  arrows,
  mode,
}: {
  /**
   * Whether a feature is being edited.
   *
   * The innermost rung, and the only one that **undoes** rather than puts down:
   * leaving the editor any way but `Save` puts the plan back as it was when it
   * opened. Escape has to mean the same thing as clicking away from it, or a
   * way out that sometimes commits and sometimes does not is one somebody has
   * to remember the rule for — and the whole point of a Save button is not
   * having to.
   */
  editing: boolean
  hasSelection: boolean
  expandedType: string | null
  direction: number | null
  /** Whether any arrow is drawn — the modes put them there, and leave them. */
  arrows: boolean
  /** Whether anything other than By face is showing. */
  mode: boolean
}): EscapeStep => {
  if (editing) {
    return 'editing'
  }
  if (hasSelection) {
    return 'selection'
  }
  if (expandedType !== null) {
    return 'expandedType'
  }
  if (direction !== null) {
    return 'direction'
  }
  if (arrows) {
    return 'arrows'
  }
  if (mode) {
    return 'mode'
  }
  return null
}
