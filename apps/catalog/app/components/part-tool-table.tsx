import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SetStateAction,
  type ReactNode,
} from 'react'
import { ArrowSquareOutIcon, CheckIcon, InfoIcon, XCircleIcon } from '@phosphor-icons/react'
import { Button, Combobox, Table, cn } from '@toolpath/ui'
import type { CatalogTool, Holder } from '@toolpath/catalog-data'
import type { UnitSystem } from '@toolpath/tool-support'
import { formatGeometry } from 'shared/geometry'
import { askOfToolColumn, type ColumnAsk } from 'shared/column-filters'
import { familyName } from 'shared/catalog'
import { typeLabel } from 'shared/tool-type'
import type { ToolQuery } from 'shared/filter'
import { markWords, type Mark } from 'shared/tool-marks'
import type { BelowHolder } from 'shared/drawn-assembly'
import { orderedCodes } from 'shared/column-order'
import { ToolTypeIcon } from './tool-icons'
import {
  ColumnFilterMenu,
  ColumnHeading,
  SORT_ICON,
  type ColumnHeadingProps,
} from './column-heading'
import type { Bound, ColumnOverride } from './column-filter'
import { CatalogComboboxButton } from './catalog-combobox-button'

export interface PartToolColumn {
  readonly code: string
  readonly label: string
  readonly default: boolean
}

/**
 * What every tool row says about which tool it is.
 *
 * **In the picker with the rest of them** (Paul, 2026-09-08: "I should also see
 * ALL the columns in the list"). They were drawn outside the column set — four
 * headers the picker had never heard of — so a list could not be cut down to
 * the two things somebody was comparing, and the columns this session added or
 * renamed were missing from the one place that lists columns.
 */
const IDENTITY: ReadonlyArray<PartToolColumn> = [
  { code: 'catalogNumber', label: 'Catalog number', default: true },
  { code: 'brand', label: 'Vendor', default: true },
  { code: 'type', label: 'Type', default: true },
  { code: 'family', label: 'Family', default: true },
]

