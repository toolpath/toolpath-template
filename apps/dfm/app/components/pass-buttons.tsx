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
  settled = null,
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
   * The setup that has settled this reading, if one has.
   *
   * Named rather than a boolean, because the buttons go inert and the only
   * useful thing to say next is *which* lock to open — and a control that
   * refuses without saying why is the half-rule people learn not to trust.
   */
  settled?: string | null
}) => {
  const base =
    'rounded px-1.5 py-0.5 text-2xs font-bold uppercase tracking-wide transition focus:outline-none focus-visible:ring-1 focus-visible:ring-info'
  const off = 'border border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-200'
  const on = 'border border-info bg-info/25 text-info'
  // Outlined rather than filled: it is on, and it is not finished.
  const part = 'border border-dashed border-info text-info'

  // Settled: still legible, plainly not pressable. Greying it to nothing would
  // hide which passes the settled setup actually holds, which is the thing
  // somebody is looking at the row to find out.
  const shut = 'cursor-not-allowed border border-zinc-800 text-zinc-600'

  const look = (state: boolean | 'some') => {
    if (settled) return state === false ? shut : `${shut} bg-zinc-800/40`
    if (state === true) return on
    if (state === 'some') return part
    return off
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

  const says = (state: boolean | 'some', verb: string) => {
    if (settled) return `Settled in ${settled}. Unlock it to change what it cuts.`
    if (state === 'some') return `${verb} the rest of this reading from ${label}`
    return `${verb} this reading from ${label}`
  }

  return (
    <span className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        aria-pressed={pressed(rough)}
        disabled={settled !== null && settled !== undefined}
        title={says(rough, 'Rough')}
        onClick={() => onSetPass(['rough'])}
        className={`${base} ${look(rough)}`}
      >
        R
      </button>
      <button
        type="button"
        aria-pressed={pressed(finish)}
        disabled={settled !== null && settled !== undefined}
        title={says(finish, 'Finish')}
        onClick={() => onSetPass(['finish'])}
        className={`${base} ${look(finish)}`}
      >
        F
      </button>
      <button
        type="button"
        aria-pressed={pressed(both)}
        disabled={settled !== null && settled !== undefined}
        title={says(both, 'Rough and finish')}
        // Only a whole claim lets go. Where either pass is part-cut, this takes
        // the rest back instead — the same two-press shape as R and F.
        onClick={() => onSetPass(both === true ? [] : ['rough', 'finish'])}
        className={`${base} ${look(both)}`}
      >
        Both
      </button>
    </span>
  )
}
