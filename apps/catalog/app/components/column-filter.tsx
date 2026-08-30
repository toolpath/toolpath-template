import { useEffect, useRef, useState } from 'react'
import { FunnelIcon, FunnelSimpleIcon, PencilSimpleIcon } from '@phosphor-icons/react'
import { convertLength, decimalsFor, MODEL_UNIT, type Unit } from '@toolpath/domain/units'

/**
 * Asking about one number: an operator and a number, or two for a range.
 *
 * **The operator is what somebody chose, not what the bound implies.** The
 * first version derived it from `{ min, max }`, so pressing ≤ with nothing
 * typed yet wrote `{ max: undefined }`, which is `{}`, which read back as
 * "Any" — and the box to type into never appeared. The operator is held here
 * and the bound is written from it, never the other way round.
 *
 * **The box holds what was typed, not what was stored.** A controlled input
 * that re-formats through millimetres on every keystroke turns "1." into
 * "1.000" under the cursor. So each box keeps its own text and commits when
 * the text is a number; the stored value only writes back into a box when it
 * has actually changed — a suggestion, a saved filter, Clear.
 */

export interface Bound {
  readonly min?: number
  readonly max?: number
}

export type Compare = 'any' | 'equals' | 'over' | 'range' | 'under'

/** Counts, angles and ratios are not lengths, and are never converted. */
export type Kind = 'length' | 'count' | 'deg' | 'ratio'

/** The shape a stored bound has, which is where the operator starts from. */
export const compareOf = (bound: Bound | undefined): Compare => {
  if (!bound || (bound.min === undefined && bound.max === undefined)) {
    return 'any'
  }
  if (bound.min !== undefined && bound.max !== undefined) {
    return bound.min === bound.max ? 'equals' : 'range'
  }
  return bound.max === undefined ? 'over' : 'under'
}

const COMPARES: ReadonlyArray<{ value: Compare; label: string }> = [
  { value: 'any', label: 'Any' },
  { value: 'under', label: '≤ at most' },
  { value: 'over', label: '≥ at least' },
  { value: 'equals', label: '= exactly' },
  { value: 'range', label: 'between' },
]

/** A stored value as text in the unit being read in, for a box that has none yet. */
const toDraft = (value: number | undefined, unit: Unit, kind: Kind): string => {
  if (value === undefined) {
    return ''
  }
  if (kind === 'length') {
    return convertLength(value, MODEL_UNIT, unit).toFixed(decimalsFor(unit))
  }
  return String(value)
}

/** What a box's text means in the dataset's own unit, or nothing while it is not a number. */
const parse = (raw: string, unit: Unit, kind: Kind): number | undefined => {
  if (raw.trim() === '') {
    return undefined
  }
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) {
    return undefined
  }
  return kind === 'length' ? convertLength(parsed, unit, MODEL_UNIT) : parsed
}

/** Whether a box already says this value, so its text is left alone. */
const says = (draft: string, value: number | undefined, unit: Unit, kind: Kind): boolean => {
  const meant = parse(draft, unit, kind)
  if (meant === undefined || value === undefined) {
    return meant === value
  }
  return Math.abs(meant - value) < 1e-9
}

const sameEnd = (a: number | undefined, b: number | undefined): boolean =>
  a === undefined || b === undefined ? a === b : Math.abs(a - b) < 1e-9

/** Whether two bounds ask the same thing, allowing for a float's last digit. */
export const sameBound = (a: Bound | undefined, b: Bound | undefined): boolean => {
  if (a === undefined || b === undefined) {
    return a === b
  }
  return sameEnd(a.min, b.min) && sameEnd(a.max, b.max)
}

/** The bound an operator and one or two numbers add up to. */
export const boundFor = (
  compare: Compare,
  one: number | undefined,
  other: number | undefined,
): Bound | undefined => {
  switch (compare) {
    case 'any':
      return undefined
    case 'under':
      return one === undefined ? undefined : { max: one }
    case 'over':
      return one === undefined ? undefined : { min: one }
    case 'equals':
      return one === undefined ? undefined : { min: one, max: one }
    case 'range':
      return one === undefined && other === undefined ? undefined : { min: one, max: other }
  }
}

export interface RangeFilterProps {
  readonly label: string
  readonly bound: Bound | undefined
  readonly onBound: (bound: Bound | undefined) => void
  readonly unit: Unit
  readonly kind: Kind
}

