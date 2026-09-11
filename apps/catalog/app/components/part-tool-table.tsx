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
import { Button, Table, cn } from '@toolpath/ui'
import type { CatalogTool } from '@toolpath/catalog-data'
import type { UnitSystem } from '@toolpath/tool-support'
import { formatGeometry } from 'shared/geometry'
import { askOfToolColumn, type ColumnAsk } from 'shared/column-filters'
import { familyName } from 'shared/catalog'
import { typeLabel } from 'shared/tool-type'
import type { ToolQuery } from 'shared/filter'
import { markWords, type Mark } from 'shared/tool-marks'
import type { BelowHolder } from 'shared/drawn-assembly'
import { orderedCodes } from 'shared/column-order'
import { DEFAULT_COLUMN_WIDTH, fillingWidth, widthId } from 'shared/column-width'
import { useFittedColumns } from 'shared/use-fitted-columns'
import { ToolTypeIcon } from './tool-icons'
import {
  ColumnFilterMenu,
  ColumnHeading,
  SORT_ICON,
  type ColumnHeadingProps,
} from './column-heading'
import type { Bound, ColumnOverride } from './column-filter'
import { TABLE_FACE, TABLE_INK } from 'shared/type'

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
  { code: 'family', label: 'Family', default: true },
  { code: 'type', label: 'Type', default: true },
]

/**
 * The tool list's columns, in the order a shop reads a row (Paul, 2026-09-10).
 *
 * Which tool it is, then how many teeth and how wide, then the four lengths,
 * then the shape at either end of it and the shank.
 *
 * **The shank is not one of them** (Paul, 2026-09-10). It is what the holding
 * is chosen on rather than what the tool is chosen on, and the phrase in Type
 * already says it where it differs from the cut — a *reduced shank* end mill
 * says so in its name.
 *
 * **Corner radius and tip angle follow the list rather than opening with it**
 * (Paul, 2026-09-10). Each is the number one kind of tool is chosen on and a
 * dash beside the other, so a mill on the list brings the radius and a drill
 * brings the angle — `shared/auto-columns.ts` is the rule. They are `false`
 * here because that is what a fresh list, holding neither, shows.
 *
 * **The holder and the collet are not columns** (Paul, 2026-09-10). They were
 * the per-row dropdowns from before the assembly tree, and the tree took that
 * choice off the row: the page hands the list no holding at all, so ticking
 * either in the picker drew a column of dashes over a decision made in the
 * tree beside it.
 */
export const TOOL_COLUMNS: ReadonlyArray<PartToolColumn> = [
  ...IDENTITY,
  { code: 'NOF', label: 'Flutes', default: true },
  { code: 'DC', label: 'Diameter', default: true },
  { code: 'LCF', label: 'Flute length', default: true },
  { code: 'LBH', label: 'Length below holder', default: true },
  { code: 'LD', label: 'L/D', default: true },
  { code: 'OAL', label: 'Overall length', default: true },
  { code: 'RE', label: 'Corner radius', default: false },
  { code: 'SFDM', label: 'Shank', default: false },
  { code: 'SIG', label: 'Tip angle', default: false },
]

export const TAP_COLUMNS: ReadonlyArray<PartToolColumn> = [
  ...IDENTITY,
  { code: 'DC', label: 'Thread diameter', default: true },
  { code: 'LCF', label: 'Thread length', default: true },
  { code: 'LBH', label: 'Below holder', default: true },
  { code: 'LD', label: 'L/D', default: true },
  { code: 'OAL', label: 'Overall length', default: true },
  { code: 'NOF', label: 'Flutes', default: true },
  { code: 'SFDM', label: 'Shank', default: true },
]

export const hiddenByDefault = (columns: ReadonlyArray<PartToolColumn>): Array<string> =>
  columns.filter((column) => !column.default).map((column) => column.code)

/**
 * The grid track a column asks for — `shared/column-width` owns the rule.
 *
 * Kept as a name here because the header reads as a column asking for a width,
 * and `components/component-table.tsx` asks the same module the same thing.
 */
export const flexibleColumnWidth = fillingWidth

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
 * Everything the rows share the panel with: the column headings, and the
 * hairline border of the card around them.
 *
 * The border is two pixels and it is the difference between eight rows and
 * seven-and-a-bit — the panel's size is its outer box, and the rows get what is
 * inside it.
 *
 * **The toolbar is no longer one of them** (Paul, 2026-09-11): the three list
 * buttons, the filters and the notes float over the bottom of the viewer now,
 * so the 49 pixels they took out of the panel would open the list a row short.
 */
const OVER_THE_ROWS = ROW + 2

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

export const isStack = (code: string): boolean => code === 'LBH'

