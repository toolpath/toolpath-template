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
 * shared shell. The four columns every component has — number, vendor, type,
 * family — are fixed here for the same reason they are fixed there.
 */

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
  readonly empty?: ReactNode
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
  empty,
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

  const header = (
    <Table.HeaderRow>
      <Table.HeaderCell sortKey="catalogNumber" width={flexible('10rem')}>
        Catalog number
      </Table.HeaderCell>
      <Table.HeaderCell sortKey="brand" width={flexible('7rem')}>
        Vendor
      </Table.HeaderCell>
      <Table.HeaderCell sortKey="type" width={flexible('11rem')}>
        Type
      </Table.HeaderCell>
      <Table.HeaderCell sortKey="familyId" width={flexible('9rem')}>
        Family
      </Table.HeaderCell>
      {shown.map((column) => (
        <Table.HeaderCell
          key={column.code}
          sortKey={column.code}
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
          width={flexible('6rem')}
        >
          {column.label}
        </Table.HeaderCell>
      ))}
    </Table.HeaderRow>
  )

  return (
    <div data-component-table={kind} className="flex min-h-0 min-w-0 flex-1 flex-col">
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
            return (
              <Table.Row>
                <Table.Cell>
                  <span className="font-mono text-zinc-100">{record.catalogNumber}</span>
                  {/*
                    What is on the feature already, so a swap can be backed out
                    of by eye as well as by the Cancel beside the drawing.
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
                </Table.Cell>
                <Table.Cell>
                  <span className="flex min-w-0 items-center gap-1">
                    <span className="truncate text-zinc-400" title={record.brand}>
                      {record.brand}
                    </span>
                    {record.productLink === null ? null : (
                      <a
                        href={record.productLink}
                        target="_blank"
                        rel="noreferrer noopener"
                        aria-label={`Open ${record.catalogNumber} at the vendor`}
                        onClick={(event) => event.stopPropagation()}
                        className="shrink-0 text-info"
                      >
                        <ArrowSquareOutIcon />
                      </a>
                    )}
                  </span>
                </Table.Cell>
                <Table.Cell>
                  <span className="truncate text-zinc-300" title={row.type}>
                    {row.type}
                  </span>
                </Table.Cell>
                <Table.Cell>
                  <span className="truncate text-zinc-400" title={row.familyId}>
                    {row.familyId}
                  </span>
                </Table.Cell>
                {shown.map((column) => {
                  const value = valueOf(kind, record, column.code)
                  return (
                    <Table.Cell
                      key={column.code}
                      className={column.kind === 'length' ? 'justify-end' : 'justify-start'}
                    >
                      <span
                        className={cn(
                          'truncate',
                          column.kind === 'length' ? 'font-mono text-zinc-300' : 'text-zinc-300',
                          value === null ? 'text-zinc-600' : '',
                        )}
                      >
                        {formatValue(value, column.kind, unit)}
                      </span>
                    </Table.Cell>
                  )
                })}
              </Table.Row>
            )
          }}
        </Table>
      </div>
    </div>
  )
}