export const TOOL_COLUMNS: ReadonlyArray<PartToolColumn> = [
  ...IDENTITY,
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
  ...IDENTITY,
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

/**
 * A row of the list, in pixels — `@toolpath/ui`'s compact `Table`.
 *
 * The kit does not export it, so this is a copy of a number that lives
 * somewhere else, and `tests/on-the-part.spec.ts` § "opens with eight tools on
 * screen" is what keeps the two honest: if the kit changes its row height, that
 * test fails and says so, rather than the page quietly opening on seven.
 */
const ROW = 33

/**
 * Everything the rows share the panel with: the toolbar carrying the three list
 * buttons and the filters, the column headings under it, and the hairline
 * border of the card around the lot.
 *
 * The border is two pixels and it is the difference between eight rows and
 * seven-and-a-bit — the panel's size is its outer box, and the rows get what is
 * inside it.
 */
const OVER_THE_ROWS = 49 + ROW + 2

/** How many tools the list opens showing (Paul, 2026-09-10). */
export const TOOLS_ON_OPENING = 8

/**
 * What the list panel opens at.
 *
 * **Eight tools** (Paul, 2026-09-10: "with these updates, the default height of
 * the table should be whatever showing 8 tool rows is"). It was 45% of the
 * height of the page, which is a different number of tools on every screen —
 * seven at 800px, a dozen at 1200 — and the list is read in rows rather than in
 * percentages. The part gets whatever is left, which is the half of the screen
 * that wants the room.
 */
export const TABLE_OPENS_AT = OVER_THE_ROWS + TOOLS_ON_OPENING * ROW

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

/** The four that say which tool this is, rather than a number about it. */
export const isIdentity = (code: string): boolean => IDENTITY.some((column) => column.code === code)

/** How wide a column starts, by what it holds rather than by its numbers. */
const WIDTH: Readonly<Record<string, string>> = {
  catalogNumber: '10rem',
  brand: '7rem',
  type: '12rem',
  family: '9rem',
  holder: '10rem',
  collet: '10rem',
}

/** What a column sorts on: the words on the row, or the number behind it. */
const sortableValue = (row: TableTool, code: string): number | string | undefined =>
  isIdentity(code) ? IDENTITY_OF[code]?.(row) : row.geometry[code]

const IDENTITY_OF: Readonly<Record<string, (row: TableTool) => string>> = {
  catalogNumber: (row) => row.catalogNumber,
  brand: (row) => row.brand,
  type: (row) => row.type,
  family: (row) => row.family,
}

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

/**
 * **One glyph for anything the rules have something against** (Paul,
 * 2026-09-09: "can we use the same red X icon instead of the warning triangle
 * in tip angle, and for all incompatibilities?"). A refusal wore the circled
 * X and everything short of one wore a filled triangle, so a column read as
 * two different kinds of thing depending on which rule spoke.
 *
 * The colour still carries which: red is a refusal, amber is a caution the
 * tool survives — the same colour the number itself is painted in.
 */
const MarkIcon = ({ mark }: { mark: Mark | undefined }) => {
  if (mark === undefined) {
    return null
  }
  if (!mark.ok) {
    return (
      <XCircleIcon
        aria-label={markWords(mark)}
        className={mark.level === 'must' ? 'size-3.5 text-danger' : 'size-3.5 text-amber-300'}
      />
    )
  }
  if (mark.caution !== undefined) {
    return <XCircleIcon aria-label={mark.caution} className="size-3.5 text-amber-300" />
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
  below,
  unit,
}: {
  tool: CatalogTool
  code: string
  mark: Mark | undefined
  holding: Holding | undefined
  below: BelowHolder | null
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
    const needed = below?.length ?? null
    /**
     * **What the stack cannot reach, said as two lengths** — the note the
     * per-row holder dropdown used to write. A tool dropped for reach was
     * dropped for one of two reasons and said neither: every stack fouls the
     * part at the length this feature needs, or the tool is too short to stand
     * out that far and keep hold. Both are about a length somebody can change.
     */
    const cannot =
      below !== null && below.overLimit && below.needs !== null && below.most !== null
        ? `needs ${formatGeometry('LBH', below.needs, unit)} out, holds ${formatGeometry('LBH', below.most, unit)}`
        : null
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
          <span className="text-2xs font-sans text-amber-300">holder needs</span>
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
      <span title={mark === undefined ? undefined : markWords(mark)}>
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
   * Which question each heading asks, where it is not the tool list's own.
   *
   * A tap list answers two of them and sorts on the rest — its rows are swept
   * out of the catalog by the thread rather than narrowed by the whole query —
   * so it hands in `askOfTapColumn`. The rule is still
   * `shared/column-filters.ts`'s either way; this only says which of its rules
   * this list is under, so a heading cannot end up with a funnel over a filter
   * nothing applies.
   */
  readonly ask?: (code: string) => ColumnAsk | null
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
    /**
     * A column's limit, where this list narrows on numbers at all.
     *
     * Absent on the tap list, whose numbers are what the thread already
     * decided — and a range column with nowhere to send its answer asks
     * nothing, which is the same silence `ask` states from the other side.
     */
    readonly onRange?: (code: string, bound: Bound | undefined) => void
    /** What an axis has among the tools on show, with how many wear each. */
    readonly options: (
      axis: string,
    ) => ReadonlyArray<{ readonly value: string; readonly label: string; readonly count: number }>
    /**
     * What a column offers when its number no longer matches the geometry's, or
     * nothing where there is no feature to disagree with.
     *
     * Per column, because a rule is overruled by the filter that asks the same
     * question and by no other — `column-filter.tsx` § `OverrideNotice`.
     */
    readonly override?: (code: string) => ColumnOverride | undefined
    /**
     * What an axis has that this list is not showing — the values a feature's
     * own answer narrowed away, offered behind the `…` row.
     *
     * Per axis, like the counts beside it: what a contextual list hides is a
     * property of the axis, and only the axis's own values can say it.
     */
    readonly hidden?: (
      axis: string,
    ) => ReadonlyArray<{ readonly value: string; readonly label: string }>
    /**
     * Where a bound this list was swept on came from, for the columns that
     * state one rather than asking it.
     *
     * A tap's thread diameter and thread length are the thread's and the hole's
     * — `shared/hole-mode.ts` § `tapBounds` — and no box here can argue with
     * them, so the heading says the number and why instead of offering two.
     */
    readonly stated?: (code: string) => string | undefined
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
  /**
   * The length below the holder each candidate would stand at, in the stack
   * that is open — `shared/drawn-assembly`'s {@link BelowHolder}.
   *
   * A function of the *stack*, not of the row: one holder is chosen in the
   * tree for the whole assembly, so the row is asked about that holder rather
   * than carrying a holder of its own. Absent, and the column falls back to
   * the tool's own setup length, which is what a list with nothing holding it
   * can honestly say.
   */
  readonly below?: (tool: CatalogTool) => BelowHolder | null
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
  /**
   * A press offered on the empty list, where there is something to do about it.
   *
   * **The way out of "nothing fits" belongs where somebody hits it** (Paul,
   * 2026-09-08). Widening a filter and being told no tool matches is a dead end
   * with the answer two panels away, so the sentence that says the list is
   * empty carries the press that fills it.
   */
  readonly emptyAction?: { readonly text: string; readonly onClick: () => void }
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
  below,
  inBom,
  keptElsewhere,
  usedOn,
  empty,
  emptyAction,
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
  /**
   * Which column's filter is open, remembered by the list rather than by the
   * heading: `components/column-filter` says why a header cannot hold it.
   */
  const [openFilter, setOpenFilter] = useState<string | null>(null)
  /** The open column, or nothing where it has since been hidden. */
  const openColumn = shown.find((column) => column.code === openFilter) ?? null
  const inside = useRef<HTMLDivElement>(null)
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
   * What one column narrows on, and where its answer goes.
   *
   * Whatever `askOfToolColumn` says the column asks — words for the Vendor and
   * Type columns, a number for every geometry code, what somebody types for the
   * catalog number, and nothing at all for the holder and collet cells, which
   * set a choice rather than hold a value.
   *
   * Read twice from here: by the heading, for its funnel, and by the menu the
   * table draws for whichever column is open. One source, so the funnel cannot
   * end up filled for a filter the menu is not offering.
   */
  const filterProps = (code: string, label: string): ColumnHeadingProps => {
    if (filtering === undefined) {
      return { code, label }
    }
    const ask = (filtering.ask ?? askOfToolColumn)(code)
    const catalog = filtering.catalog
    if (ask?.shape === 'text') {
      return {
        code,
        label,
        ask,
        text: filtering.search.value,
        onText: filtering.search.onChange,
      }
    }
    if (catalog === undefined) {
      return { code, label }
    }
    const axis = ask !== null && ask.shape === 'terms' ? ask.axis : null
    const onRange = catalog.onRange
    return {
      code,
      label,
      ask,
      unit,
      bound: catalog.query.ranges[code],
      ...(onRange === undefined
        ? {}
        : { onBound: (bound: Bound | undefined) => onRange(code, bound) }),
      options: axis === null ? undefined : catalog.options(axis),
      chosen: axis === null ? undefined : (catalog.query.terms[axis] ?? []),
      onChosen: axis === null ? undefined : (values) => catalog.onTerm(axis, values),
      ...(ask?.shape === 'range' ? { override: catalog.override?.(code) } : {}),
      ...(ask?.shape === 'range' && catalog.stated?.(code) !== undefined
        ? { why: catalog.stated(code) }
        : {}),
      ...(axis === null ? {} : { hidden: catalog.hidden?.(axis) }),
    }
  }

  const heading = (code: string, label: string): ReactNode => (
    <ColumnHeading
      {...filterProps(code, label)}
      open={openFilter === code}
      onOpen={() => setOpenFilter((current) => (current === code ? null : code))}
    />
  )

  const header = (
    <Table.HeaderRow>
      {shown.map((column) => (
        <Table.HeaderCell
          key={column.code}
          sortKey={column.code}
          sortIcon={SORT_ICON}
          /*
            The four that say which tool this is sort on the words the row
            carries; every other column sorts on its number. What nobody stated
            sorts last in either direction — a blank is not a zero.
          */
          sortFn={(rows) =>
            rows.sort((left, right) => {
              const a = sortableValue(left as TableTool, column.code)
              const b = sortableValue(right as TableTool, column.code)
              if (a === undefined || b === undefined) {
                return a === b ? 0 : a === undefined ? 1 : -1
              }
              return typeof a === 'number' && typeof b === 'number'
                ? a - b
                : String(a).localeCompare(String(b), 'en', { numeric: true })
            })
          }
          width={flexibleColumnWidth(WIDTH[column.code] ?? '6rem')}
        >
          {heading(column.code, column.label)}
        </Table.HeaderCell>
      ))}
    </Table.HeaderRow>
  )

  return (
    <div ref={inside} data-part-tool-table className="flex min-h-0 min-w-0 flex-1 flex-col">
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
              {...(emptyAction === undefined
                ? {}
                : { emptyButtonText: emptyAction.text, onClickEmptyButton: emptyAction.onClick })}
            />
          }
        >
          {(tool) => {
            const here = inBom(tool)
            const elsewhere = !here && keptElsewhere(tool)
            const used = here ? null : (usedOn?.(tool.guid) ?? null)
            const rowMarks = marks?.(tool) ?? {}
            // Once per row, not once per cell: the stack is swept to answer it.
            const rowBelow = below?.(tool) ?? null
            return (
              <Table.Row>
                {shown.map((column) => (
                  <Table.Cell
                    key={column.code}
                    className={
                      isIdentity(column.code) || isHolding(column.code)
                        ? 'justify-start'
                        : 'justify-end'
                    }
                  >
                    {column.code === 'catalogNumber' ? (
                      <>
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
                      </>
                    ) : column.code === 'brand' ? (
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
                    ) : column.code === 'type' ? (
                      <span
                        className="flex min-w-0 items-center gap-1.5 text-zinc-300"
                        title={tool.type}
                      >
                        <span className="shrink-0 text-zinc-500">
                          <ToolTypeIcon toolType={tool.form} />
                        </span>
                        <span className="truncate">{tool.type}</span>
                      </span>
                    ) : column.code === 'family' ? (
                      <span className="truncate text-zinc-400" title={tool.family}>
                        {tool.family}
                      </span>
                    ) : (
                      <GeometryCell
                        tool={tool}
                        code={column.code}
                        mark={rowMarks[column.code]}
                        holding={holding}
                        below={rowBelow}
                        unit={unit}
                      />
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
/**
 * The chrome over the list: what is narrowing it, and the way to stop.
 *
 * **The filters were behind a button, over a table whose headers said the same
 * words** (Paul, 2026-09-08). Everything a column names is asked on that
 * column's own header now; what is left is what no column shows — the part's
 * material — and it sits in the top right, left of the pencil that edits the
 * columns (Paul, same day), rather than on a row of its own under the heading.
 *
 * The count is every narrowing there is, the headers' included, because a
 * filter set on a column somebody has since hidden is otherwise a short list
 * with no visible reason for it.
 */
export const ToolTableToolbar = ({
  before,
  filters,
  actions,
  onClear,
  set,
}: {
  /**
   * A press about the rows themselves, ahead of everything else in the chrome.
   *
   * **Left of the clear press, or left of the pencil when there is nothing to
   * clear** (Paul, 2026-09-10). It is not a filter: what it does is put rows on
   * the table rather than take them off, so counting it in `Clear n filters`
   * would name a filter nobody set — and it stays on screen when the clear
   * press is not there, which is why it is a slot of its own rather than part
   * of `filters`.
   */
  before?: ReactNode
  /** The questions no column asks. Absent for a list whose columns ask them all. */
  filters?: ReactNode
  actions?: ReactNode
  onClear: () => void
  /**
   * What is narrowing the list, named the way the list names it.
   *
   * **A count nobody can decompose is not an answer** (Paul, 2026-09-09: "in
   * Tap, it shows 'Clear 4 filters' but I only see tool type. What are the 4
   * filters active? It needs to be visible."). Names rather than a number, so
   * the press can say which — `shared/column-filters.ts` § `narrowingNames`
   * builds them, and the list that is open is what names them.
   */
  set: ReadonlyArray<string>
}) => (
  <>
    <div data-part-tool-table-toolbar className="flex flex-wrap items-center justify-end gap-1">
      {before}
      {set.length === 0 ? null : (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          title={`Narrowed by ${set.join(', ')}. Clearing puts every one of them back, including the ones set in a column header.`}
          onClick={onClear}
          className="rounded border border-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-700"
        >
          Clear {set.length} filter{set.length === 1 ? '' : 's'}
        </Button>
      )}
      {filters}
    </div>
    {actions}
  </>
)
