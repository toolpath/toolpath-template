import type { Pass } from './setups'

/**
 * The keys that act on the reading in hand.
 *
 * Rows 31–33 and 38 of the inventory. R and F are the two passes, A or B are
 * both at once, and X — with Delete and Backspace beside it, because the three
 * mean the same thing to a hand on a keyboard — prunes a reading **from an
 * offer**.
 *
 * Only from an offer. An offer is a suggestion, so throwing part of it away
 * costs nothing; a reading a direction is cutting is a decision somebody made,
 * and a key that quietly unmakes one is a plan that changes when a hand brushes
 * the keyboard.
 *
 * **Only where there is something to assign to.** Elsewhere R is a letter: the
 * rules page has a search box and a key that silently rewrites a plan from
 * another page is worse than no shortcut at all. That guard belongs to the
 * caller, which knows what is on screen; this only says what a key means.
 */
export type PlanKey = { act: 'pass'; passes: ReadonlyArray<Pass> } | { act: 'remove' } | null

export const planKey = (key: string): PlanKey => {
  switch (key.toLowerCase()) {
    case 'r':
      return { act: 'pass', passes: ['rough'] }
    case 'f':
      return { act: 'pass', passes: ['finish'] }
    // A for "all", B for "both" — people reach for either, and neither is
    // worth being the one that does nothing.
    case 'a':
    case 'b':
      return { act: 'pass', passes: ['rough', 'finish'] }
    case 'x':
    case 'delete':
    case 'backspace':
      return { act: 'remove' }
    default:
      return null
  }
}

/**
 * Whether a keystroke is somebody typing rather than acting.
 *
 * A shortcut that fires while a name is being typed is a plan rewritten by
 * somebody spelling a word.
 */
export const isTyping = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null
  if (!element) {
    return false
  }
  const tag = element.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || element.isContentEditable
}

/**
 * What a keystroke at the window means, before anything is done about it.
 *
 * The routing rather than the meaning: `escapeStep` already says what Escape
 * puts down and `planKey` what R, F and X ask for, but *which of them a press
 * is* was a hundred and seventy lines of `if` and `return` inside the page's
 * one `useEffect`, interleaved with the eleven `setState` calls that carry each
 * answer out. There was no way to ask what a key did without a browser.
 *
 * Order is the whole of it, and each rung was got wrong once:
 *
 * | typing    | a shortcut that fires while a name is being typed is a plan   |
 * |           | rewritten by somebody spelling a word                         |
 * | escape    | works outward one rung per press — see `escapeStep`            |
 * | arrows    | Z has its own key because the arrows are how a way up is held  |
 * | plan      | R, F, X act on the row under the keyboard, wherever it is      |
 * | step      | and arrowing through the readings only applies **outside** a   |
 * |           | list, because a list under the keyboard walks itself           |
 */
export type KeyIntent =
  | { act: 'escape' }
  | { act: 'arrows' }
  | { act: 'plan'; plan: NonNullable<PlanKey> }
  | { act: 'step'; by: 1 | -1 }
  | null

export const keyIntent = ({
  key,
  typing,
  inList,
}: {
  key: string
  /** Whether the press landed in a text field. */
  typing: boolean
  /**
   * Whether focus is inside a list that walks itself.
   *
   * Only the last rung asks: the keys above act on the row under the keyboard,
   * which is usually *inside* one of those lists — guarding all of them is why
   * they did nothing at all.
   */
  inList: boolean
}): KeyIntent => {
  if (typing) {
    return null
  }

  if (key === 'Escape') {
    return { act: 'escape' }
  }

  /*
   * Z shows every arrow, or puts them all away.
   *
   * Its own key because the arrows are how a way up is held, and reaching for
   * the toolbar to find one is a gesture away from the part. Not in `planKey`
   * — that is about the reading in hand, and this is about the whole part.
   */
  if (key.toLowerCase() === 'z') {
    return { act: 'arrows' }
  }

  const plan = planKey(key)
  if (plan) {
    return { act: 'plan', plan }
  }

  if (inList) {
    return null
  }

  if (key === 'ArrowDown') {
    return { act: 'step', by: 1 }
  }
  if (key === 'ArrowUp') {
    return { act: 'step', by: -1 }
  }

  return null
}
