import type { Pass } from '../shared/setups'

/**
 * Rough, Finish, Both — on one reading.
 *
 * Three presses rather than a menu, because assigning is the thing this page is
 * for and it should cost one click. The rules they follow are §3.7 of the parity
 * plan:
 *
 * - **R and F are separate claims.** A face roughed from above and finished from
 *   the side is one plan, not a conflict, so neither button moves the other.
 * - **Pressing the pass a reading already holds takes it off.** That is how
 *   somebody unsays a decision, without hunting for an "unassign" anywhere.
 * - **Both is one update, not two.** It hands down a list of passes; two presses
 *   from one snapshot would lose the first, which is a bug the picker shipped.
 */
export const PassButtons = ({
  label,
  rough,
  finish,
  onSetPass,
  blockedBy,
}: {
  /** The way up these would assign to, for the title text. */
  label: string
  /**
   * `'some'` where the reading is cut here on only part of itself — pressed,
   * but not all the way. Its own look and `aria-pressed="mixed"`, because a
   * button that reads fully on is the app claiming more than the plan says.
   */
  rough: boolean | 'some'
  finish: boolean | 'some'
  onSetPass: (passes: ReadonlyArray<Pass>) => void
  /**
   * The settled setup that would refuse a press, asked per button with the
   * passes that button sends.
   *
   * Named rather than a boolean, because the buttons go inert and the only
   * useful thing to say next is *which* lock to open — and a control that
   * refuses without saying why is the half-rule people learn not to trust.
   *
   * Asked per press rather than once for the row, because R and F are separate
   * claims: a setup settled holding the rough of a face has not settled its
   * finish, and shutting F on that row would be the lock claiming ground it
   * never took.
   */
  blockedBy?: (passes: ReadonlyArray<Pass>) => string | null
}) => {
  const base =
    'rounded px-1.5 py-0.5 text-2xs font-bold uppercase tracking-wide transition focus:outline-none focus-visible:ring-1 focus-visible:ring-info'
  const off = 'border border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-200'
  const on = 'border border-info bg-info/25 text-info'
  // Outlined rather than filled: it is on, and it is not finished.
  const part = 'border border-dashed border-info text-info'

  // Shut, and holding nothing: the press is refused on somebody else's behalf.
  const shut = 'cursor-not-allowed border border-zinc-800 text-zinc-600'
  // Shut, but holding this pass. Reason enough not to grey it.
  const stop = 'cursor-not-allowed'

  /*
   * A refused press keeps whatever it is holding.
   *
   * Settled work is exactly the work somebody is reading the row to find out
   * about, and greying its passes to nothing hides it. Only two of these
   * buttons refuse *because they are settled*; the rest refuse on behalf of a
   * lock somewhere else and are genuinely holding nothing, which is what the
   * flat grey is for.
   *
   * So the state decides the colour and the block decides only whether it can
   * be pressed. A locked reading's R and F stay lit, the way the datasheet
   * beside them shows the same claim.
   */
  const look = (state: boolean | 'some', blocked: string | null) => {
    if (state === true) return blocked !== null ? `${on} ${stop}` : on
    if (state === 'some') return blocked !== null ? `${part} ${stop}` : part
    return blocked !== null ? shut : off
  }
  const pressed = (state: boolean | 'some') => (state === 'some' ? 'mixed' : state)

  /*
   * Both reads the two passes, and nothing else.
   *
   * It is lit when both are held whole, dashed when both are held but one of
   * them is cut on only part of the reading, and off otherwise. It briefly
   * showed dashed whenever *either* pass was held, which made roughing alone
   * light a button labelled Both — a third meaning for a control that has two
   * passes to report and no room for a third.
   */
  const both: boolean | 'some' =
    rough === true && finish === true ? true : rough !== false && finish !== false ? 'some' : false

  /*
   * What each button would send, asked of the lock before it is drawn. Both
   * sends the empty list where it would let go, and letting go claims nothing,
   * so a settled setup has no reason to refuse it.
   */
  const bothPasses: ReadonlyArray<Pass> = both === true ? [] : ['rough', 'finish']
  const roughBlocked = blockedBy?.(['rough']) ?? null
  const finishBlocked = blockedBy?.(['finish']) ?? null
  const bothBlocked = blockedBy?.(bothPasses) ?? null

  const says = (state: boolean | 'some', verb: string, blocked: string | null) => {
    if (blocked !== null) return `Settled in ${blocked}. Unlock it to change what it cuts.`
    if (state === 'some') return `${verb} the rest of this reading from ${label}`
    return `${verb} this reading from ${label}`
  }

  return (
    <span className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        aria-pressed={pressed(rough)}
        disabled={roughBlocked !== null}
        title={says(rough, 'Rough', roughBlocked)}
        onClick={() => onSetPass(['rough'])}
        className={`${base} ${look(rough, roughBlocked)}`}
      >
        R
      </button>
      <button
        type="button"
        aria-pressed={pressed(finish)}
        disabled={finishBlocked !== null}
        title={says(finish, 'Finish', finishBlocked)}
        onClick={() => onSetPass(['finish'])}
        className={`${base} ${look(finish, finishBlocked)}`}
      >
        F
      </button>
      <button
        type="button"
        aria-pressed={pressed(both)}
        disabled={bothBlocked !== null}
        title={says(both, 'Rough and finish', bothBlocked)}
        // Only a whole claim lets go. Where either pass is part-cut, this takes
        // the rest back instead — the same two-press shape as R and F.
        onClick={() => onSetPass(bothPasses)}
        className={`${base} ${look(both, bothBlocked)}`}
      >
        Both
      </button>
    </span>
  )
}
