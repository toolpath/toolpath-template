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

export function planKey(key: string): PlanKey {
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
export function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  if (!element) return false
  const tag = element.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || element.isContentEditable
}
