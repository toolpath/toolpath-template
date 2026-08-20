/**
 * Whether the candidate arrows are on the part.
 *
 * Off to begin with: an arrow per way up is most of a small part, and they
 * answer a question nobody has asked yet. On is for "which ways up does this
 * thing have", which somebody asks deliberately.
 *
 * There is no "one arrow" setting. Looking at a feature shows its own arrow by
 * itself whatever this says, and putting the selection down takes it away again
 * — a mode for that would be a mode to remember to leave.
 */
export type Arrows = 'all' | 'off'

/** Two states, because there are only two decisions to make. */
export const nextArrows = (arrows: Arrows): Arrows => (arrows === 'all' ? 'off' : 'all')

export interface ArrowContext {
  /** The reading being read, if any. */
  readonly focusedDirection: number | null
  /** A way up being held, which scopes what a click can mean. */
  readonly activeDirection: number | null
}

/**
 * Whether any arrow is drawn.
 *
 * The arrows hang off a question being asked: with nothing selected and the
 * toggle off they are clutter over the geometry, and with something selected
 * the way up it is cut from is part of the answer.
 */
export function arrowsVisible(arrows: Arrows, context: ArrowContext): boolean {
  return arrows === 'all' || context.activeDirection !== null || context.focusedDirection !== null
}

/**
 * Which arrow is drawn: `null` for all of them, an index for one, `-1` for none.
 *
 * Turned on deliberately, every way up is the question, so nothing narrows it.
 * Otherwise the most immediate thing anybody has said about a direction wins —
 * one they are holding, then the one the feature being read is cut from.
 */
export function shownArrow(arrows: Arrows, context: ArrowContext): number | null {
  if (arrows === 'all') return null
  return context.activeDirection ?? context.focusedDirection ?? -1
}