export const RangeFilter = ({ label, bound, onBound, unit, kind }: RangeFilterProps) => {
  const [compare, setCompare] = useState<Compare>(() => compareOf(bound))
  /** The one box, or the lower of two. */
  const [one, setOne] = useState(() =>
    toDraft(compareOf(bound) === 'under' ? bound?.max : bound?.min, unit, kind),
  )
  /** The upper box of a range. */
  const [other, setOther] = useState(() =>
    toDraft(compareOf(bound) === 'range' ? bound?.max : undefined, unit, kind),
  )

  const min = bound?.min
  const max = bound?.max

  /**
   * The stored bound changed under us — a suggestion, a saved filter, Clear.
   *
   * **A bound this component wrote is left exactly as it is.** The test is
   * whether the operator and boxes on screen add up to what is stored; if they
   * do, the store is only echoing them and nothing moves. That is what keeps a
   * half-typed range as a range — `{ min: 3 }` on its own *reads* as ≥, and
   * adopting that shape took the second box away mid-entry — and what keeps the
   * operator when a box is emptied on the way to the next number.
   *
   * Only a bound that could not have come from this screen is adopted: its
   * shape becomes the operator, and its values write into the boxes that do not
   * already say them.
   */
  useEffect(() => {
    const stored = min === undefined && max === undefined ? undefined : { min, max }
    const mine = boundFor(compare, parse(one, unit, kind), parse(other, unit, kind))
    if (sameBound(mine, stored)) {
      return
    }

    const shape = compareOf(stored)
    setCompare(shape)
    if (shape === 'any') {
      setOne('')
      setOther('')
      return
    }
    const lead = shape === 'under' ? max : min
    if (!says(one, lead, unit, kind)) {
      setOne(toDraft(lead, unit, kind))
    }
    const trail = shape === 'range' ? max : undefined
    if (!says(other, trail, unit, kind)) {
      setOther(toDraft(trail, unit, kind))
    }
    // The operator and drafts are read, not depended on: this runs when the
    // *stored* bound moves, and re-running it on every keystroke is the bug it
    // exists to fix.
  }, [min, max])

  const commit = (nextCompare: Compare, nextOne: string, nextOther: string) => {
    setCompare(nextCompare)
    setOne(nextOne)
    setOther(nextOther)
    onBound(boundFor(nextCompare, parse(nextOne, unit, kind), parse(nextOther, unit, kind)))
  }

  const box = (name: string, value: string, onValue: (raw: string) => void) => (
    <input
      type="text"
      inputMode="decimal"
      aria-label={`${label} — ${name}`}
      value={value}
      onChange={(event) => onValue(event.target.value)}
      className="text-2xs w-16 rounded border border-zinc-800 bg-zinc-950 px-1.5 py-1 text-right font-mono text-zinc-100 outline-none focus-visible:border-zinc-600"
    />
  )

  return (
    <div className="flex flex-wrap items-center gap-1">
      <select
        aria-label={`How to compare ${label}`}
        value={compare}
        onChange={(event) => commit(event.target.value as Compare, one, other)}
        className="text-2xs rounded border border-zinc-800 bg-zinc-950 py-1 pr-1 pl-1.5 text-zinc-100 outline-none focus-visible:border-zinc-600"
      >
        {COMPARES.map((each) => (
          <option key={each.value} value={each.value}>
            {each.label}
          </option>
        ))}
      </select>

      {compare === 'any' ? null : (
        <>
          {box(compare === 'range' ? 'from' : 'value', one, (raw) => commit(compare, raw, other))}
          {compare === 'range' ? (
            <>
              <span className="text-2xs text-zinc-600">–</span>
              {box('to', other, (raw) => commit(compare, one, raw))}
            </>
          ) : null}
          {kind === 'length' ? <span className="text-2xs text-zinc-600">{unit}</span> : null}
        </>
      )}
    </div>
  )
}

/**
 * A column header that can be filtered on, opened from the header itself.
 *
 * In the header rather than in a panel above the table, because the question is
 * about *that column*: a filter written somewhere else has to name the thing it
 * narrows, and a filter on the header is already pointing at it.
 */
