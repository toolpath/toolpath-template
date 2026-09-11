import { Table } from '@toolpath/ui'
import type { RefObject } from 'react'
import type { UnitSystem } from '@toolpath/tool-support'
import type { ColumnAsk } from 'shared/column-filters'
import { sayBound } from 'shared/column-filters'
import {
  FilterFunnel,
  FilterMenu,
  OverrideNotice,
  RangeFilter,
  TermFilter,
  TextFilter,
  compareOf,
  overrideOffered,
  type Bound,
  type ColumnOverride,
  type Kind,
} from './column-filter'

/**
 * A column heading: its words, whether it sorts, and the filter it asks.
 *
 * **A header that does nothing looks exactly like a header that does.** The
 * kit draws an arrow only on the column already sorted, so every other heading
 * was a word with no sign that pressing it would do anything — and the filters
 * were behind a button somewhere else entirely (Paul, 2026-09-08: "I don't love
 * how the filters are hidden behind the button, especially with so many also
 * being column headers"). Both marks are on every heading now: the pair of
 * chevrons says the column sorts, the funnel says it narrows.
 *
 * One heading component for the three lists, so a holder's Taper and a tool's
 * Diameter cannot end up wearing different chrome for the same two verbs.
 *
 * **The heading carries the funnel and the table carries the menu.** A
 * virtualized header is rebuilt on every render of the list it stands over —
 * `FilterMenu` says why — so a menu opened from a heading closed itself on the
 * press that narrowed the list. `ColumnHeading` and `ColumnFilterMenu` are the
 * two halves of one control, and a list draws them both.
 */

/** The sorted column's own arrow, the same triangle the kit draws. */
const SortArrow = ({ flipped = false }: { readonly flipped?: boolean }) => (
  <svg
    aria-hidden="true"
    viewBox="0 0 5 3"
    className={
      flipped ? 'size-2 rotate-180 fill-current text-zinc-100' : 'size-2 fill-current text-zinc-100'
    }
  >
    <path d="M0 2.5L2.5 0L5 2.5H0Z" />
  </svg>
)

/** Unsorted: the same triangle twice, faint, saying the column can be sorted. */
const Sortable = () => (
  <svg aria-hidden="true" viewBox="0 0 5 7" className="size-2.5 fill-current text-zinc-600">
    <path d="M0 2.5L2.5 0L5 2.5H0Z" />
    <path d="M0 4.5L2.5 7L5 4.5H0Z" />
  </svg>
)

/**
 * What the kit draws beside a sortable heading.
 *
 * Passed per header cell because the kit's own default is `null` — a table
 * whose sorting is invisible until it is used.
 */
export const SORT_ICON = {
  iconDefault: <Sortable />,
  iconUp: <SortArrow />,
  iconDown: <SortArrow flipped />,
}

export interface ColumnHeadingProps {
  /** The column, which is what a list's open filter is remembered as. */
  readonly code: string
  readonly label: string
  /** What this column narrows on, or nothing where it narrows nothing. */
  readonly ask?: ColumnAsk | null
  readonly unit?: UnitSystem
  readonly bound?: Bound | undefined
  readonly onBound?: (bound: Bound | undefined) => void
  readonly options?: ReadonlyArray<{
    readonly value: string
    readonly label: string
    readonly count: number
  }>
  readonly chosen?: ReadonlyArray<string>
  readonly onChosen?: (values: ReadonlyArray<string>) => void
  readonly text?: string
  readonly onText?: (value: string) => void
  /**
   * What this column offers when its number no longer matches the geometry's.
   *
   * Only a range column has one — a rule is a bound on a number, so a column
   * asking for words has nothing to overrule. `column-filter.tsx`
   * § `OverrideNotice` is the rule and the warning.
   */
  readonly override?: ColumnOverride
  /**
   * What this axis has that the list is not showing, behind the `…` row.
   *
   * Only a column asking for words has any: a range says what it hides with
   * its own two numbers. `column-filter.tsx` § `TermFilter` is the rule.
   */
  readonly hidden?: ReadonlyArray<{ readonly value: string; readonly label: string }>
  /**
   * Where a bound this column cannot be argued with came from.
   *
   * A tap list is **swept** on its thread diameter and its thread length rather
   * than filtered by them (`column-filters.ts` § `askOfTapColumn`), and the near
   * misses a short list falls back to are the rows that break them — so the two
   * numbers are stated with the reason and no boxes. Absent, a range is the
   * ordinary editable one.
   */
  readonly why?: string
}

/**
 * What this column's question resolves to, with the answer's way back.
 *
 * A column asks nothing where its ask is absent, and where the answer has
 * nowhere to go: a tap list is swept out of the catalog rather than filtered,
 * so its headings sort and offer no funnel. Read as one value rather than as a
 * shape beside five optional props, so the menu never has to invent a handler
 * for a control it has already decided to draw.
 */
type Asked =
  | {
      readonly shape: 'range'
      readonly kind: Kind
      readonly unit: UnitSystem
      readonly bound: Bound | undefined
      readonly onBound: (bound: Bound | undefined) => void
    }
  | {
      readonly shape: 'terms'
      readonly options: ReadonlyArray<{ value: string; label: string; count: number }>
      readonly chosen: ReadonlyArray<string>
      readonly onChosen: (values: ReadonlyArray<string>) => void
    }
  | { readonly shape: 'text'; readonly value: string; readonly onValue: (value: string) => void }
  /** A bound the list was swept on: said, with why, and nothing to type into. */
  | {
      readonly shape: 'stated'
      readonly kind: Kind
      readonly unit: UnitSystem
      readonly bound: Bound
      readonly why: string
    }

