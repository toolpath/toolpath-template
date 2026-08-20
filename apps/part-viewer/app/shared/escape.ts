/** What one press of Escape puts down. */
export type EscapeStep = 'selection' | 'expandedType' | 'direction' | null

/**
 * Escape works outward, one thing per press.
 *
 * The order is how recently something was asked for, not how big it is: the
 * click is the newest, the open type is what was being browsed before it, and
 * the direction is a scope somebody set deliberately and would be annoyed to
 * lose while undoing a click. Clearing them all at once throws away two
 * decisions to undo one.
 */
export function escapeStep({
  hasSelection,
  expandedType,
  direction,
}: {
  hasSelection: boolean
  expandedType: string | null
  direction: number | null
}): EscapeStep {
  if (hasSelection) return 'selection'
  if (expandedType !== null) return 'expandedType'
  if (direction !== null) return 'direction'
  return null
}
