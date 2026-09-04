import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type SetStateAction,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import {
  ArrowSquareOutIcon,
  CheckIcon,
  InfoIcon,
  WarningIcon,
  XCircleIcon,
} from '@phosphor-icons/react'
import { Table, cn } from '@toolpath/ui'
import type { CatalogTool, Holder } from '@toolpath/catalog-data'
import type { UnitSystem } from '@toolpath/tool-support'
import { formatGeometry } from 'shared/geometry'
import type { Mark } from 'shared/tool-marks'
import { orderedCodes } from 'shared/column-order'
import { ToolTypeIcon, formLabel } from './tool-icons'

export interface PartToolColumn {
  readonly code: string
  readonly label: string
  readonly default: boolean
}

export const TOOL_COLUMNS: ReadonlyArray<PartToolColumn> = [
  { code: 'DC', label: 'Diameter', default: true },
  { code: 'holder', label: 'Holder', default: false },
  { code: 'collet', label: 'Collet', default: false },
  { code: 'LCF', label: 'Flute length', default: true },
  { code: 'LBH', label: 'Length below holder', default: true },
  { code: 'LD', label: 'L/D', default: true },
  { code: 'OAL', label: 'Overall length', default: true },
  { code: 'RE', label: 'Corner radius', default: true },
  { code: 'NOF', label: 'Flutes', default: true },
  { code: 'SFDM', label: 'Shank', default: true },
  { code: 'SIG', label: 'Tip angle', default: false },
]

export const TAP_COLUMNS: ReadonlyArray<PartToolColumn> = [
  { code: 'DC', label: 'Thread diameter', default: true },
  { code: 'holder', label: 'Holder', default: false },
  { code: 'collet', label: 'Collet', default: false },
  { code: 'LCF', label: 'Thread length', default: true },
  { code: 'LBH', label: 'Below holder', default: true },
  { code: 'LD', label: 'L/D', default: true },
  { code: 'OAL', label: 'Overall length', default: true },
  { code: 'NOF', label: 'Flutes', default: true },
  { code: 'SFDM', label: 'Shank', default: true },
]

export const hiddenByDefault = (columns: ReadonlyArray<PartToolColumn>): Array<string> =>
  columns.filter((column) => !column.default).map((column) => column.code)

export interface Holding {
  readonly holdersFor: (tool: CatalogTool) => ReadonlyArray<{
    readonly guid: string
    readonly label: string
    readonly trouble: string | null
    readonly holder: Holder
  }>
  readonly colletsFor: (
    tool: CatalogTool,
    holderGuid: string | null,
  ) => ReadonlyArray<{ readonly guid: string; readonly label: string }>
  readonly chosen: (tool: CatalogTool) => {
    readonly holderGuid: string | null
    readonly colletGuid: string | null
  }
  readonly requiredStickout: (tool: CatalogTool) => number | null
  readonly stickoutFor: (tool: CatalogTool) => number | null
  readonly reachNote?: (tool: CatalogTool) => string | null
  readonly onChoose: (
    tool: CatalogTool,
    choice: { readonly holderGuid: string | null; readonly colletGuid: string | null },
  ) => void
}

interface TableTool extends CatalogTool {
  readonly id: string
}

interface Selection {
  readonly id: string | null
  readonly ids: Array<string>
}

export const isHolding = (code: string): boolean => code === 'holder' || code === 'collet'
export const isStack = (code: string): boolean => code === 'LBH'

const columnsShown = (
  columns: ReadonlyArray<PartToolColumn>,
  hidden: ReadonlyArray<string>,
  order: ReadonlyArray<string>,
): ReadonlyArray<PartToolColumn> => {
  const kept = columns.filter((column) => !hidden.includes(column.code))
  return orderedCodes(
    kept.map((column) => column.code),
    order,
  ).flatMap((code) => kept.filter((column) => column.code === code))
}

