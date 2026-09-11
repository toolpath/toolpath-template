import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { ArrowSquareOutIcon } from '@phosphor-icons/react'
import { Table, cn } from '@toolpath/ui'
import type { Collet, Holder } from '@toolpath/catalog-data'
import type { UnitSystem } from '@toolpath/tool-support'
import { orderedCodes } from 'shared/column-order'
import {
  colletTypeLabel,
  familyLabel,
  formatValue,
  holderTypeLabel,
  valueOf,
  type ComponentColumn,
  type ComponentKind,
} from 'shared/component-columns'
import { askOfComponentColumn } from 'shared/column-filters'
import { setBound, setTerm, setText, type ComponentQuery } from 'shared/component-query'
import { TABLE_FACE, TABLE_HEAD, TABLE_INK } from 'shared/type'
import {
  ColumnFilterMenu,
  ColumnHeading,
  SORT_ICON,
  type ColumnHeadingProps,
} from './column-heading'

/**
 * A rack of holders, or a drawer of collets, read as a table.
 *
 * **The same table the tools get.** Holders were a dropdown behind a tool row —
 * a catalog number and, at best, a reason it might not work — so "which of my
 * BT30 chucks is shortest" and "show me only the REGO-FIX ones" were questions
 * the page had no shape for (Paul, 2026-09-07). Sorting, the column picker and
 * the column order come from the same `@toolpath/ui` Table and the same
 * `column-order` helper the tool list uses, so the three lists behave alike
 * without anybody keeping three implementations in step.
 *
 * It is a sibling of `PartToolTable` rather than a generalisation of it: that
 * table carries the rules' marks, the holding comboboxes and the bill's `on
 * list` badge, all of which are about a *tool*, and threading a row type
 * through them would have put every one of those behind a conditional to gain a
 * shared shell. The columns every component has — number, vendor, family — are
 * fixed here for the same reason they are fixed there.
 */

/**
 * The filters a holder or collet list is narrowed by, all of them in a header.
 *
 * **Every question about a component is a question about a column of it** — a
 * taper, a clamping, a series, a gauge length — so this list has no filter
 * buttons of its own at all: the popover they used to live in said the same
 * words as the headings two inches below it (Paul, 2026-09-08). Which header
 * asks what is `shared/column-filters.ts`, the same rule the tool table reads.
 */
export interface ComponentColumnFiltering {
  readonly query: ComponentQuery
  readonly onQuery: (query: ComponentQuery) => void
  /** What an axis has among the records this list could show, and how many. */
  readonly options: (
    code: string,
  ) => ReadonlyArray<{ readonly value: string; readonly count: number }>
}

export interface ComponentTableProps {
  readonly kind: ComponentKind
  readonly records: ReadonlyArray<Holder | Collet>
  readonly unit: UnitSystem
  readonly columns: ReadonlyArray<ComponentColumn>
  readonly hiddenColumns: ReadonlyArray<string>
  readonly columnOrder: ReadonlyArray<string>
  /** The guid the tree has in this slot, drawn as the selected row. */
  readonly chosen: string | null
  readonly onChoose: (guid: string) => void
  /**
   * The other stacks of this feature already holding this component, by name.
   *
   * **A badge that says where** (Paul, 2026-09-07: "it should say which assembly
   * it is used in rather than just saying 'in the tree'"). A feature answered
   * with a rougher and a finisher, or with a tap and its drill, has more than
   * one stack a holder could be standing in, and "in this tree" named none of
   * them.
   */
  readonly usedIn?: (guid: string) => ReadonlyArray<string>
  /**
   * Whether this is the one already confirmed onto the feature.
   *
   * The row somebody would be backing out to: an unsaved swap has to be
   * recognisable in the list without remembering what was there (Paul,
   * 2026-09-07).
   */
  readonly onFeature?: (guid: string) => boolean
  /**
   * Where this component is already used, on some *other* feature.
   *
   * **A rack says what is already being bought** (Paul, 2026-09-07: "holders and
   * collets should show if they are already in use the same way that tools do …
   * it should note which feature and assembly they are used in"). The rule and
   * the words are `shared/component-usage.ts`; this draws what comes back.
   */
  readonly usedOn?: (guid: string) => { readonly label: string; readonly title: string } | null
  /**
   * Why a row cannot be assembled out of the crib as it stands, in a few words.
   *
   * **A widened rack has to say what it widened** (Paul, 2026-09-09: "we should
   * show any holder, even if there is not a collet in the library that works").
   * The holder list offers chucks no stocked collet closes on, and without this
   * they are the same row as a chuck that grips — `colletGap` in
   * `shared/assembly-narrowing.ts` is the sentence, and this draws it.
   */
  readonly gap?: (guid: string) => string | null
  readonly empty?: ReactNode
  readonly filtering?: ComponentColumnFiltering
  /** Test-only escape hatch for jsdom, where virtual rows cannot measure themselves. */
  readonly virtualized?: boolean
}

