import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SetStateAction,
  type ReactNode,
} from 'react'
import {
  ArrowSquareOutIcon,
  CheckIcon,
  InfoIcon,
  WarningIcon,
  XCircleIcon,
} from '@phosphor-icons/react'
import { Button, Combobox, Table, cn } from '@toolpath/ui'
import type { CatalogTool, Holder } from '@toolpath/catalog-data'
import type { UnitSystem } from '@toolpath/tool-support'
import { formatGeometry } from 'shared/geometry'
import { askOfToolColumn } from 'shared/column-filters'
import { familyName } from 'shared/catalog'
import { typeLabel } from 'shared/tool-type'
import type { ToolQuery } from 'shared/filter'
import type { Mark } from 'shared/tool-marks'
import { orderedCodes } from 'shared/column-order'
import { ToolTypeIcon } from './tool-icons'
import { ColumnHeading, SORT_ICON } from './column-heading'
import type { Bound } from './column-filter'
import { CatalogComboboxButton } from './catalog-combobox-button'

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

export const flexibleColumnWidth = (width: string): string => `minmax(${width}, 1fr)`

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
  /**
   * How many holders that would otherwise fit were left off for having no
   * picture, so the panel can say so.
   *
   * **An empty dropdown that fits is indistinguishable from one that was
   * filtered** (Paul, 2026-09-07: "I just asked you to hide holders that do
   * not have profiles, and now I see no holders"). `drawable` hid every holder
   * in the rack, and the panel showed the same "No holder" it shows for a tool
   * nothing holds — so a missing measuring run read as a broken page. This is
   * the count behind that silence, and zero where nothing was hidden.
   */
  readonly undrawable?: (tool: CatalogTool) => number
  readonly onChoose: (
    tool: CatalogTool,
    choice: { readonly holderGuid: string | null; readonly colletGuid: string | null },
  ) => void
}

/**
 * A tool as the table sorts it.
 *
 * **A sort key has to be a field on the row**, the same rule `ComponentTable`
 * keeps: the kit sorts by reading `row[sortKey]`, so the two phrases this
 * catalog builds — the type with its shank, the family with its product line —
 * are carried on the row as the words the cells show. Sorting by Type and
 * reading the Type column then cannot disagree about what a tool is.
 */