const HoldingCell = ({
  tool,
  code,
  holding,
}: {
  tool: CatalogTool
  code: string
  holding: Holding
}) => {
  const { holderGuid, colletGuid } = holding.chosen(tool)
  const stop = (event: ReactMouseEvent | ChangeEvent<HTMLSelectElement>) => event.stopPropagation()
  if (code === 'holder') {
    return (
      <select
        aria-label={`Holder for ${tool.catalogNumber}`}
        value={holderGuid ?? ''}
        onClick={stop}
        onChange={(event) => {
          stop(event)
          holding.onChoose(tool, {
            holderGuid: event.target.value === '' ? null : event.target.value,
            colletGuid: null,
          })
        }}
        className="w-36 max-w-full truncate rounded border border-zinc-800 bg-zinc-950 px-1.5 py-1 text-xs text-zinc-200"
      >
        <option value="">No holder</option>
        {holding.holdersFor(tool).map((each) => (
          <option key={each.guid} value={each.guid}>
            {each.label}
            {each.trouble === null ? '' : ` · ${each.trouble}`}
          </option>
        ))}
      </select>
    )
  }
  const collets = holding.colletsFor(tool, holderGuid)
  return (
    <select
      aria-label={`Collet for ${tool.catalogNumber}`}
      value={colletGuid ?? ''}
      disabled={collets.length === 0}
      onClick={stop}
      onChange={(event) => {
        stop(event)
        holding.onChoose(tool, {
          holderGuid,
          colletGuid: event.target.value === '' ? null : event.target.value,
        })
      }}
      className="w-36 max-w-full truncate rounded border border-zinc-800 bg-zinc-950 px-1.5 py-1 text-xs text-zinc-200 disabled:text-zinc-600"
    >
      <option value="">No collet</option>
      {collets.map((each) => (
        <option key={each.guid} value={each.guid}>
          {each.label}
        </option>
      ))}
    </select>
  )
}

const MarkIcon = ({ mark }: { mark: Mark | undefined }) => {
  if (mark === undefined) {
    return null
  }
  if (!mark.ok) {
    const Icon = mark.level === 'must' ? XCircleIcon : WarningIcon
    return (
      <Icon
        weight={mark.level === 'must' ? undefined : 'fill'}
        aria-label={`${mark.why} — ${mark.detail}`}
        className={mark.level === 'must' ? 'size-3.5 text-danger' : 'size-3.5 text-amber-300'}
      />
    )
  }
  if (mark.caution !== undefined) {
    return (
      <WarningIcon weight="fill" aria-label={mark.caution} className="size-3.5 text-amber-300" />
    )
  }
  if (mark.note !== undefined) {
    return <InfoIcon aria-label={mark.note} className="size-3.5 text-zinc-400" />
  }
  return <CheckIcon aria-label="within the rules" className="size-3 text-emerald-400" />
}

const GeometryCell = ({
  tool,
  code,
  mark,
  holding,
  unit,
}: {
  tool: CatalogTool
  code: string
  mark: Mark | undefined
  holding: Holding | undefined
  unit: UnitSystem
}) => {
  if (isHolding(code)) {
    return holding === undefined ? (
      <span className="text-zinc-600">—</span>
    ) : (
      <HoldingCell tool={tool} code={code} holding={holding} />
    )
  }
  if (isStack(code) && (mark === undefined || mark.ok)) {
    const own = tool.geometry.LBH
    const needed = holding?.requiredStickout(tool) ?? null
    const picked = holding?.chosen(tool).holderGuid ?? null
    const cannot = holding?.reachNote?.(tool) ?? null
    const changed = own !== undefined && needed !== null && Math.abs(needed - own) > 0.005
    return (
      <span className="flex min-w-0 flex-col items-end font-mono text-zinc-300">
        <span>
          {needed === null
            ? own === undefined
              ? '—'
              : formatGeometry('LBH', own, unit)
            : formatGeometry('LBH', needed, unit)}
        </span>
        {cannot !== null ? (
          <span className="text-2xs font-sans text-amber-300">{cannot}</span>
        ) : changed ? (
          <span className="text-2xs font-sans text-amber-300">
            {picked === null ? '' : 'holder needs'}
          </span>
        ) : null}
      </span>
    )
  }
  const value = tool.geometry[code]
  return (
    <span
      className={cn(
        'flex items-baseline justify-end gap-1.5 font-mono whitespace-nowrap',
        mark === undefined || (mark.ok && mark.caution === undefined)
          ? 'text-zinc-300'
          : mark.ok
            ? 'text-amber-300'
            : mark.level === 'must'
              ? 'text-danger'
              : 'text-amber-300',
      )}
    >
      <span>{value === undefined ? '—' : formatGeometry(code, value, unit)}</span>
      <span
        title={
          mark === undefined
            ? undefined
            : !mark.ok
              ? `${mark.why} — ${mark.detail}`
              : (mark.caution ?? mark.note)
        }
      >
        <MarkIcon mark={mark} />
      </span>
    </span>
  )
}

