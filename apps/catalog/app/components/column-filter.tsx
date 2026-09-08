import { Checkbox, Combobox, IconButton, Input, cn } from '@toolpath/ui'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  DotsSixVerticalIcon,
  FunnelIcon,
  FunnelSimpleIcon,
  PencilSimpleIcon,
} from '@phosphor-icons/react'
import {
  UNIT_ABBREVIATION,
  type UnitSystem,
  convertLength,
  decimalsFor,
} from '@toolpath/tool-support'
import { movedBy, movedTo } from 'shared/column-order'
import { useEscape } from 'shared/use-escape'
import { CatalogComboboxButton } from './catalog-combobox-button'

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
const toDraft = (value: number | undefined, unit: UnitSystem, kind: Kind): string => {
  if (value === undefined) {
    return ''
  }
  if (kind === 'length') {
    return convertLength(value, 'millimeters', unit).toFixed(decimalsFor(unit))
  }
  return String(value)
}

/** What a box's text means in the dataset's own unit, or nothing while it is not a number. */
const parse = (raw: string, unit: UnitSystem, kind: Kind): number | undefined => {
  if (raw.trim() === '') {
    return undefined
  }
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) {
    return undefined
  }
  return kind === 'length' ? convertLength(parsed, unit, 'millimeters') : parsed
}

/** Whether a box already says this value, so its text is left alone. */
const says = (draft: string, value: number | undefined, unit: UnitSystem, kind: Kind): boolean => {
  const meant = parse(draft, unit, kind)
  if (meant === undefined || value === undefined) {
    return meant === value
  }
  return Math.abs(meant - value) < 1e-9
}

const sameEnd = (a: number | undefined, b: number | undefined): boolean =>
  a === undefined || b === undefined ? a === b : Math.abs(a - b) < 1e-9

/** Whether two bounds ask the same thing, allowing for a float's last digit. */
const sameBound = (a: Bound | undefined, b: Bound | undefined): boolean => {
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
  readonly unit: UnitSystem
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
    <Input
      id={`${label}-${name}`.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}
      name={`range-${name}`}
      type="text"
      inputMode="decimal"
      aria-label={`${label} — ${name}`}
      value={value}
      onValueChange={(next) => onValue(next ?? '')}
      variant="ghost"
      size="md"
      textEnd
      className="inline-flex w-16 rounded border border-zinc-800 px-1.5 py-1 font-mono text-zinc-100 focus-within:border-zinc-600"
    />
  )

  return (
    <div className="flex flex-wrap items-center gap-1">
      <Combobox
        items={COMPARES.map((each) => each.value)}
        value={compare}
        onValueChange={(next) => {
          if (typeof next === 'string') {
            commit(next as Compare, one, other)
          }
        }}
        itemToStringLabel={(value) => COMPARES.find((each) => each.value === value)?.label ?? ''}
        size="md"
        variant="ghost"
      >
        <CatalogComboboxButton label={`How to compare ${label}`} placeholder="Any" />
        <Combobox.Popover>
          <Combobox.List>
            {COMPARES.map((each) => (
              <Combobox.Item key={each.value} value={each.value}>
                {each.label}
                <Combobox.ItemIndicator />
              </Combobox.Item>
            ))}
          </Combobox.List>
        </Combobox.Popover>
      </Combobox>

      {compare === 'any' ? null : (
        <>
          {box(compare === 'range' ? 'from' : 'value', one, (raw) => commit(compare, raw, other))}
          {compare === 'range' ? (
            <>
              <span className="text-2xs text-zinc-600">–</span>
              {box('to', other, (raw) => commit(compare, one, raw))}
            </>
          ) : null}
          {kind === 'length' ? (
            <span className="text-2xs text-zinc-600">{UNIT_ABBREVIATION[unit]}</span>
          ) : null}
        </>
      )}
    </div>
  )
}

/**
 * The popover a column header opens, drawn over the page rather than in the table.
 *
 * **A menu inside the table is a menu nobody can read.** The kit's table is a
 * scroll container on both axes, so a box positioned inside a header cell is
 * clipped at the header's own edge — which is why a filter on a header could
 * not be built out of an absolutely positioned `div` and why the first pair
 * here went unused. This is a portal, placed against the button that opened it
 * and kept inside the window, so a filter on the last column opens leftwards
 * instead of off the screen.
 */