/**
 * A record as the table sorts it.
 *
 * **The sort keys have to be fields on the row.** The kit's table sorts by
 * reading `row[sortKey]`, so a row of `{ id, record }` would have sorted the
 * four fixed columns by `undefined` — a header that moves nothing, which reads
 * as a table that does not sort rather than as a bug. The record is spread flat
 * for that, `type` and `familyId` carry the words the cell actually shows, and
 * `record` is kept alongside for the geometry columns to read through
 * {@link valueOf}.
 */
interface Row {
  readonly id: string
  readonly catalogNumber: string
  readonly brand: string
  readonly type: string
  readonly familyId: string
  readonly record: Holder | Collet
}

interface Selection {
  readonly id: string | null
  readonly ids: Array<string>
}

const flexible = (width: string): string => `minmax(${width}, 1fr)`

const columnsShown = (
  columns: ReadonlyArray<ComponentColumn>,
  hidden: ReadonlyArray<string>,
  order: ReadonlyArray<string>,
): ReadonlyArray<ComponentColumn> => {
  const kept = columns.filter((column) => !hidden.includes(column.code))
  return orderedCodes(
    kept.map((column) => column.code),
    order,
  ).flatMap((code) => kept.filter((column) => column.code === code))
}

/** How wide a column starts, by what it holds rather than by its numbers. */
const WIDTH: Readonly<Record<string, string>> = {
  catalogNumber: '10rem',
  brand: '7rem',
  type: '11rem',
  // The holder's Type: `end mill holder` in the default six is two lines of
  // ellipsis.
  clamping: '9rem',
  familyId: '9rem',
}

/** Any column that is only a value: read it, format it, draw it. */
const ValueCell = ({
  kind,
  record,
  column,
  unit,
}: {
  readonly kind: ComponentKind
  readonly record: Holder | Collet
  readonly column: ComponentColumn
  readonly unit: UnitSystem
}) => {
  const value = valueOf(kind, record, column.code)
  return (
    <span
      className={cn('truncate', value === null ? 'text-zinc-600' : '')}
      title={typeof value === 'string' ? value : undefined}
    >
      {formatValue(value, column.kind, unit)}
    </span>
  )
}

const typeLabel = (kind: ComponentKind, record: Holder | Collet): string =>
  kind === 'holder' ? holderTypeLabel(record as Holder) : colletTypeLabel(record as Collet)