export interface PartToolTableProps {
  readonly tools: ReadonlyArray<CatalogTool>
  readonly unit: UnitSystem
  readonly chosen: string | null
  readonly onChoose: (tool: CatalogTool) => void
  readonly columns?: ReadonlyArray<PartToolColumn>
  readonly hiddenColumns: ReadonlyArray<string>
  readonly columnOrder: ReadonlyArray<string>
  readonly marks?: (tool: CatalogTool) => Record<string, Mark>
  readonly holding?: Holding
  readonly inBom: (tool: CatalogTool) => boolean
  readonly keptElsewhere: (tool: CatalogTool) => boolean
  readonly empty?: ReactNode
  /** Test-only escape hatch for jsdom, where virtual rows cannot measure themselves. */
  readonly virtualized?: boolean
}

/** The part screen's virtualized tool list, backed by the exported UI Table. */
export const PartToolTable = ({
  tools,
  unit,
  chosen,
  onChoose,
  columns = TOOL_COLUMNS,
  hiddenColumns,
  columnOrder,
  marks,
  holding,
  inBom,
  keptElsewhere,
  empty,
  virtualized = true,
}: PartToolTableProps) => {
  const data = useMemo<Array<TableTool>>(
    () => tools.map((tool) => ({ ...tool, id: tool.guid })),
    [tools],
  )
  const shown = useMemo(
    () => columnsShown(columns, hiddenColumns, columnOrder),
    [columns, hiddenColumns, columnOrder],
  )
  const [selectedRows, setSelectedRows] = useState<Selection>({ id: chosen, ids: [] })
  const selectionCameFromTable = useRef(false)
  const setSelection = useCallback((next: SetStateAction<Selection>) => {
    setSelectedRows((current) => {
      const resolved = typeof next === 'function' ? next(current) : next
      const sameIds =
        current.ids.length === resolved.ids.length &&
        current.ids.every((id, index) => id === resolved.ids[index])
      if (current.id === resolved.id && sameIds) {
        return current
      }
      selectionCameFromTable.current = true
      return resolved
    })
  }, [])

  useEffect(() => {
    selectionCameFromTable.current = false
    setSelectedRows((current) => (current.id === chosen ? current : { id: chosen, ids: [] }))
  }, [chosen])

  useEffect(() => {
    if (!selectionCameFromTable.current || selectedRows.id === null) {
      return
    }
    selectionCameFromTable.current = false
    const tool = tools.find((each) => each.guid === selectedRows.id)
    if (tool !== undefined && tool.guid !== chosen) {
      onChoose(tool)
    }
  }, [selectedRows.id, tools, chosen, onChoose])

  const header = (
    <Table.HeaderRow>
      <Table.HeaderCell sortKey="catalogNumber" width="10rem">
        Catalog number
      </Table.HeaderCell>
      <Table.HeaderCell sortKey="brand" width="7rem">
        Vendor
      </Table.HeaderCell>
      <Table.HeaderCell sortKey="form" width="12rem">
        Type
      </Table.HeaderCell>
      {shown.map((column) => (
        <Table.HeaderCell
          key={column.code}
          sortKey={column.code}
          sortFn={(rows) =>
            rows.sort((left, right) => {
              const a = (left as TableTool).geometry[column.code]
              const b = (right as TableTool).geometry[column.code]
              if (a === undefined || b === undefined) {
                return a === b ? 0 : a === undefined ? 1 : -1
              }
              return a - b
            })
          }
          width={isHolding(column.code) ? '10rem' : '6rem'}
        >
          {column.label}
        </Table.HeaderCell>
      ))}
    </Table.HeaderRow>
  )

  return (
    <div data-part-tool-table className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="min-h-0 flex-1">
        <Table
          id="part-tools"
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
                empty ?? 'No tool in the catalog matches every part of this selection.'
              }
            />
          }
        >
          {(tool) => {
            const here = inBom(tool)
            const elsewhere = !here && keptElsewhere(tool)
            const rowMarks = marks?.(tool) ?? {}
            return (
              <Table.Row>
                <Table.Cell>
                  <span className="font-mono text-zinc-100">{tool.catalogNumber}</span>
                  {here || elsewhere ? (
                    <span
                      className={cn(
                        'text-2xs ml-2 rounded border px-1',
                        here
                          ? 'border-emerald-500/40 text-emerald-300'
                          : 'border-zinc-700 text-zinc-400',
                      )}
                    >
                      on list
                    </span>
                  ) : null}
                </Table.Cell>
                <Table.Cell>
                  <span className="flex min-w-0 items-center gap-1">
                    <span className="truncate text-zinc-400" title={tool.brand}>
                      {tool.brand}
                    </span>
                    {tool.productLink === null ? null : (
                      <a
                        href={tool.productLink}
                        target="_blank"
                        rel="noreferrer noopener"
                        aria-label={`Open ${tool.catalogNumber} at the vendor`}
                        onClick={(event) => event.stopPropagation()}
                        className="shrink-0 text-info"
                      >
                        <ArrowSquareOutIcon />
                      </a>
                    )}
                  </span>
                </Table.Cell>
                <Table.Cell>
                  <span
                    className="flex min-w-0 items-center gap-1.5 text-zinc-300"
                    title={formLabel(tool)}
                  >
                    <span className="shrink-0 text-zinc-500">
                      <ToolTypeIcon toolType={tool.form} />
                    </span>
                    <span className="truncate">{formLabel(tool)}</span>
                  </span>
                </Table.Cell>
                {shown.map((column) => (
                  <Table.Cell
                    key={column.code}
                    className={isHolding(column.code) ? 'justify-start' : 'justify-end'}
                  >
                    <GeometryCell
                      tool={tool}
                      code={column.code}
                      mark={rowMarks[column.code]}
                      holding={holding}
                      unit={unit}
                    />
                  </Table.Cell>
                ))}
              </Table.Row>
            )
          }}
        </Table>
      </div>
    </div>
  )
}

export const ToolTableToolbar = ({
  filters,
  actions,
  onClear,
}: {
  filters: ReactNode
  actions?: ReactNode
  onClear: () => void
}) => {
  const [open, setOpen] = useState(false)

  return (
    <>
      <div data-part-tool-table-toolbar className="flex items-center justify-end gap-1">
        <button
          type="button"
          aria-expanded={open}
          title="Open filters. Right-click to clear all filters."
          onClick={() => setOpen(!open)}
          onContextMenu={(event) => {
            event.preventDefault()
            onClear()
          }}
          className="rounded border border-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-700"
        >
          Filters
        </button>
      </div>
      {actions}
      {open ? (
        <div
          data-tool-table-popover
          role="dialog"
          aria-label="Filters"
          className="col-span-full rounded-lg border border-zinc-800 bg-zinc-950 p-2"
        >
          {filters}
        </div>
      ) : null}
    </>
  )
}
