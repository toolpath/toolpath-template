import { Table } from '@toolpath/ui'
import type { UnitSystem } from '@toolpath/tool-support'
import type { ColumnAsk } from 'shared/column-filters'
import { ColumnFilter, TermColumnFilter, TextColumnFilter, type Bound } from './column-filter'

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
}

const control = ({
  label,
  ask,
  unit,
  bound,
  onBound,
  options,
  chosen,
  onChosen,
  text,
  onText,
}: ColumnHeadingProps) => {
  if (ask === undefined || ask === null) {
    return null
  }
  if (ask.shape === 'range') {
    return unit === undefined || onBound === undefined ? null : (
      <ColumnFilter label={label} bound={bound} onBound={onBound} unit={unit} kind={ask.kind} />
    )
  }
  if (ask.shape === 'terms') {
    return onChosen === undefined ? null : (
      <TermColumnFilter
        label={label}
        options={options ?? []}
        chosen={chosen ?? []}
        onChosen={onChosen}
      />
    )
  }
  return onText === undefined ? null : (
    <TextColumnFilter label={label} value={text ?? ''} onValue={onText} />
  )
}

export const ColumnHeading = (props: ColumnHeadingProps) => {
  const asked = control(props)
  return (
    <Table.HeaderCellContent
      accessory={
        // The kit's own seam for a control inside a sortable heading: it takes
        // the press back off the header, which is the sort.
        asked === null ? null : <Table.HeaderCellInteractive>{asked}</Table.HeaderCellInteractive>
      }
    >
      {props.label}
    </Table.HeaderCellContent>
  )
}