export const ComponentTable = ({
  kind,
  records,
  unit,
  columns,
  hiddenColumns,
  columnOrder,
  chosen,
  onChoose,
  usedIn,
  onFeature,
  usedOn,
  gap,
  empty,
  filtering,
  virtualized = true,
}: ComponentTableProps) => {
  const data = useMemo<Array<Row>>(
    () =>
      records.map((record) => ({
        id: record.guid,
        catalogNumber: record.catalogNumber,
        brand: record.brand,
        type: typeLabel(kind, record),
        // The words the cell shows, so sorting by Family and reading the column
        // cannot disagree about what a family is called.
        familyId: familyLabel(record.familyId),
        record,
      })),
    [records, kind],
  )
  const shown = useMemo(
    () => columnsShown(columns, hiddenColumns, columnOrder),
    [columns, hiddenColumns, columnOrder],
  )

  const [selectedRows, setSelectedRows] = useState<Selection>({ id: chosen, ids: [] })
  /** Which column's filter is open, held by the list rather than by the heading. */
  const [openFilter, setOpenFilter] = useState<string | null>(null)
  /** The open column, or nothing where it has since been hidden. */
  const openColumn = shown.find((column) => column.code === openFilter) ?? null
  const inside = useRef<HTMLDivElement>(null)
  /**
   * Whose move the selection was — the same guard `PartToolTable` keeps, and
   * for the same reason: without it the row the tree already holds is reported
   * back as a fresh choice on every render, and the two chase each other.
   */
  const cameFromTable = useRef(false)
  const setSelection = useCallback((next: SetStateAction<Selection>) => {
    setSelectedRows((current) => {
      const resolved = typeof next === 'function' ? next(current) : next
      if (current.id === resolved.id) {
        return current
      }
      cameFromTable.current = true
      return resolved
    })
  }, [])

  useEffect(() => {
    cameFromTable.current = false
    setSelectedRows((current) => (current.id === chosen ? current : { id: chosen, ids: [] }))
  }, [chosen])

  useEffect(() => {
    if (!cameFromTable.current || selectedRows.id === null) {
      return
    }
    cameFromTable.current = false
    if (selectedRows.id !== chosen) {
      onChoose(selectedRows.id)
    }
  }, [selectedRows.id, chosen, onChoose])

  /**
   * One heading, with the two things it can do: sort, and narrow.
   *
   * Which heading asks what is `shared/column-filters.ts`; a heading it says
   * nothing for sorts and offers no funnel.
   */
  const filterProps = (code: string, label: string): ColumnHeadingProps => {
    if (filtering === undefined) {
      return { code, label }
    }
    const ask = askOfComponentColumn(kind, code)
    const axis = ask !== null && ask.shape === 'terms' ? ask.axis : null
    return {
      code,
      label,
      ask,
      unit,
      text: filtering.query.text,
      onText: (text) => filtering.onQuery(setText(filtering.query, text)),
      bound: filtering.query.bounds[code],
      onBound: (bound) => filtering.onQuery(setBound(filtering.query, code, bound)),
      options:
        axis === null
          ? undefined
          : filtering.options(axis).map((option) => ({ ...option, label: option.value })),
      chosen: axis === null ? undefined : (filtering.query.terms[axis] ?? []),
      onChosen:
        axis === null
          ? undefined
          : (values) => filtering.onQuery(setTerm(filtering.query, axis, values)),
    }
  }

  /**
   * Read twice: by the heading, for its funnel, and by the menu this list draws
   * for whichever column is open — `components/column-filter` says why the menu
   * cannot be the heading's.
   */
  const heading = (code: string, label: string): ReactNode => (
    <ColumnHeading
      {...filterProps(code, label)}
      open={openFilter === code}
      onOpen={() => setOpenFilter((current) => (current === code ? null : code))}
    />
  )

  const header = (
    <Table.HeaderRow className={TABLE_HEAD}>
      {shown.map((column) => (
        <Table.HeaderCell
          key={column.code}
          sortKey={column.code}
          sortIcon={SORT_ICON}
          sortFn={(rows) =>
            rows.sort((left, right) => {
              const a = valueOf(kind, (left as Row).record, column.code)
              const b = valueOf(kind, (right as Row).record, column.code)
              // Whatever a vendor did not state sorts last, in either
              // direction: a blank is not a zero and not an empty word.
              if (a === null || b === null) {
                return a === b ? 0 : a === null ? 1 : -1
              }
              if (typeof a === 'number' && typeof b === 'number') {
                return a - b
              }
              return String(a).localeCompare(String(b), 'en', { numeric: true })
            })
          }
          width={flexible(WIDTH[column.code] ?? '6rem')}
        >
          {heading(column.code, column.label)}
        </Table.HeaderCell>
      ))}
    </Table.HeaderRow>
  )

  return (
    <div
      ref={inside}
      data-component-table={kind}
      className={cn(TABLE_FACE, TABLE_INK, 'flex min-h-0 min-w-0 flex-1 flex-col')}
    >
      <div className="min-h-0 flex-1">
        <Table
          id={`part-${kind}s`}
          data={data}
          header={header}
          select
          selectedRows={selectedRows}
          setSelectedRows={setSelection}
          scrollable
          virtualized={virtualized}
          className="min-w-max"
          empty={
            <Table.Empty
              emptyButtonLabel={
                empty ?? `Nothing in the catalog matches every part of this selection.`
              }
            />
          }
        >
          {(row: Row) => {
            const { record } = row
            const elsewhere = usedIn?.(record.guid) ?? []
            const saved = onFeature?.(record.guid) ?? false
            const used = usedOn?.(record.guid) ?? null
            const missing = gap?.(record.guid) ?? null
            return (
              <Table.Row>
                {shown.map((column) => (
                  <Table.Cell
                    key={column.code}
                    className={column.kind === 'length' ? 'justify-end' : 'justify-start'}
                  >
                    {column.code === 'catalogNumber' ? (
                      <>
                        <span>{record.catalogNumber}</span>
                        {/*
                          **The vendor's page is on the number** (Paul,
                          2026-09-11), as it already is on the order list: the
                          catalogue number is what a shop orders by and looks
                          up, so the link belongs beside it rather than a cell
                          away in Vendor.
                        */}
                        {record.productLink === null ? null : (
                          <a
                            href={record.productLink}
                            target="_blank"
                            rel="noreferrer noopener"
                            aria-label={`Open ${record.catalogNumber} at the vendor`}
                            onClick={(event) => event.stopPropagation()}
                            className="text-info ml-1 shrink-0"
                          >
                            <ArrowSquareOutIcon />
                          </a>
                        )}
                        {/*
                          What is on the feature already, so a swap can be
                          backed out of by eye as well as by the Cancel beside
                          the drawing.
                        */}
                        {saved ? (
                          <span className="text-2xs border-info/40 text-info ml-2 rounded border px-1">
                            on the feature
                          </span>
                        ) : null}
                        {elsewhere.length === 0 ? null : (
                          <span
                            className="text-2xs ml-2 rounded border border-emerald-500/40 px-1 text-emerald-300"
                            title={`Standing in ${elsewhere.join(', ')} of this feature`}
                          >
                            in {elsewhere.join(', ')}
                          </span>
                        )}
                        {/*
                          And what it is already bought for elsewhere, named: a
                          rack of five hundred chucks cannot answer "am I
                          already ordering one of these, and for what" from a
                          row that only says *in use*.
                        */}
                        {used === null ? null : (
                          <span
                            className="text-2xs ml-2 rounded border border-zinc-700 px-1 text-zinc-400"
                            title={used.title}
                          >
                            {used.label}
                          </span>
                        )}
                        {/*
                          Said on the row rather than only in the panel: the
                          list is where a holder is chosen, and a chuck with no
                          collet behind it is a decision to make knowingly.
                        */}
                        {missing === null ? null : (
                          <span
                            className="text-2xs ml-2 rounded border border-amber-500/40 px-1 text-amber-300"
                            title={`This holder is offered anyway — ${missing}.`}
                          >
                            no collet
                          </span>
                        )}
                      </>
                    ) : column.code === 'brand' ? (
                      <span className="truncate text-zinc-400" title={record.brand}>
                        {record.brand}
                      </span>
                    ) : (
                      <ValueCell kind={kind} record={record} column={column} unit={unit} />
                    )}
                  </Table.Cell>
                ))}
              </Table.Row>
            )
          }}
        </Table>
      </div>
      {openColumn === null ? null : (
        <ColumnFilterMenu
          {...filterProps(openColumn.code, openColumn.label)}
          anchors={inside}
          onClose={() => setOpenFilter(null)}
        />
      )}
    </div>
  )
}