const HeaderMenu = ({
  label,
  anchor,
  align,
  children,
}: {
  readonly label: string
  readonly anchor: HTMLElement | null
  /** Which edge of the button the menu lines up with. */
  readonly align: 'left' | 'right'
  readonly children: ReactNode
}) => {
  const box = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  useLayoutEffect(() => {
    if (anchor === null) {
      return
    }
    const place = () => {
      const button = anchor.getBoundingClientRect()
      const width = box.current?.getBoundingClientRect().width ?? 0
      const wanted = align === 'right' ? button.right - width : button.left
      setAt({
        top: button.bottom + 4,
        left: Math.max(8, Math.min(wanted, window.innerWidth - width - 8)),
      })
    }
    place()
    window.addEventListener('resize', place)
    // Capturing, so the table scrolling under an open menu moves it with the
    // header it belongs to rather than leaving it behind over the rows.
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchor, align])

  return createPortal(
    <div
      ref={box}
      role="group"
      aria-label={label}
      data-column-filter-menu
      style={{ top: at.top, left: at.left }}
      className="fixed z-50 rounded-lg border border-zinc-800 bg-zinc-950 p-2 shadow-xl"
    >
      <p className="text-2xs mb-1.5 tracking-wide text-zinc-500 uppercase">{label}</p>
      {children}
    </div>,
    document.body,
  )
}

/**
 * The funnel on a column header, and what it opens.
 *
 * Always drawn, filled when the column is narrowing the list: a filter nobody
 * can see is a filter nobody can find their way back out of, and the funnel is
 * the whole of the answer to "why is this list so short".
 *
 * Every press inside it is kept off the header, because the header is the sort:
 * a click that both opened the filter and re-sorted the table is one click
 * doing two things nobody asked for.
 */
