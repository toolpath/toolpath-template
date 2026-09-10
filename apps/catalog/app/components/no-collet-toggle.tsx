import { Button } from '@toolpath/ui'

/**
 * The press that puts the chucks the crib has no collet for on the rack, or
 * takes them off it.
 *
 * **The widening is a decision, not a setting** (Paul, 2026-09-10, asking for
 * this press after the rack was widened on 2026-09-09). Showing every holder
 * whose series could take the shank is the right answer to "what could hold
 * this" and the wrong one to "what can I build this afternoon" — the two
 * questions are a day apart, and a shop asks both. So the rack answers the
 * first by default and this takes it back to the second.
 *
 * **It says which way it goes and how many rows it moves.** A toggle whose
 * label names its state rather than its action leaves somebody working out
 * which of the two they are looking at from the rows, which is the thing they
 * opened the list to find out. The count is the rows this press controls, in
 * both directions, so the number never changes meaning under the mouse.
 *
 * Nothing is drawn where the press would move no rows: a button offering to
 * show none of something is a control about an empty set.
 */
export const NoColletToggle = ({
  count,
  shown,
  onToggle,
}: {
  /** How many offered holders the crib has no closing collet for. */
  readonly count: number
  readonly shown: boolean
  readonly onToggle: () => void
}) => {
  if (count === 0) {
    return null
  }
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      aria-pressed={shown}
      title={
        shown
          ? `${count} of the holders listed cannot be built out of the crib as it stands — each says why on its row. Hiding them leaves only the stacks a collet in the crib closes on.`
          : `${count} more holders could take this shank with a collet the crib does not stock. Showing them puts each one on the list with the reason it cannot be built yet.`
      }
      onClick={onToggle}
      className="rounded border border-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-700"
    >
      {shown ? 'Hide' : 'Show'} {count} with no collet
    </Button>
  )
}