const asked = ({
  ask,
  unit,
  bound,
  onBound,
  options,
  chosen,
  onChosen,
  text,
  onText,
  why,
}: ColumnHeadingProps): Asked | null => {
  if (ask === undefined || ask === null) {
    return null
  }
  if (ask.shape === 'range') {
    if (unit === undefined) {
      return null
    }
    if (onBound === undefined) {
      return why === undefined || bound === undefined
        ? null
        : { shape: 'stated', kind: ask.kind, unit, bound, why }
    }
    return { shape: 'range', kind: ask.kind, unit, bound, onBound }
  }
  if (ask.shape === 'terms') {
    return onChosen === undefined
      ? null
      : { shape: 'terms', options: options ?? [], chosen: chosen ?? [], onChosen }
  }
  return onText === undefined ? null : { shape: 'text', value: text ?? '', onValue: onText }
}

/** Whether this column is narrowing the list, which is what fills its funnel. */
const narrowing = (what: Asked | null): boolean => {
  switch (what?.shape) {
    case 'range':
      return compareOf(what.bound) !== 'any'
    case 'terms':
      return what.chosen.length > 0
    case 'text':
      return what.value.trim() !== ''
    // A stated bound is always narrowing: it is why the list holds what it holds.
    case 'stated':
      return true
    default:
      return false
  }
}

/**
 * Taking back this column's whole answer, where it has one to take back.
 *
 * `null` where the column narrows nothing — an × over a filter nobody set is
 * an × that does nothing — and `null` on a stated bound, which the part put
 * there and this menu cannot drop. The shape decides what empty means: no
 * bound, no ticks, no word.
 */
const clearing = (what: Asked | null): (() => void) | null => {
  if (what === null || !narrowing(what)) {
    return null
  }
  switch (what.shape) {
    case 'range':
      return () => what.onBound(undefined)
    case 'terms':
      return () => what.onChosen([])
    case 'text':
      return () => what.onValue('')
    default:
      return null
  }
}

export const ColumnHeading = ({
  open = false,
  onOpen,
  ...props
}: ColumnHeadingProps & {
  /** Whether this column's menu is the one the list has open. */
  readonly open?: boolean
  readonly onOpen?: () => void
}) => {
  const what = asked(props)
  return (
    <Table.HeaderCellContent
      accessory={
        // The kit's own seam for a control inside a sortable heading: it takes
        // the press back off the header, which is the sort.
        what === null || onOpen === undefined ? null : (
          <Table.HeaderCellInteractive>
            <FilterFunnel
              code={props.code}
              label={props.label}
              set={narrowing(what)}
              stated={what.shape === 'stated'}
              open={open}
              onToggle={onOpen}
            />
          </Table.HeaderCellInteractive>
        )
      }
    >
      {props.label}
    </Table.HeaderCellContent>
  )
}

/**
 * The open column's filter, drawn by the list rather than by its heading.
 *
 * A range lines up with the right edge of its funnel, because its two boxes are
 * wider than a heading over a number and would otherwise run off the table.
 */
export const ColumnFilterMenu = ({
  anchors,
  onClose,
  ...props
}: ColumnHeadingProps & {
  readonly anchors: RefObject<HTMLElement | null>
  readonly onClose: () => void
}) => {
  const what = asked(props)
  if (what === null) {
    return null
  }
  if (what.shape === 'stated') {
    return (
      <FilterMenu
        label={props.label}
        code={props.code}
        anchors={anchors}
        align="right"
        onClose={onClose}
      >
        <div className="max-w-56 min-w-44 px-2 py-1.5">
          <p className="text-2xs text-zinc-200">
            {props.label} {sayBound(what.kind, what.bound, what.unit)}
          </p>
          <p className="text-2xs mt-1 text-zinc-500">{what.why}</p>
        </div>
      </FilterMenu>
    )
  }
  /*
    **The tick is what overrules the rules** (`column-filter.tsx` §
    `OverrideNotice` says why it is not a chip any more). Offered only where the
    number has left the geometry's, there is something being held back, and the
    rules are not already set aside — a confirmation of what is already true is
    a press with nothing to say, and the way back out of one is the number
    rather than this button (`part.tsx` § `overrideFor`).
  */
  const confirms =
    what.shape === 'range' &&
    overrideOffered(what.bound, props.override) &&
    props.override.available > 0 &&
    !props.override.on
      ? props.override
      : null
  const onClear = clearing(what)
  return (
    <FilterMenu
      label={props.label}
      code={props.code}
      anchors={anchors}
      align={what.shape === 'range' ? 'right' : 'left'}
      onClose={onClose}
      {...(onClear === null ? {} : { onClear })}
      {...(confirms === null
        ? {}
        : {
            confirm: {
              label: `Keep this ${props.label.toLowerCase()} and override its rules`,
              title: `Keep this number and list the ${String(confirms.available)} tools only the ${props.label.toLowerCase()} rules are keeping off this list. They are marked, and so is any assembly one goes into.`,
              onConfirm: () => confirms.onOverride(),
            },
          })}
    >
      {what.shape === 'range' ? (
        <>
          <RangeFilter
            label={props.label}
            bound={what.bound}
            onBound={what.onBound}
            unit={what.unit}
            kind={what.kind}
            /* This filter *is* the dialog somebody just opened, so the caret
               belongs in it rather than behind one more press. */
            opened
          />
          {props.override === undefined ? null : (
            <OverrideNotice label={props.label} bound={what.bound} override={props.override} />
          )}
        </>
      ) : what.shape === 'terms' ? (
        <TermFilter
          label={props.label}
          options={what.options}
          chosen={what.chosen}
          onChosen={what.onChosen}
          {...(props.hidden === undefined ? {} : { hidden: props.hidden })}
        />
      ) : (
        <TextFilter label={props.label} value={what.value} onValue={what.onValue} />
      )}
    </FilterMenu>
  )
}
