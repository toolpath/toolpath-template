import { useEffect, useRef, useState } from 'react'
import {
  UNIT_ABBREVIATION,
  type UnitSystem,
  convertLength,
  decimalsFor,
} from '@toolpath/tool-support'

/**
 * Typing a length into this app.
 *
 * The rules are the DFM application's `number-box` (Justin Gray, 2026-08-27),
 * which every place that reinvented a numeric input reinvented the bug with:
 *
 * - **While the box has focus it shows exactly what was typed.** A controlled
 *   box that re-renders the parsed value cannot hold `0.` — it parses to 0 and
 *   comes back as "0", taking the point with it, so `0.156` is unreachable.
 * - **Only complete numbers leave while typing.** `Number` reads `0.` as 0, so
 *   propagating every parse writes a 0 into the assembly between the point and
 *   the digits after it. A half-typed number is not a change of mind.
 * - **Blur commits what is there.** `5.` is 5 to everybody except a parser.
 * - **An emptied box is not a zero.** Clearing one is how retyping starts; on
 *   blur the stored number comes back.
 *
 * Values are millimetres in and out; the box shows and reads the unit being
 * read in. A `min`/`max`, in millimetres, holds what leaves inside the range.
 */

/** A number somebody has finished typing: digits, optionally a point, no sign — lengths are positive. */
const COMPLETE = /^(\d+\.?\d*|\.\d+)$/

export interface LengthBoxProps {
  readonly id: string
  readonly label: string
  /** In millimetres. */
  readonly value: number
  readonly unit: UnitSystem
  readonly min?: number
  readonly max?: number
  readonly onChange: (millimetres: number) => void
  readonly className?: string
}

const shown = (value: number, unit: UnitSystem): string =>
  convertLength(value, 'millimeters', unit).toFixed(decimalsFor(unit))

export const clampTo = (value: number, min?: number, max?: number): number =>
  Math.min(Math.max(value, min ?? Number.NEGATIVE_INFINITY), max ?? Number.POSITIVE_INFINITY)

export const LengthBox = ({
  id,
  label,
  value,
  unit,
  min,
  max,
  onChange,
  className,
}: LengthBoxProps) => {
  const [draft, setDraft] = useState<string | null>(null)
  const focused = useRef(false)

  // A stored value that moves while the box is not focused is shown as it is.
  // While it is focused the draft stands: every complete keystroke commits and
  // moves the value, and clearing the draft on that would take the point with
  // it — the very bug this box exists to avoid.
  useEffect(() => {
    if (!focused.current) {
      setDraft(null)
    }
  }, [value, unit])

  const commit = (raw: string) => {
    const trimmed = raw.trim()
    if (trimmed === '' || !COMPLETE.test(trimmed)) {
      return false
    }
    const millimetres = convertLength(Number(trimmed), unit, 'millimeters')
    onChange(clampTo(millimetres, min, max))
    return true
  }

  return (
    <label className={className}>
      <span className="text-2xs mr-1.5 text-zinc-500">{label}</span>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        aria-label={label}
        value={draft ?? shown(value, unit)}
        onFocus={() => {
          focused.current = true
          setDraft(shown(value, unit))
        }}
        onChange={(event) => {
          const raw = event.target.value
          setDraft(raw)
          if (COMPLETE.test(raw.trim())) {
            commit(raw)
          }
        }}
        onBlur={(event) => {
          focused.current = false
          commit(event.target.value)
          setDraft(null)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur()
          }
        }}
        className="text-2xs w-16 rounded border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 text-right font-mono text-zinc-100 outline-none focus-visible:border-zinc-600"
      />
      <span className="text-2xs ml-1 text-zinc-600">{UNIT_ABBREVIATION[unit]}</span>
    </label>
  )
}
