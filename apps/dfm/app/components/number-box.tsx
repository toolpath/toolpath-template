import { useState } from 'react'
import type { ReactNode } from 'react'
import { Input } from '@toolpath/ui'

import { bandCss } from '../shared/bands'
import type { Band, Rule } from '../shared/rules'
import { fromDisplay, toDisplay, unitSuffix } from '../shared/rule-text'
import type { Unit } from '../shared/units'

/**
 * Typing a number into this app.
 *
 * Lifted out of `rule-editor` so that anything asking a shop for a measurement
 * gets the same box. What is in here is not styling — it is the behaviour that
 * makes a decimal point reachable at all, and every place that reinvented it
 * reinvented the bug with it.
 */

/** A number somebody has finished typing: digits, optionally signed, one point. */
export const COMPLETE = /^-?(\d+\.?\d*|\.\d+)$/

/**
 * The caption over a control.
 *
 * Every control in a row of limits carries one, and that is what lines the row
 * up: mixing a captioned box with a bare one leaves the two sitting at
 * different heights, and the row reads as a staircase rather than a sentence.
 *
 * One line, always. A caption that wrapped would push its own control down and
 * step the row again, so this truncates instead.
 */
export const Caption = ({ band, children }: { band?: Band | undefined; children: ReactNode }) => (
  <span className="flex items-center gap-1 truncate whitespace-nowrap text-2xs text-ink-muted">
    {band ? (
      <span
        aria-hidden="true"
        className="size-1.5 shrink-0 rounded-full"
        style={{ background: bandCss(band) }}
      />
    ) : null}
    {children}
  </span>
)

/**
 * A number being typed, which is not the same thing as a number.
 *
 * A controlled box that re-renders the parsed value cannot hold what somebody
 * is halfway through typing: `0.` parses to 0 and comes back as "0", taking the
 * point with it, so `0.156` is unreachable — the box eats the keystroke that
 * would have got there. And rounding the value for display fights the same
 * fight, turning `0.156` into `0.2` between one digit and the next.
 *
 * So while a box has focus it shows exactly what was typed, and only the parsed
 * value leaves. On blur the draft is dropped and the stored number comes back
 * formatted, which is where rounding belongs.
 *
 * Three rules keep that honest:
 *
 * - **Only complete numbers leave while typing.** `Number` reads `0.` as 0 and
 *   `.` as nothing, so propagating every parse writes a 0 into the rule between
 *   the point and the digits after it — which recolours the part against a
 *   limit nobody set. A half-typed number is not a change of mind: the stored
 *   one stands until the next digit lands.
 * - **Blur commits what is there.** `5.` is 5 to everybody except a parser, so
 *   leaving the box takes it rather than silently restoring the old number.
 * - **An emptied box is not a zero.** Clearing one is how retyping it starts.
 *   Only a box given `onClear` treats empty as an answer; the rest keep the
 *   stored number, which comes back on blur.
 */
export const NumberBox = ({
  id,
  label,
  band,
  placeholder,
  value,
  metric,
  unit,
  raw = false,
  width = 'w-24',
  onChange,
  onClear,
}: {
  id: string
  label: string
  band?: Band | undefined
  /** What an empty box says, where empty is a real answer. */
  placeholder?: string | undefined
  value: number | undefined
  metric: Rule['metric']
  unit: Unit
  /** Unitless — a weight or a count, which no conversion touches. */
  raw?: boolean
  width?: string
  onChange: (value: number) => void
  /**
   * What an emptied box means, where empty is a real answer. Without it,
   * clearing the box is the first half of retyping it.
   */
  onClear?: (() => void) | undefined
}) => {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = raw ? undefined : metric

  // Four decimals, trailing zeros stripped: enough for a thousandth of an inch
  // with room under it, and never more digits than the number has.
  const settled =
    value === undefined ? '' : String(Number(toDisplay(value, shown, unit).toFixed(raw ? 0 : 4)))

  /**
   * A raw box is a weight or a count and is shown to no decimals, so it rounds
   * on the way in too. Storing 2.5 under a box reading "3" is a number nobody
   * typed and nobody can see.
   */
  const commit = (typed: number) => {
    onChange(raw ? Math.round(typed) : fromDisplay(typed, shown, unit))
  }

  /*
   * The same limit in the other unit, under the box.
   *
   * A shop reads in one unit and buys tooling in the other, and a limit is
   * exactly the number where that matters: 0.125 in is a stock cutter and
   * 3.175 mm is the same cutter, and somebody typing one wants to recognise the
   * other. Read off what is being typed rather than off the stored value, so it
   * keeps up mid-entry.
   *
   * Nothing to say for a weight or a count, and nothing to say while the box is
   * empty or half-typed.
   */
  const typing = (draft ?? settled).trim()
  const other: Unit = unit === 'mm' ? 'in' : 'mm'
  const converted =
    raw || typing === '' || !COMPLETE.test(typing)
      ? null
      : `${toDisplay(fromDisplay(Number(typing), shown, unit), shown, other).toFixed(
          other === 'in' ? 4 : 3,
        )} ${unitSuffix(metric, other)}`

  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      {/* A div rather than a label: the caption names a control that labels
          itself, and two labels on one box is one too many for a screen reader. */}
      <Caption band={band}>{label}</Caption>
      <Input
        aria-label={label}
        className={`${width} tabular-nums`}
        id={id}
        inputMode="decimal"
        name={id}
        placeholder={placeholder}
        size="md"
        suffix={raw ? undefined : unitSuffix(metric, unit)}
        type="text"
        value={draft ?? settled}
        onBlur={() => {
          // `5.` and `.5` are numbers to everybody but a parser, so leaving the
          // box takes what is in it rather than restoring the old number.
          const typed = draft?.trim()
          if (typed && COMPLETE.test(typed)) commit(Number(typed))

          setDraft(null)
        }}
        onChange={(event) => {
          const typed = event.target.value
          setDraft(typed)

          const trimmed = typed.trim()

          if (trimmed === '') {
            onClear?.()
            return
          }

          if (COMPLETE.test(trimmed)) commit(Number(trimmed))
        }}
      />
      {converted === null ? null : (
        <span className="truncate text-2xs tabular-nums text-ink-faint">{converted}</span>
      )}
    </div>
  )
}
