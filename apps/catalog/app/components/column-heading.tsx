import { Table } from '@toolpath/ui'
import type { RefObject } from 'react'
import type { UnitSystem } from '@toolpath/tool-support'
import type { ColumnAsk } from 'shared/column-filters'
import {
  FilterFunnel,
  FilterMenu,
  OverrideNotice,
  OverrideToggle,
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
}: ColumnHeadingProps): Asked | null => {
  if (ask === undefined || ask === null) {
    return null
  }
  if (ask.shape === 'range') {
    return unit === undefined || onBound === undefined
      ? null
      : { shape: 'range', kind: ask.kind, unit, bound, onBound }
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
    default:
      return false
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
  /*
    The press sits in the chrome beside the tick rather than under the boxes:
    `column-filter.tsx` § `OverrideToggle` says why. Offered only where the
    number has left the geometry's *and* there is something being held back —
    a press that lists nothing is a press with nothing to say.
  */
  const offered = what.shape === 'range' && overrideOffered(what.bound, props.override)
  return (
    <FilterMenu
      label={props.label}
      code={props.code}
      anchors={anchors}
      align={what.shape === 'range' ? 'right' : 'left'}
      onClose={onClose}
      {...(offered && props.override !== undefined && props.override.available > 0
        ? { action: <OverrideToggle label={props.label} override={props.override} /> }
        : {})}
    >
      {what.shape === 'range' ? (
        <>
          <RangeFilter
            label={props.label}
            bound={what.bound}
            onBound={what.onBound}
            unit={what.unit}
            kind={what.kind}
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
        />
      ) : (
        <TextFilter label={props.label} value={what.value} onValue={what.onValue} />
      )}
    </FilterMenu>
  )
}
