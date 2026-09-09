import { Button, Checkbox, Combobox, IconButton, Input, cn } from '@toolpath/ui'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import {
  CheckIcon,
  DotsSixVerticalIcon,
  FunnelIcon,
  FunnelSimpleIcon,
  PencilSimpleIcon,
  XIcon,
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
 * What a column offers when the number in it no longer matches the geometry's.
 *
 * **The warning belongs on the filter that caused it, and it asks before it
 * acts** (Paul, 2026-09-08: "it should recognize if I enter something to
 * override the rules and warn me to confirm it … when I override a
 * geometry-set filter, it should warn me there").
 *
 * The suggested bound was written from the same `must` rows that go on to judge
 * every tool, so changing it asks for precisely what the rules then remove.
 * That is a decision a shop is entitled to make — a larger cutter than the
 * geometry needs is an ordinary thing to run — and it is not one to make by
 * accident, so the change is what raises the warning and a press is what acts
 * on it. **This column only:** forgiving the diameter says nothing about the
 * flute length, and the count is the tools this column alone is holding back.
 */
export interface ColumnOverride {
  /** What the geometry asked for here, or nothing where it asked nothing. */
  readonly suggested: Bound | undefined
  /** How many tools only this column's rules are keeping off the list. */
  readonly available: number
  readonly on: boolean
  /**
   * Setting this column's rules aside, which the tick is what does.
   *
   * One direction only: the way back out of an override is the number itself —
   * cleared, or typed back to what the geometry asked for — because the number
   * and the forgiveness are one decision (`part.tsx` § `overrideFor`). A press
   * that dropped the forgiveness and left the widened number standing was the
   * dead end this control exists to remove.
   */
  readonly onOverride: () => void
  /** The suggested bound in the words the boxes above are using. */
  readonly say: (bound: Bound) => string
}

/**
 * Whether this column has a number of somebody's own in it.
 *
 * **A filter is somebody's answer the moment it is not the geometry's.** Typing
 * a bound where the geometry suggested one is the case this started from; typing
 * one where it suggested nothing is the same act, and gating on a suggestion
 * meant a column the sheet happens not to bound could never be overruled at all
 * even while its rules were holding tools off the list.
 *
 * So: a bound is set, and it is not simply the suggestion left untouched. With
 * no bound at all there is nothing to overrule — the rules are the only thing
 * narrowing that number, which is the ordinary state of the page.
 */
export const overrideOffered = (
  bound: Bound | undefined,
  override: ColumnOverride | undefined,
): override is ColumnOverride =>
  override !== undefined &&
  compareOf(bound) !== 'any' &&
  !(override.suggested !== undefined && sameBound(bound, override.suggested))

/**
 * The sentence under the boxes: what the geometry asked for, what changing it
 * does not do, and what the tick will do about it.
 *
 * **Quiet** (Paul, 2026-09-08: "the colouring on the messaging should be less
 * dramatic and not yellow"). A shop running a larger cutter than the geometry
 * needs is doing an ordinary thing; an alarm-coloured panel around it said it
 * had done something wrong.
 *
 * **It is the warning, and it is the only thing in the dialog saying this**
 * (Paul, 2026-09-09: "the button shouldn't be a button, it should be a warning,
 * then I confirm if I want to do it by clicking the check"). There was a chip
 * in the chrome beside the tick until then; it said the same thing this
 * sentence says and asked for a second press to do what closing the dialog
 * could just as well have done. So the warning stands alone and names the tick,
 * and `FilterMenu` § `confirm` is the tick doing it.
 */
export const OverrideNotice = ({
  label,
  bound,
  override,
}: {
  readonly label: string
  readonly bound: Bound | undefined
  readonly override: ColumnOverride
}) => {
  const { suggested, available, on, say } = override
  if (!overrideOffered(bound, override)) {
    return null
  }
  const named = label.toLowerCase()
  return (
    <p
      role="note"
      data-column-override
      className="text-2xs mt-2 max-w-64 border-l border-zinc-700 pl-2 leading-snug text-zinc-400"
    >
      {suggested === undefined
        ? `The rules still judge the ${named} whatever this says.`
        : `The geometry asked for ${say(suggested)}. Changing it does not change the rules.`}{' '}
      {available === 0 ? (
        <>Nothing is being held back by the {named} rules alone.</>
      ) : on ? (
        <>
          The {named} rules are set aside: {available} tools they turn down are listed, marked.
          Putting the {named} back to {suggested === undefined ? 'no bound at all' : say(suggested)}{' '}
          takes them off again.
        </>
      ) : (
        <>
          {available} tools only the {named} rules turn down are off this list.{' '}
          <span className="text-zinc-300">Keep this number and list them</span> — the ✓ above — sets
          those rules aside for the {named} alone.
        </>
      )}
    </p>
  )
}

/**
 * The box a column's funnel opens, drawn over the page and away from the table.
 *
 * **A menu inside the table is a menu nobody can read.** The kit's table is a
 * scroll container on both axes, so a box positioned inside a header cell is
 * clipped at the header's own edge — which is why a filter on a header could
 * not be built out of an absolutely positioned `div`. This is a portal, placed
 * against the funnel that opened it and kept inside the window, so a filter on
 * the last column opens leftwards instead of off the screen.
 *
 * **It is rendered by the table, not by the heading** (Paul, 2026-09-08: "the
 * filter options clear immediately when I make a selection … they should stay
 * active until I click outside of them"). A virtualized table hands
 * `react-window` an `innerElementType` it builds inline, so every render of the
 * list reaches React as a new component type and the whole inner tree — the
 * header row with it — is thrown away and built again. A menu held open by a
 * heading therefore closed itself on the press that narrowed the list, which is
 * the one press it exists for: a second vendor could not be ticked, a number
 * could not be typed past its first digit. Nothing about that is fixable from
 * inside a header cell, so what has to survive lives outside one.
 */
export const FilterMenu = ({
  label,
  code,
  anchors,
  align,
  onClose,
  onClear,
  confirm,
  children,
}: {
  readonly label: string
  /** The column, which is how the funnel to measure against is found. */
  readonly code: string
  /** The table this menu belongs to, so two lists' funnels are never confused. */
  readonly anchors: RefObject<HTMLElement | null>
  /** Which edge of the funnel the menu lines up with. */
  readonly align: 'left' | 'right'
  readonly onClose: () => void
  /**
   * Taking this column's whole answer back, where there is one to take.
   *
   * Absent while the column narrows nothing, and absent on a bound the list was
   * swept on: an × over a filter nobody set is an × that does nothing, and a
   * number the part stated is not this menu's to drop.
   */
  readonly onClear?: () => void
  /**
   * What the tick does besides closing, where this filter has something to
   * confirm.
   *
   * **The warning is the warning, and the tick is the answer to it** (Paul,
   * 2026-09-09: "the button shouldn't be a button, it should be a warning, then
   * I confirm if I want to do it by clicking the check"). A press that
   * overruled the rules standing beside a press that closed the dialog made two
   * controls out of one decision — and the one that acted looked optional, so
   * the dialog could be closed on a number whose own list was empty. There is
   * one way out of this dialog, and where a change needs confirming it is what
   * confirms it.
   */
  readonly confirm?: {
    /** What the tick is called while it is confirming, for a screen reader. */
    readonly label: string
    readonly title: string
    readonly onConfirm: () => void
  }
  readonly children: ReactNode
}) => {
  const box = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  useLayoutEffect(() => {
    const place = () => {
      // Found rather than held: the funnel is inside a header the table rebuilds
      // under this menu, so the element measured a moment ago is not the one on
      // screen now.
      const anchor = anchors.current?.querySelector<HTMLElement>(`[data-column-funnel="${code}"]`)
      if (anchor === undefined || anchor === null || anchor.checkVisibility?.() === false) {
        // The column is not on screen any more — taken off by the column
        // picker, or behind whichever list the table switched to. A menu
        // standing over nothing is one nothing can be read back off.
        onClose()
        return
      }
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
  }, [anchors, code, align, onClose])

  useEffect(() => {
    const onDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null
      if (target === null || box.current?.contains(target) === true) {
        return
      }
      // A press on a funnel is that button's own business: it opens its column
      // or closes this one, and closing here first would undo its own press.
      if (target.closest('[data-column-funnel]') !== null) {
        return
      }
      /*
        **A dropdown opened from inside this menu is inside it.** The kit draws
        a `Combobox` popover in a portal of its own, so choosing "≥ at least"
        for a range read as a press on the page and shut the filter before the
        box to type in had been drawn.
      */
      if (target.closest('[data-base-ui-portal]') !== null) {
        return
      }
      onClose()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [onClose])

  // Escape puts it away as well, without going back to find the header.
  useEscape(true, onClose)

  return createPortal(
    <div
      ref={box}
      role="group"
      aria-label={label}
      data-column-filter-menu
      style={{ top: at.top, left: at.left }}
      className="fixed z-50 rounded-lg border border-zinc-800 bg-zinc-950 p-2 shadow-xl"
    >
      {/*
        **Every filter has a way out that is not a guess** (Paul, 2026-09-08: "I
        should have a check box icon to confirm filters on every filter, which
        just closes it saved at the current state"). A filter commits as it is
        typed, so there is nothing left to save — what was missing was somewhere
        to say *done* other than a click on the page, which is the one gesture
        that is indistinguishable from a misclick.
      */}
      <div className="mb-1.5 flex items-center gap-2">
        <p className="text-2xs flex-1 tracking-wide text-zinc-500 uppercase">{label}</p>
        {/*
          **And a way back out that is not a guess either** (Paul, 2026-09-09:
          "can I get an X next to the check mark to clear all filters"). It
          drops everything this column is asking in one press and leaves the
          menu open, because the press after "not that" is usually "this
          instead". Clearing the last of them takes the × away with the
          narrowing it undid.
        */}
        {onClear === undefined ? null : (
          <IconButton
            size="md"
            variant="muted"
            aria-label={`Clear the ${label} filter`}
            title={`Clear the ${label} filter`}
            onClick={onClear}
            className="!size-5 rounded border-0 bg-transparent text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100 [&_svg]:!size-3"
          >
            <XIcon aria-hidden="true" weight="bold" />
          </IconButton>
        )}
        <IconButton
          size="md"
          variant="muted"
          aria-label={confirm === undefined ? `Done filtering by ${label}` : confirm.label}
          title={confirm === undefined ? 'Done — keep this filter and close' : confirm.title}
          onClick={() => {
            confirm?.onConfirm()
            onClose()
          }}
          className="text-info !size-5 rounded border-0 bg-transparent hover:bg-zinc-800 [&_svg]:!size-3"
        >
          <CheckIcon aria-hidden="true" weight="bold" />
        </IconButton>
      </div>
      {children}
    </div>,
    document.body,
  )
}

/**
 * The funnel on a column header, which says whether the column narrows.
 *
 * Always drawn, filled when the column is narrowing the list: a filter nobody
 * can see is a filter nobody can find their way back out of, and the funnel is
 * the whole of the answer to "why is this list so short".
 *
 * Every press inside it is kept off the header, because the header is the sort:
 * a click that both opened the filter and re-sorted the table is one click
 * doing two things nobody asked for.
 *
 * Whether it is open is the **table's** to remember, for the reason
 * `FilterMenu` gives: this button does not outlive one press of itself.
 *
 * **It opens on the press rather than on the click**, for the same reason. A
 * `click` is only fired where the press and the release land on the same
 * element, and the header this button stands in is thrown away and built again
 * whenever the list re-renders — so a press while the matcher was answering
 * released onto a different button and no click was ever fired. The press is
 * the whole gesture; the keyboard has no press, so `detail === 0` — Enter or
 * Space on a focused button — is taken from the click instead.
 */
export const FilterFunnel = ({
  code,
  label,
  set,
  stated = false,
  open,
  onToggle,
}: {
  readonly code: string
  readonly label: string
  readonly set: boolean
  /**
   * Whether this column is narrowed by the part rather than by an answer.
   *
   * **A filter somebody set and a bound the thread set are not the same mark**
   * (Paul, 2026-09-09). A tap's thread diameter and thread length come from the
   * spec and the depth — `column-filters.ts` § `askOfTapColumn` — so they are
   * filled, because the list is genuinely narrowed on them, and grey rather than
   * lit, because there is no number here to type: pressing one says what it is
   * and where it came from.
   *
   * **Grey is not uncounted.** It still counts in `Clear n filters` (Paul,
   * 2026-09-09: "button should show to clear 3 filters not 1 in this
   * situation") — a mark on the table is a narrowing whoever set it, and a
   * figure that skipped these disagreed with the funnels from the other end.
   * Clearing a tap list returns it to what the part says, which is where these
   * two already are.
   */
  readonly stated?: boolean
  readonly open: boolean
  readonly onToggle: () => void
}) => (
  <span
    data-column-funnel={code}
    className="inline-flex items-center"
    onClick={(event) => event.stopPropagation()}
    onMouseDown={(event) => event.stopPropagation()}
    style={{ pointerEvents: 'auto' }}
  >
    <IconButton
      size="md"
      variant="muted"
      aria-label={`Filter by ${label}`}
      aria-expanded={open}
      title={
        stated
          ? `Narrowed by ${label} — set by what is being cut, not by a filter. Press to see why.`
          : set
            ? `Filtered by ${label}`
            : `Filter by ${label}`
      }
      onPointerDown={onToggle}
      onClick={(event) => {
        if (event.detail === 0) {
          onToggle()
        }
      }}
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
        stated
          ? 'rounded p-0.5 text-zinc-400 hover:bg-zinc-800'
          : set
            ? 'text-info rounded p-0.5 hover:bg-zinc-800'
            : 'rounded p-0.5 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300'
      }
    >
      {set ? <FunnelIcon weight="fill" /> : <FunnelSimpleIcon />}
    </IconButton>
  </span>
)

/**
 * Which of a term filter's options a typed word leaves.
 *
 * Substring, case-insensitive, on the words the list shows rather than on the
 * value behind them: a holder's type option reads `BT30 ER11 collet chuck` over
 * a value nobody has ever seen, so matching the value would answer `ER11` with
 * nothing. The value is matched as well, because a vendor's own code is
 * sometimes the only thing shorter than the phrase.
 */
export const optionsMatching = <Option extends { value: string; label: string }>(
  options: ReadonlyArray<Option>,
  search: string,
): ReadonlyArray<Option> => {
  const wanted = search.trim().toLowerCase()
  if (wanted === '') {
    return options
  }
  return options.filter(
    (option) =>
      option.label.toLowerCase().includes(wanted) || option.value.toLowerCase().includes(wanted),
  )
}

/**
 * Narrowing on a set of names rather than on a number.
 *
 * The Vendor and Type columns, and every word a holder or a collet is picked
 * on. Offered as checkboxes over what the list currently holds, with a count
 * beside each, so a value that would empty the list can be told from a rare one
 * before it is pressed. **Several of them, one after another**: the menu is the
 * table's and stays where it is until somebody presses off it.
 *
 * **A list of ticks is unusable once the axis is long** (Paul, 2026-09-08).
 * Family runs to hundreds of values and Type to dozens, so the box at the top
 * narrows the options themselves, and the button beside it ticks every option
 * the box is showing — which is how `HARVI` becomes one filter rather than
 * eleven presses down a scrolling list. Searching is not narrowing: what it
 * hides stays chosen, because a value ticked and then scrolled out of sight by
 * a second word is still a value the shop asked for.
 *
 * **A column can only offer what the list is holding, and that is not always
 * the whole question** (Paul, 2026-09-08: "there is no way to show end mills if
 * I can't find a drill. I should have the option to show endmills in the Type
 * filter, but it does not show up … I should always have a '...' row at the
 * bottom of the recommended filter options to expand any filter to show what
 * it's hiding from the list in any filter that is limited contextually").
 *
 * A threaded hole's list is drills, so the Type column offered `Drill` and
 * nothing else — and a shop that wanted to interpolate the predrill had no way
 * to say so. So the values a list happens to hold are the *recommendation*, and
 * the row under them opens the rest: everything the axis has that this list is
 * not showing, drawn greyed at nought because pressing one is how the question
 * widens. The same rule the filter panel has followed since 2026-09-01 — a
 * value that could return something stays pressable — reaching the values a
 * contextual list never offered at all.
 */
export const TermFilter = ({
  label,
  options,
  chosen,
  onChosen,
  hidden = [],
}: {
  /** The column, which is what the search box says it searches. */
  readonly label: string
  readonly options: ReadonlyArray<{ value: string; label: string; count: number }>
  readonly chosen: ReadonlyArray<string>
  readonly onChosen: (values: ReadonlyArray<string>) => void
  /**
   * What this axis has that the list is not showing — everything the context
   * narrowed away, behind the `…` row.
   */
  readonly hidden?: ReadonlyArray<{ value: string; label: string }>
}) => {
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState(false)
  const rest = optionsMatching(hidden, search).map((option) => ({ ...option, count: 0 }))
  const offList = new Set(hidden.map((option) => option.value))
  const shown = [...optionsMatching(options, search), ...(expanded ? rest : [])]
  const values = shown.map((option) => option.value)
  /** Whether the button takes the shown options back off, which is its words. */
  const all = values.length > 0 && values.every((value) => chosen.includes(value))

  const toggle = (value: string) =>
    onChosen(chosen.includes(value) ? chosen.filter((each) => each !== value) : [...chosen, value])

  const toggleShown = () =>
    onChosen(
      all
        ? chosen.filter((each) => !values.includes(each))
        : [...chosen, ...values.filter((value) => !chosen.includes(value))],
    )

  return (
    <div className="min-w-44">
      {options.length === 0 && hidden.length === 0 ? null : (
        <div className="mb-1.5 flex items-center gap-1.5">
          <Input
            id={`term-filter-search-${label}`.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}
            name="term-filter-search"
            type="search"
            value={search}
            onValueChange={(next) => setSearch(next ?? '')}
            placeholder="Search"
            aria-label={`Search ${label.toLowerCase()} values`}
            variant="ghost"
            size="md"
            className="h-8 w-40 rounded border border-zinc-800 px-2 font-sans text-zinc-100 normal-case"
          />
          <Button
            type="button"
            size="sm"
            variant="muted"
            disabled={shown.length === 0}
            onClick={toggleShown}
            className="text-2xs shrink-0 rounded px-1.5 py-1 whitespace-nowrap normal-case"
          >
            {all ? 'Clear shown' : `Select shown (${shown.length})`}
          </Button>
        </div>
      )}
      <div className="max-h-72 overflow-y-auto">
        {options.length === 0 && hidden.length === 0 ? (
          <p className="text-2xs px-2 py-1.5 text-zinc-600">Nothing to narrow by.</p>
        ) : shown.length === 0 ? (
          <p className="text-2xs px-2 py-1.5 text-zinc-600">Nothing matches that.</p>
        ) : (
          shown.map((option) => {
            /*
              Off the list: a value the context narrowed away, drawn faintly at
              nought. Pressable like any other, because pressing it is how the
              question widens — the filter panel's own rule since 2026-09-01.
            */
            const off = offList.has(option.value)
            return (
              <div
                key={option.value}
                className="text-2xs flex cursor-pointer items-center gap-2 px-2 py-1 whitespace-nowrap normal-case hover:bg-zinc-900"
              >
                <Checkbox
                  name={`term-filter-${option.value}`}
                  checked={chosen.includes(option.value)}
                  onChange={() => toggle(option.value)}
                  size="sm"
                  aria-label={off ? `${option.label} — not on this list` : option.label}
                />
                <span className={off ? 'text-zinc-500' : 'text-zinc-200'}>{option.label}</span>
                <span className="ml-auto pl-3 font-mono tabular-nums text-zinc-600">
                  {option.count}
                </span>
              </div>
            )
          })
        )}
        {rest.length === 0 && !(expanded && hidden.length > 0) ? null : (
          <Button
            type="button"
            size="sm"
            variant="muted"
            data-expand-filter
            onClick={() => setExpanded(!expanded)}
            title={
              expanded
                ? `Offer only the ${label.toLowerCase()} values this list holds.`
                : `Every ${label.toLowerCase()} the catalog has, including what this list is not showing. Choosing one asks for it.`
            }
            className="text-2xs w-full justify-start rounded-none border-0 bg-transparent px-2 py-1.5 text-left whitespace-nowrap text-zinc-500 normal-case hover:bg-zinc-900 hover:text-zinc-300"
          >
            {expanded ? 'Fewer — only what this list holds' : `… ${String(rest.length)} more`}
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * Narrowing on what somebody types.
 *
 * The catalog number, which is the one column a shop arrives at already knowing
 * the answer to. It matches the number and the vendor together, so typing
 * `widia` finds the maker and typing `TDMX` finds the family, and it lives on
 * the column it reads rather than in a search box above a table with a Catalog
 * number heading two inches below it.
 */
export const TextFilter = ({
  label,
  value,
  onValue,
}: {
  readonly label: string
  readonly value: string
  readonly onValue: (value: string) => void
}) => (
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