export const ColumnFilter = ({ label, bound, onBound, unit, kind }: RangeFilterProps) => {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const set = compareOf(bound) !== 'any'

  // A pointer down anywhere else closes it. Without this the only way to put an
  // open column filter away is to press its own header again, which nobody
  // does — they click the next thing.
  useEffect(() => {
    if (!open) {
      return
    }
    const onDown = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  return (
    <div ref={box} className="relative inline-flex items-center justify-end gap-1">
      <span>{label}</span>
      <button
        type="button"
        aria-label={`Filter by ${label}`}
        aria-expanded={open}
        title={set ? `Filtered by ${label}` : `Filter by ${label}`}
        onClick={() => setOpen(!open)}
        className={
          set
            ? 'text-info rounded p-0.5 hover:bg-zinc-800'
            : 'rounded p-0.5 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300'
        }
      >
        {set ? <FunnelIcon weight="fill" /> : <FunnelSimpleIcon />}
      </button>

      {open ? (
        <div className="absolute top-full right-0 z-30 mt-1 rounded-lg border border-zinc-800 bg-zinc-950 p-2 shadow-xl">
          <p className="text-2xs mb-1.5 tracking-wide text-zinc-500 uppercase">{label}</p>
          <RangeFilter label={label} bound={bound} onBound={onBound} unit={unit} kind={kind} />
        </div>
      ) : null}
    </div>
  )
}

/**
 * A column header that filters on a set of names rather than a number.
 *
 * The Type column: the form a tool is, in the library's words. Offered as
 * checkboxes over what the table currently holds, so it narrows a list rather
 * than widening one — widening is the panel's job, which offers every form.
 */
export const TermColumnFilter = ({
  label,
  options,
  chosen,
  onChosen,
}: {
  readonly label: string
  readonly options: ReadonlyArray<{ value: string; label: string; count: number }>
  readonly chosen: ReadonlyArray<string>
  readonly onChosen: (values: ReadonlyArray<string>) => void
}) => {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const set = chosen.length > 0

  useEffect(() => {
    if (!open) {
      return
    }
    const onDown = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  const toggle = (value: string) =>
    onChosen(chosen.includes(value) ? chosen.filter((each) => each !== value) : [...chosen, value])

  return (
    <div ref={box} className="relative inline-flex items-center gap-1">
      <span>{label}</span>
      <button
        type="button"
        aria-label={`Filter by ${label}`}
        aria-expanded={open}
        title={set ? `Filtered by ${label}` : `Filter by ${label}`}
        onClick={() => setOpen(!open)}
        className={
          set
            ? 'text-info rounded p-0.5 hover:bg-zinc-800'
            : 'rounded p-0.5 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300'
        }
      >
        {set ? <FunnelIcon weight="fill" /> : <FunnelSimpleIcon />}
      </button>

      {open ? (
        <div
          role="group"
          aria-label={label}
          className="absolute top-full left-0 z-30 mt-1 min-w-44 rounded-lg border border-zinc-800 bg-zinc-950 py-1 shadow-xl"
        >
          {options.length === 0 ? (
            <p className="text-2xs px-2 py-1.5 text-zinc-600">Nothing to narrow by.</p>
          ) : (
            options.map((option) => (
              <label
                key={option.value}
                className="text-2xs flex cursor-pointer items-center gap-2 px-2 py-1 whitespace-nowrap normal-case hover:bg-zinc-900"
              >
                <input
                  type="checkbox"
                  checked={chosen.includes(option.value)}
                  onChange={() => toggle(option.value)}
                  className="accent-info size-3"
                />
                <span className="text-zinc-200">{option.label}</span>
                <span className="ml-auto pl-3 font-mono tabular-nums text-zinc-600">
                  {option.count}
                </span>
              </label>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

/**
 * Which columns are drawn.
 *
 * A pencil in the corner of the table rather than a control in the header row:
 * a column of its own for the button that edits the columns took real width
 * from every row to hold one icon, and left an empty cell under it on every
 * line of the table.
 */
export const ColumnPicker = ({
  columns,
  shown,
  onToggle,
}: {
  readonly columns: ReadonlyArray<{ code: string; label: string }>
  readonly shown: ReadonlyArray<string>
  readonly onToggle: (code: string) => void
}) => {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    const onDown = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-label="Which columns to show"
        aria-expanded={open}
        title="Which columns to show"
        onClick={() => setOpen(!open)}
        className="rounded p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
      >
        <PencilSimpleIcon />
      </button>
      {open ? (
        <div
          role="group"
          aria-label="Columns"
          className="absolute top-full right-0 z-30 mt-1 rounded-lg border border-zinc-800 bg-zinc-950 py-1 shadow-xl"
        >
          {columns.map((column) => (
            <label
              key={column.code}
              className="text-2xs flex cursor-pointer items-center gap-2 px-2 py-1 whitespace-nowrap hover:bg-zinc-900"
            >
              <input
                type="checkbox"
                checked={shown.includes(column.code)}
                onChange={() => onToggle(column.code)}
                className="accent-info size-3"
              />
              <span className="text-zinc-200">{column.label}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  )
}
