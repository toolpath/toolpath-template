/**
 * The one button in the panels.
 *
 * Small, upper case, one line. The panels had four button shapes between them —
 * two-line cards with a name and a note, filled chips, bordered chips at three
 * different paddings — and the effect was that nothing read as belonging with
 * anything else. What a button *does* belongs in its `title`; the panel is a
 * column of controls, and a column reads best when its controls are one shape.
 *
 * A function rather than a component because these are real buttons with real
 * handlers, and wrapping them would put a component between every press and
 * what it does for the sake of a class list.
 */
export interface PanelButtonLook {
  /** Lit, because what it turns on is on. */
  pressed?: boolean
  /**
   * `danger` for the ones that throw work away.
   *
   * Only on hover: a destructive control that is red while resting is the
   * loudest thing on the panel, which is the opposite of what it should be.
   */
  tone?: 'plain' | 'danger'
}

export const panelButtonClass = ({
  pressed = false,
  tone = 'plain',
}: PanelButtonLook = {}): string => {
  const base =
    'rounded border px-2 py-1 text-2xs font-bold uppercase tracking-wider transition disabled:opacity-40'

  if (pressed) return `${base} border-info bg-info/10 text-ink-strong`
  if (tone === 'danger') {
    return `${base} border-edge text-ink-muted enabled:hover:border-danger enabled:hover:text-danger`
  }

  return `${base} border-edge text-ink-muted enabled:hover:border-edge-strong enabled:hover:bg-ground/40 enabled:hover:text-ink-strong`
}

/**
 * The same control, floating on the part.
 *
 * The viewport's shelf carries its own border, so these have none of their own
 * — a bordered chip inside a bordered shelf is two boxes deep. Everything else
 * is the panels' button: the same size, the same weight, the same upper case,
 * and the same blue for on. Before this the bar was `text-xs font-medium` in
 * sentence case, which read as a different application's toolbar sitting on top
 * of this one.
 */
export const barButtonClass = (pressed: boolean, level: 'view' | 'within' = 'view'): string => {
  const base =
    'rounded px-2 py-1 text-2xs font-bold uppercase tracking-wider transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/75'

  /*
   * `within` is a choice **inside** the one to its left.
   *
   * Rough and Finish do not answer *what is the part coloured by* — they answer
   * *which pass do those colours mean*, which only exists once a colouring has
   * been picked. In the same blue as the mode buttons they read as two more
   * modes, so the bar showed five equal choices where there are three and then
   * two. A different wash says the level without saying it in words.
   */
  if (level === 'within') {
    return pressed
      ? `${base} bg-ink/15 text-ink`
      : `${base} text-ink-dim hover:bg-surface hover:text-ink-body`
  }

  return pressed
    ? `${base} bg-info/20 text-info`
    : `${base} text-ink-muted hover:bg-surface hover:text-ink`
}