export const HeaderFilter = ({
  label,
  set,
  align = 'left',
  children,
}: {
  readonly label: string
  readonly set: boolean
  readonly align?: 'left' | 'right'
  readonly children: ReactNode
}) => {
  const [open, setOpen] = useState(false)
  const mine = useRef<HTMLSpanElement>(null)
  const anchor = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (
        !mine.current?.contains(target) &&
        !document.querySelector('[data-column-filter-menu]')?.contains(target)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  // Escape puts it away as well, without going back to find the header.
  useEscape(open, () => setOpen(false))

  return (
    <span
      ref={mine}
      className="inline-flex items-center"
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <span ref={anchor} className="inline-flex" style={{ pointerEvents: 'auto' }}>
        <IconButton
          size="md"
          variant="muted"
          aria-label={`Filter by ${label}`}
          aria-expanded={open}
          title={set ? `Filtered by ${label}` : `Filter by ${label}`}
          onClick={() => setOpen(!open)}
          /*
            **The table turns pointer events off inside a button.** Its own
            stylesheet says `button * { pointer-events: none }` so that a click
            anywhere in a sortable heading counts as a press on the heading —
            which swallowed every press on this funnel, sorting the column
            instead of opening the filter. An inline style is what beats it,
            the same way the kit's own `HeaderCellInteractive` does.
          */
          style={{ pointerEvents: 'auto' }}
          className={
            set
              ? 'text-info rounded p-0.5 hover:bg-zinc-800'
              : 'rounded p-0.5 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300'
          }
        >
          {set ? <FunnelIcon weight="fill" /> : <FunnelSimpleIcon />}
        </IconButton>
      </span>
      {open ? (
        <HeaderMenu label={label} anchor={anchor.current} align={align}>
          {children}
        </HeaderMenu>
      ) : null}
    </span>
  )
}

/**
 * A column header that narrows on its own number.
 *
 * In the header rather than in a panel above the table, because the question is
 * about *that column*: a filter written somewhere else has to name the thing it
 * narrows, and a filter on the header is already pointing at it.
 */
export const ColumnFilter = ({ label, bound, onBound, unit, kind }: RangeFilterProps) => (
  <HeaderFilter label={label} set={compareOf(bound) !== 'any'} align="right">
    <RangeFilter label={label} bound={bound} onBound={onBound} unit={unit} kind={kind} />
  </HeaderFilter>
)

/**
 * A column header that filters on a set of names rather than a number.
 *
 * The Vendor and Type columns, and every word a holder or a collet is picked
 * on. Offered as checkboxes over what the list currently holds, with a count
 * beside each, so a value that would empty the list can be told from a rare one
 * before it is pressed.
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
  const toggle = (value: string) =>
    onChosen(chosen.includes(value) ? chosen.filter((each) => each !== value) : [...chosen, value])

  return (
    <HeaderFilter label={label} set={chosen.length > 0}>
      <div className="max-h-72 min-w-44 overflow-y-auto">
        {options.length === 0 ? (
          <p className="text-2xs px-2 py-1.5 text-zinc-600">Nothing to narrow by.</p>
        ) : (
          options.map((option) => (
            <div
              key={option.value}
              className="text-2xs flex cursor-pointer items-center gap-2 px-2 py-1 whitespace-nowrap normal-case hover:bg-zinc-900"
            >
              <Checkbox
                name={`term-filter-${option.value}`}
                checked={chosen.includes(option.value)}
                onChange={() => toggle(option.value)}
                size="sm"
                aria-label={option.label}
              />
              <span className="text-zinc-200">{option.label}</span>
              <span className="ml-auto pl-3 font-mono tabular-nums text-zinc-600">
                {option.count}
              </span>
            </div>
          ))
        )}
      </div>
    </HeaderFilter>
  )
}

/**
 * A column header that narrows on what somebody types.
 *
 * The catalog number, which is the one column a shop arrives at already knowing
 * the answer to. It matches the number and the vendor together, so typing
 * `widia` finds the maker and typing `TDMX` finds the family, and it lives on
 * the column it reads rather than in a search box above a table with a Catalog
 * number heading two inches below it.
 */
export const TextColumnFilter = ({
  label,
  value,
  onValue,
}: {
  readonly label: string
  readonly value: string
  readonly onValue: (value: string) => void
}) => (
  <HeaderFilter label={label} set={value.trim() !== ''}>
    <Input
      id="column-filter-text"
      name="column-filter-text"
      type="search"
      value={value}
      onValueChange={(next) => onValue(next ?? '')}
      placeholder={label}
      aria-label={`Search by ${label.toLowerCase()}`}
      variant="ghost"
      size="md"
      className="h-8 w-40 rounded border border-zinc-800 px-2 font-sans text-zinc-100 normal-case"
    />
  </HeaderFilter>
)

/**
 * Which columns are drawn, and in what order.
 *
 * A pencil in the corner of the table rather than a control in the header row:
 * a column of its own for the button that edits the columns took real width
 * from every row to hold one icon, and left an empty cell under it on every
 * line of the table.
 *
 * The list is the order — drag a row by the handle to its left and the table's
 * columns move with it (Paul, 2026-08-31). The handle is left of the tick
 * because the tick is the row's own control and dragging must not toggle it;
 * arrow keys on a focused handle do the same thing without a pointer.
 */
export const ColumnPicker = ({
  columns,
  shown,
  onToggle,
  onReorder,
}: {
  /** Every column, in the order the table draws them. */
  readonly columns: ReadonlyArray<{ code: string; label: string }>
  readonly shown: ReadonlyArray<string>
  readonly onToggle: (code: string) => void
  /** The whole order, after a move. Absent, the rows cannot be dragged. */
  readonly onReorder?: (codes: ReadonlyArray<string>) => void
}) => {
  const [open, setOpen] = useState(false)
  const [held, setHeld] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const order = columns.map((column) => column.code)

  const move = (code: string, index: number) => {
    const next = movedTo(order, code, index)
    if (next.join() !== order.join()) {
      onReorder?.(next)
    }
  }

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

  // Escape puts it away as well, without going back to find the header.
  useEscape(open, () => setOpen(false))

  return (
    <div ref={box} className="relative">
      <IconButton
        size="lg"
        variant="muted"
        aria-label="Which columns to show"
        aria-expanded={open}
        title="Which columns to show"
        onClick={() => setOpen(!open)}
        className="rounded p-1 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
      >
        <PencilSimpleIcon />
      </IconButton>
      {open ? (
        <div
          role="group"
          aria-label="Columns"
          className="absolute top-full right-0 z-30 mt-1 rounded-lg border border-zinc-800 bg-zinc-950 py-1 shadow-xl"
        >
          {columns.map((column, at) => (
            <div
              key={column.code}
              // The row is the drop target; the handle is what starts the
              // drag, so a press on the tick still only ticks.
              onDragOver={(event) => {
                if (held !== null) {
                  event.preventDefault()
                }
              }}
              onDrop={(event) => {
                event.preventDefault()
                if (held !== null) {
                  move(held, at)
                  setHeld(null)
                }
              }}
              className={cn(
                'text-2xs flex items-center gap-1.5 px-2 py-1 whitespace-nowrap hover:bg-zinc-900',
                held === column.code && 'opacity-50',
              )}
            >
              {onReorder === undefined ? null : (
                <IconButton
                  size="md"
                  variant="muted"
                  draggable
                  aria-label={`Move ${column.label.toLowerCase()}`}
                  title="Drag to reorder, or use the arrow keys"
                  onDragStart={() => setHeld(column.code)}
                  onDragEnd={() => setHeld(null)}
                  onKeyDown={(event) => {
                    const by = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
                    if (by !== 0) {
                      event.preventDefault()
                      onReorder(movedBy(order, column.code, by))
                    }
                  }}
                  className="focus-visible:ring-info/60 shrink-0 cursor-grab rounded text-zinc-600 transition hover:text-zinc-300 focus-visible:ring-1 focus-visible:outline-none active:cursor-grabbing"
                >
                  <DotsSixVerticalIcon aria-hidden="true" />
                </IconButton>
              )}
              <div className="flex flex-1 cursor-pointer items-center gap-2">
                <Checkbox
                  name={`column-${column.code}`}
                  checked={shown.includes(column.code)}
                  onChange={() => onToggle(column.code)}
                  size="sm"
                  aria-label={column.label}
                />
                <span className="text-zinc-200">{column.label}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
