/**
 * Which candidate arrows are on the part.
 *
 * Off to begin with: an arrow per way up is most of a small part, and they
 * answer a question nobody has asked yet. **All** is for "which ways up does
 * this thing have", which somebody asks deliberately. **Confirmed** is for the
 * question that replaces it once a plan exists — "which ways up am I actually
 * using" — where the candidates the plan passed over are the clutter.
 *
 * There is no "one arrow" setting. Looking at a feature shows its own arrow by
 * itself whatever this says, and putting the selection down takes it away again
 * — a mode for that would be a mode to remember to leave.
 */
export type Arrows = 'all' | 'confirmed' | 'off'

/**
 * All → Confirmed → Off, and round.
 *
 * In that order because it narrows: every way up the part has, then the ones a
 * plan has claimed, then none. A cycle that widened halfway through would be
 * one nobody could press without watching.
 */
export const nextArrows = (arrows: Arrows): Arrows => {
  if (arrows === 'all') return 'confirmed'
  if (arrows === 'confirmed') return 'off'
  return 'all'
}

export interface ArrowContext {
  /** The reading being read, if any. */
  readonly focusedDirection: number | null
  /** A way up being held, which scopes what a click can mean. */
  readonly activeDirection: number | null
  /** A way up named in a list, to see what it would cut. */
  readonly litDirection: number | null
  /**
   * The ways up the plan holds — setups, not candidates.
   *
   * A setup is there because somebody put work on it, which is the whole
   * difference between this list and the part's own. Empty until a plan exists,
   * and **Confirmed then draws nothing**: that is the honest answer, and the
   * button says so rather than falling back to all of them, which would be the
   * toggle quietly refusing the state it was put in.
   */
  readonly confirmed: readonly number[]
  /**
   * The ways up being **chosen**, while somebody is choosing them.
   *
   * It outranks everything else here, and the toggle with it: the arrows are
   * the only place the choice can be *seen*, so a list of ticks with an
   * unchanged part is a decision being made blind. It is also why turning them
   * off while choosing would be a control refusing the one job it has.
   *
   * `null` when nothing is being chosen, which is nearly always.
   */
  readonly choosing: readonly number[] | null
}

/**
 * Which arrows are drawn: `null` for all of them, an index for one, a list for
 * a set, `-1` for none.
 *
 * Turned all the way on, every way up is the question, so nothing narrows it.
 * Otherwise the most immediate thing anybody has said about a direction wins —
 * one they are holding, then one they have named in a list to see what it would
 * cut, then the one the feature being read is cut from.
 *
 * Naming a way up beats the reading being read because it is the newer question:
 * the reading was opened to look at a feature, and the direction was named
 * afterwards to ask about the direction.
 *
 * **Holding still narrows to one, even on Confirmed.** Choosing a direction is
 * a way of asking about that direction, and the answer is not improved by four
 * other arrows crossing the part.
 */
export function shownArrow(
  arrows: Arrows,
  context: ArrowContext,
): number | readonly number[] | null {
  if (context.choosing !== null) return context.choosing
  if (arrows === 'all') return null
  if (context.activeDirection !== null) return context.activeDirection

  const named = context.litDirection ?? context.focusedDirection
  if (arrows !== 'confirmed') return named ?? -1

  // The plan's ways up, and whatever is being read alongside them. A reading's
  // own direction is part of the answer whether or not the plan has claimed it
  // — dropping it here would make clicking a feature take its arrow away.
  if (named === null || context.confirmed.includes(named)) return context.confirmed
  return [...context.confirmed, named]
}

/**
 * Whether any arrow is drawn.
 *
 * Read off {@link shownArrow} rather than worked out again: the two used to
 * decide it separately, which is two rules to keep in step for one picture.
 */
export function arrowsVisible(arrows: Arrows, context: ArrowContext): boolean {
  const shown = shownArrow(arrows, context)
  if (shown === null) return true
  if (typeof shown === 'number') return shown !== -1
  return shown.length > 0
}

/**
 * Which reading the arrows are drawn for.
 *
 * **The one being edited beats the one being read.** They are not always the
 * same: pressing `Edit Feature` on a row opens that reading's editor whether or
 * not it is the row the datasheet is focused on. The arrow followed the focus,
 * so the part showed the way up of a reading nobody was working on — while
 * every face click was landing on the one that is.
 *
 * A function rather than an expression inside a `useMemo` because the arrow it
 * decides is drawn in the canvas, where no test can reach it. Here it is one
 * line and can be argued with.
 */
export const arrowsFor = <T>(editing: T | null, reading: T | null): T | null => editing ?? reading