/** The four that say which tool this is, rather than a number about it. */
export const isIdentity = (code: string): boolean => IDENTITY.some((column) => column.code === code)

/**
 * How wide a column is, by what it holds rather than by its numbers.
 *
 * **Read as a share of the panel, not as a floor under it** — the rem is a
 * weight and `shared/column-width` is the rule. Until 2026-09-11 only the
 * largest entry here did anything: every column came out at the width of the
 * widest `minmax()` floor in the map, so the list opened 2120px wide inside a
 * 1169px panel with thirteen 192px columns. Raising one entry now widens that
 * column and narrows the rest.
 */
const WIDTH: Readonly<Record<string, string>> = {
  catalogNumber: '10rem',
  brand: '7rem',
  type: '12rem',
  family: '9rem',
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
  below,
  unit,
}: {
  tool: CatalogTool
  code: string
  mark: Mark | undefined
  below: BelowHolder | null
  unit: UnitSystem
}) => {
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
      <span className="flex min-w-0 flex-col items-end">
        <span>
          {needed === null
            ? own === undefined
              ? '—'
              : formatGeometry('LBH', own, unit)
            : formatGeometry('LBH', needed, unit)}
        </span>
        {cannot !== null ? (
          <span className="text-2xs text-amber-300">{cannot}</span>
        ) : changed ? (
          <span className="text-2xs text-amber-300">holder needs</span>
        ) : null}
      </span>
    )
  }
  const value = tool.geometry[code]
  return (
    <span
      className={cn(
        'flex items-baseline justify-end gap-1.5 whitespace-nowrap',
        mark === undefined || (mark.ok && mark.caution === undefined)
          ? null
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
  const codes = useMemo(() => shown.map((column) => column.code), [shown])
  /**
   * Where the kit keeps what somebody dragged — named after these columns.
   *
   * A stored track list is positional, so it is only ever an answer about the
   * column set it was dragged on: `shared/column-width.ts` says why that is the
   * id rather than a fixed one.
   */
  const widths = widthId('part-tools', codes)
  // The columns divide the panel; anything the kit's resizer froze onto it goes
  // when the panel or the column set changes.
  useFittedColumns(inside, codes.join(' '))
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
          width={flexibleColumnWidth(WIDTH[column.code] ?? DEFAULT_COLUMN_WIDTH)}
        >
          {heading(column.code, column.label)}
        </Table.HeaderCell>
      ))}
    </Table.HeaderRow>
  )

  return (
    <div
      ref={inside}
      data-part-tool-table
      className={cn(TABLE_FACE, TABLE_INK, 'flex min-h-0 min-w-0 flex-1 flex-col')}
    >
      <div className="min-h-0 flex-1">
        {/*
          **An id named after the columns, and no `min-w-max`** (Paul,
          2026-09-11). The kit stores a dragged layout under its `id` and hands
          it back on the next visit — which is worth keeping, and is only ever
          an answer about the columns it was dragged on, so the column set *is*
          the id. `min-w-max` was half of what made the list open wider than its
          panel; `shared/column-width` is the whole story on both.
        */}
        <Table
          id={widths}
          data={data}
          header={header}
          select
          selectedRows={selectedRows}
          setSelectedRows={setSelection}
          scrollable
          virtualized={virtualized}
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
                    className={isIdentity(column.code) ? 'justify-start' : 'justify-end'}
                  >
                    {column.code === 'catalogNumber' ? (
                      <>
                        <span>{tool.catalogNumber}</span>
                        {/*
                          **The vendor's page is on the number** (Paul,
                          2026-09-11), as it already is on the order list: the
                          catalogue number is what a shop orders by and looks
                          up, so the link belongs beside it rather than a cell
                          away in Vendor.
                        */}
                        {tool.productLink === null ? null : (
                          <a
                            href={tool.productLink}
                            target="_blank"
                            rel="noreferrer noopener"
                            aria-label={`Open ${tool.catalogNumber} at the vendor`}
                            onClick={(event) => event.stopPropagation()}
                            className="text-info ml-1 shrink-0"
                          >
                            <ArrowSquareOutIcon />
                          </a>
                        )}
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
                      <span className="truncate" title={tool.brand}>
                        {tool.brand}
                      </span>
                    ) : column.code === 'type' ? (
                      <span className="flex min-w-0 items-center gap-1.5" title={tool.type}>
                        <span className="shrink-0 text-zinc-500">
                          <ToolTypeIcon toolType={tool.form} />
                        </span>
                        <span className="truncate">{tool.type}</span>
                      </span>
                    ) : column.code === 'family' ? (
                      <span className="truncate" title={tool.family}>
                        {tool.family}
                      </span>
                    ) : (
                      <GeometryCell
                        tool={tool}
                        code={column.code}
                        mark={rowMarks[column.code]}
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