interface TableTool extends CatalogTool {
  readonly id: string
  readonly type: string
  readonly family: string
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
  if (code === 'holder') {
    const holders = holding.holdersFor(tool)
    const items = ['', ...holders.map((each) => each.guid)]
    return (
      <div className="w-36 max-w-full" onClick={(event) => event.stopPropagation()}>
        <Combobox
          items={items}
          value={holderGuid ?? ''}
          aria-label={`Holder for ${tool.catalogNumber}`}
          onValueChange={(next) => {
            const nextHolder = typeof next === 'string' && next !== '' ? next : null
            holding.onChoose(tool, { holderGuid: nextHolder, colletGuid: null })
          }}
          itemToStringLabel={(guid) => {
            if (guid === '') {
              return 'No holder'
            }
            const holder = holders.find((each) => each.guid === guid)
            return holder === undefined
              ? ''
              : `${holder.label}${holder.trouble === null ? '' : ` · ${holder.trouble}`}`
          }}
          size="sm"
          variant="ghost"
        >
          <CatalogComboboxButton
            label={`Holder for ${tool.catalogNumber}`}
            placeholder="No holder"
          />
          <Combobox.Popover>
            <Combobox.List>
              {items.map((guid) => {
                const holder = holders.find((each) => each.guid === guid)
                return (
                  <Combobox.Item key={guid || 'none'} value={guid}>
                    {guid === '' ? 'No holder' : holder?.label}
                    {holder?.trouble === null || holder === undefined
                      ? null
                      : ` · ${holder.trouble}`}
                    <Combobox.ItemIndicator />
                  </Combobox.Item>
                )
              })}
            </Combobox.List>
          </Combobox.Popover>
        </Combobox>
      </div>
    )
  }
  const collets = holding.colletsFor(tool, holderGuid)
  const items = ['', ...collets.map((each) => each.guid)]
  return (
    <div className="w-36 max-w-full" onClick={(event) => event.stopPropagation()}>
      <Combobox
        items={items}
        value={colletGuid ?? ''}
        disabled={collets.length === 0}
        aria-label={`Collet for ${tool.catalogNumber}`}
        onValueChange={(next) =>
          holding.onChoose(tool, {
            holderGuid,
            colletGuid: typeof next === 'string' && next !== '' ? next : null,
          })
        }
        itemToStringLabel={(guid) =>
          guid === '' ? 'No collet' : (collets.find((each) => each.guid === guid)?.label ?? '')
        }
        size="sm"
        variant="ghost"
      >
        <CatalogComboboxButton label={`Collet for ${tool.catalogNumber}`} placeholder="No collet" />
        <Combobox.Popover>
          <Combobox.List>
            {items.map((guid) => (
              <Combobox.Item key={guid || 'none'} value={guid}>
                {guid === '' ? 'No collet' : collets.find((each) => each.guid === guid)?.label}
                <Combobox.ItemIndicator />
              </Combobox.Item>
            ))}
          </Combobox.List>
        </Combobox.Popover>
      </Combobox>
    </div>
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

/**
 * The filters the headers ask, and where the answers go.
 *
 * Handed in whole rather than one callback per column: which column asks what
 * is `shared/column-filters.ts`'s rule, and the table reads it there so that
 * the tool list, the holder list and the collet list cannot disagree about it.
 * Absent — a list nothing is being narrowed on — the headings still sort and
 * carry no funnel.
 */
export interface ToolColumnFiltering {
  /** The catalog-number search, which every list of tools narrows on. */
  readonly search: { readonly value: string; readonly onChange: (value: string) => void }
  /**
   * The tool query, where the rows are drawn from it.
   *
   * **A tap list is not.** Its rows come from the thread — `makersFor` sweeps
   * the whole catalog for taps that cut it — so the tool filters do not reach
   * it, and a funnel on its Vendor heading would be a control that changes
   * nothing. Left out, those headings sort and say nothing else.
   */
  readonly catalog?: {
    readonly query: ToolQuery
    readonly onTerm: (axis: string, values: ReadonlyArray<string>) => void
    readonly onRange: (code: string, bound: Bound | undefined) => void
    /** What an axis has among the tools on show, with how many wear each. */
    readonly options: (
      axis: string,
    ) => ReadonlyArray<{ readonly value: string; readonly label: string; readonly count: number }>
  }
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
  /**
   * Where this tool is already used, on some *other* feature — named.
   *
   * `on list` said that much and no more, so a cutter already being bought for
   * three other features looked the same as one bought for one (Paul,
   * 2026-09-07). `shared/component-usage.ts` owns the words.
   */
  readonly usedOn?: (guid: string) => { readonly label: string; readonly title: string } | null
  readonly empty?: ReactNode
  readonly filtering?: ToolColumnFiltering
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
  usedOn,
  empty,
  filtering,
  virtualized = true,
}: PartToolTableProps) => {
  const data = useMemo<Array<TableTool>>(
    () =>
      tools.map((tool) => ({
        ...tool,
        id: tool.guid,
        type: typeLabel(tool),
        family: familyName(tool.productLine ?? tool.familyId),
      })),
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

  /**
   * One heading, with the two things it can do: sort, and narrow.
   *
   * The filter it opens is whatever `askOfToolColumn` says the column asks —
   * words for the Vendor and Type columns, a number for every geometry code,
   * what somebody types for the catalog number, and nothing at all for the
   * holder and collet cells, which set a choice rather than hold a value.
   */
  const heading = (code: string, label: string): ReactNode => {
    if (filtering === undefined) {
      return <ColumnHeading label={label} />
    }
    const ask = askOfToolColumn(code)
    const catalog = filtering.catalog
    if (ask?.shape === 'text') {
      return (
        <ColumnHeading
          label={label}
          ask={ask}
          text={filtering.search.value}
          onText={filtering.search.onChange}
        />
      )
    }
    if (catalog === undefined) {
      return <ColumnHeading label={label} />
    }
    const axis = ask !== null && ask.shape === 'terms' ? ask.axis : null
    return (
      <ColumnHeading
        label={label}
        ask={ask}
        unit={unit}
        bound={catalog.query.ranges[code]}
        onBound={(bound) => catalog.onRange(code, bound)}
        options={axis === null ? undefined : catalog.options(axis)}
        chosen={axis === null ? undefined : (catalog.query.terms[axis] ?? [])}
        onChosen={axis === null ? undefined : (values) => catalog.onTerm(axis, values)}
      />
    )
  }

  const header = (
    <Table.HeaderRow>
      <Table.HeaderCell
        sortKey="catalogNumber"
        sortIcon={SORT_ICON}
        width={flexibleColumnWidth('10rem')}
      >
        {heading('catalogNumber', 'Catalog number')}
      </Table.HeaderCell>
      <Table.HeaderCell sortKey="brand" sortIcon={SORT_ICON} width={flexibleColumnWidth('7rem')}>
        {heading('brand', 'Vendor')}
      </Table.HeaderCell>
      <Table.HeaderCell sortKey="type" sortIcon={SORT_ICON} width={flexibleColumnWidth('12rem')}>
        {heading('type', 'Type')}
      </Table.HeaderCell>
      {/*
        **The family is a column** (Paul, 2026-09-08: "product line and family
        are the same and need to be rolled into one Family field. This should
        be a column in tools"). Fixed, like the other three and like the four
        every holder and collet row carries: it is what a tool *is*, not a
        number about it.
      */}
      <Table.HeaderCell sortKey="family" sortIcon={SORT_ICON} width={flexibleColumnWidth('9rem')}>
        {heading('family', 'Family')}
      </Table.HeaderCell>
      {shown.map((column) => (
        <Table.HeaderCell
          key={column.code}
          sortKey={column.code}
          sortIcon={SORT_ICON}
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
          width={flexibleColumnWidth(isHolding(column.code) ? '10rem' : '6rem')}
        >
          {heading(column.code, column.label)}
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
            const used = here ? null : (usedOn?.(tool.guid) ?? null)
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
                  {used === null ? null : (
                    <span
                      className="text-2xs ml-2 rounded border border-zinc-700 px-1 text-zinc-400"
                      title={used.title}
                    >
                      {used.label}
                    </span>
                  )}
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
                    title={tool.type}
                  >
                    <span className="shrink-0 text-zinc-500">
                      <ToolTypeIcon toolType={tool.form} />
                    </span>
                    <span className="truncate">{tool.type}</span>
                  </span>
                </Table.Cell>
                <Table.Cell>
                  <span className="truncate text-zinc-400" title={tool.family}>
                    {tool.family}
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

/**
 * The chrome over the list: what is narrowing it, and the way to stop.
 *
 * **The filters were behind a button, over a table whose headers said the same
 * words** (Paul, 2026-09-08). Everything a column names is asked on that
 * column's own header now; what is left is what no column shows — the part's
 * material, a family, a product line, a shank, and the crib's own holder and
 * collet — and those stay on show rather than going back behind a press.
 *
 * The count is every narrowing there is, the headers' included, because a
 * filter set on a column somebody has since hidden is otherwise a short list
 * with no visible reason for it.
 */
export const ToolTableToolbar = ({
  filters,
  actions,
  onClear,
  set,
}: {
  /** The questions no column asks. Absent for a list whose columns ask them all. */
  filters?: ReactNode
  actions?: ReactNode
  onClear: () => void
  /** How many questions are narrowing the list, in a header or on a button. */
  set: number
}) => (
  <>
    <div className="flex items-center justify-end gap-1">
      {set === 0 ? null : (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          title="Clear every filter, including the ones set in a column header"
          onClick={onClear}
          className="rounded border border-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-700"
        >
          Clear {set} filter{set === 1 ? '' : 's'}
        </Button>
      )}
    </div>
    {actions}
    {filters === undefined ? null : (
      <div data-part-tool-table-toolbar className="col-span-full flex flex-wrap items-center gap-1">
        {filters}
      </div>
    )}
  </>
)
