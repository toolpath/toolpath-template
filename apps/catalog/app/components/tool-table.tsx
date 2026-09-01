import { useMemo } from 'react'
import type { CatalogTool, Holder } from '@toolpath/catalog-data'
import { GEOMETRY_FIELDS } from '@toolpath/catalog-data'
import { Link } from 'react-router'
import type { Unit } from '@toolpath/domain/units'
import { formatGeometry } from 'shared/geometry'
import {
  ArrowSquareOutIcon,
  CaretDownIcon,
  CaretUpIcon,
  CheckIcon,
  MagnifyingGlassIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
  WarningIcon,
} from '@phosphor-icons/react'
import { classNames } from '@toolpath/domain/class-names'
import type { Mark } from 'shared/tool-marks'
import { orderedCodes } from 'shared/column-order'
import { FunnelIcon, FunnelSimpleIcon } from '@phosphor-icons/react'
import { ColumnFilter, TermColumnFilter, type Bound, type Kind } from './column-filter'
import { ToolTypeIcon, toolTypeLabel, formLabel } from './tool-icons'

/**
 * The columns a tool is chosen on, in the order the question is usually asked.
 *
 * `default` is what a list opens with. The rest are a click away rather than
 * absent: a shop that picks on shank diameter should not have to be told the
 * catalog knows it, but a table that shows every field it holds is a table
 * nobody can read a row of.
 */
export const TOOL_COLUMNS = [
  { code: 'DC', label: 'Diameter', default: true },
  { code: 'holder', label: 'Holder', default: false, holding: true },
  { code: 'collet', label: 'Collet', default: false, holding: true },
  { code: 'LCF', label: 'Flute length', default: true },
  { code: 'LBH', label: 'Length below holder', default: true },
  { code: 'LD', label: 'L/D', default: true },
  { code: 'OAL', label: 'Overall length', default: true },
  { code: 'RE', label: 'Corner radius', default: true },
  { code: 'NOF', label: 'Flutes', default: true },
  { code: 'SFDM', label: 'Shank', default: true },
  { code: 'SIG', label: 'Tip angle', default: false },
] as const

/**
 * Which columns are drawn, in the order they are drawn in.
 *
 * Exported because the tap section under the list mirrors it: two tables in
 * one panel with different columns read as two different things, and Paul
 * asked for them aligned (2026-08-31).
 */
export const shownColumns = (
  hidden: ReadonlyArray<string>,
  order?: ReadonlyArray<string>,
): ReadonlyArray<(typeof TOOL_COLUMNS)[number]> => {
  const kept = TOOL_COLUMNS.filter((column) => !hidden.includes(column.code))
  if (order === undefined) {
    return kept
  }
  return orderedCodes(
    kept.map((column) => column.code),
    order,
  ).flatMap((code) => kept.filter((column) => column.code === code))
}

/** The width every table in the panel gives each kind of column. */
export const COLUMN_WIDTH = {
  name: 'w-56',
  /**
   * Wide enough for the longest name a tool has.
   *
   * "Reduced shank bull nose end mill" is 31 characters and the column held
   * 26 of them, which in a `table-fixed` row painted the rest across the
   * diameter beside it (Paul, 2026-09-01). Anything longer still truncates,
   * with the whole of it on the title.
   */
  type: 'w-56',
  value: 'w-32',
  bom: 'w-32',
} as const

/**
 * The two columns that are not geometry: what the tool is held in.
 *
 * Off by default and a tick away, like every other column the list does not
 * open with. Shown, each row gets a dropdown, and what is picked there is what
 * *Add to list* opens on — so a shop that always uses one holder decides once
 * per row rather than once per dialog (Paul, 2026-08-31).
 */
export const isHolding = (code: string): boolean => code === 'holder' || code === 'collet'

/**
 * The column that is about the **stack**, not the tool.
 *
 * What a tool has to stand out to reach a feature is the holder's question as
 * much as the tool's: a wider nose has to start further up. So the column says
 * what *this* stack needs, and stays empty until a holder is chosen in the row
 * — a single number there would be a claim about a holder nobody picked
 * (Paul, 2026-08-31).
 */
export const isStack = (code: string): boolean => code === 'LBH'

/** How many rows a list draws before it asks to be narrowed. */
const PAGE = 200

/**
 * Up, down, off.
 *
 * Its own control rather than the header itself, because the header is
 * already the filter — one press cannot mean both.
 */
/**
 * A column header that hands its question to the rail.
 *
 * The same funnel, in the same place, opening the one control that answers it
 * — so a filter set from a header and a filter set from the rail are visibly
 * the same filter (Paul, 2026-09-01).
 */
const RailHandover = ({
  label,
  set,
  onOpen,
}: {
  label: string
  set: boolean
  onOpen: () => void
}) => (
  <span className="inline-flex items-center justify-end gap-1">
    <span>{label}</span>
    <button
      type="button"
      aria-label={`Filter by ${label}`}
      title={set ? `Filtered by ${label} — open it on the rail` : `Filter by ${label} on the rail`}
      onClick={onOpen}
      className={
        set
          ? 'text-info rounded p-0.5 hover:bg-zinc-800'
          : 'rounded p-0.5 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300'
      }
    >
      {set ? <FunnelIcon weight="fill" /> : <FunnelSimpleIcon />}
    </button>
  </span>
)

const SortButton = ({
  label,
  code,
  sort,
  onSort,
}: {
  label: string
  code: string
  sort: Sort | null
  onSort: (sort: Sort | null) => void
}) => {
  const on = sort?.code === code
  return (
    <button
      type="button"
      aria-label={`Sort by ${label.toLowerCase()}`}
      aria-pressed={on}
      onClick={() => onSort(nextSort(sort, code))}
      className={classNames(
        'focus-visible:ring-info/60 shrink-0 rounded p-0.5 transition focus-visible:ring-1 focus-visible:outline-none',
        on ? 'text-info' : 'text-zinc-600 hover:text-zinc-300',
      )}
    >
      {on && !sort.ascending ? (
        <CaretDownIcon aria-hidden="true" />
      ) : (
        <CaretUpIcon aria-hidden="true" />
      )}
    </button>
  )
}

const kindOf = (code: string): Kind => {
  const unit = GEOMETRY_FIELDS[code]?.unit
  return unit === 'count' || unit === 'deg' || unit === 'ratio' ? unit : 'length'
}

export interface ToolTableProps {
  readonly tools: ReadonlyArray<CatalogTool>
  readonly unit: Unit
  /** The chosen row's guid, when a page shows one tool's details beside the list. */
  readonly chosen?: string | null
  readonly onChoose?: (tool: CatalogTool) => void
  /**
   * The dimension filters in force, keyed by geometry code.
   *
   * The same `ranges` the rest of the application filters on, so a limit set on
   * a column is a limit like any other — in the URL, cleared by Clear, and kept
   * by a saved filter.
   */
  readonly ranges?: Readonly<Record<string, Bound>>
  readonly onRange?: (code: string, bound: Bound | undefined) => void
  /** The name filters in force — the Type column's — keyed the same way. */
  readonly terms?: Readonly<Record<string, ReadonlyArray<string>>>
  readonly onTerm?: (key: string, values: ReadonlyArray<string>) => void
  /**
   * Columns to leave out.
   *
   * Held by the caller so the control that edits them can sit wherever the page
   * wants it — which is the panel's own corner, not a column of the table.
   * Undefined means the table decides, which is what the catalog page wants.
   */
  readonly hiddenColumns?: ReadonlyArray<string>
  /**
   * The order the columns are drawn in, by code.
   *
   * Held by the caller for the same reason the hidden set is: the control that
   * drags them into order is the column picker, which sits in the panel's
   * corner rather than in the table. Absent is the order they are declared in.
   */
  readonly columnOrder?: ReadonlyArray<string>
  /**
   * What the matching says about each tool, column by column: a tick on what
   * the rules read and passed, the field that failed in red.
   */
  readonly marks?: (tool: CatalogTool) => Record<string, Mark>
  /**
   * The list is the **nearest misses**: nothing in the crib fits this feature,
   * so what is shown is what came closest and what stopped each.
   *
   * Marked on every row rather than only in the line above the table (Paul,
   * 2026-09-01: "isn't that tool just incompatible and shouldn't be shown?").
   * It is shown on purpose — an empty list answers nothing, and "this one is
   * 0.1 mm too wide" is worth reading — but a row nobody can use has to say so
   * where somebody looks.
   */
  readonly nearest?: boolean
  /**
   * The rail asks this question too, so the header hands it over.
   *
   * **One filter, one place to answer it** (Paul, 2026-09-01): a column that
   * opened a picker of its own left two controls for one question and no sign
   * that they were the same. Where this is given for a column's code, the
   * header's funnel opens that bubble on the rail instead.
   */
  readonly onRailFilter?: (key: string) => void
  /** Which column codes the rail asks about, by the key it asks them under. */
  readonly railKeys?: Readonly<Record<string, string>>
  /** The column the view is sorted by, and which way. */
  readonly sort?: Sort | null
  readonly onSort?: (sort: Sort | null) => void
  /**
   * Keeping a tool. The button's own rectangle goes with it, because what it
   * opens belongs beside the button rather than in the middle of the screen.
   */
  readonly onBom?: (tool: CatalogTool, at: DOMRect) => void
  readonly inBom?: (tool: CatalogTool) => boolean
  /** Taking one back off the bill, from the row that put it there. */
  readonly onRemoveBom?: (tool: CatalogTool) => void
  /**
   * Kept for **another** feature: the same cutter, already decided on.
   *
   * One tool often does more than one feature, so the row offers a plus
   * rather than the whole dialog again — the holder and collet it already has
   * come with it (Paul, 2026-08-31).
   */
  readonly keptElsewhere?: (tool: CatalogTool) => boolean
  readonly onAlsoBom?: (tool: CatalogTool) => void
  /**
   * Narrowing by catalog number, as typed.
   *
   * The number is how a shop names a tool to itself, so it is the one column
   * that wants typing into rather than ticking (Paul, 2026-08-31). Held by the
   * caller, because it narrows the list the caller passes in.
   */
  readonly search?: string
  readonly onSearch?: (text: string) => void
  /**
   * What holds each tool, for the Holder and Collet columns.
   *
   * Only asked for when one of those columns is shown, because building every
   * tool's options means grading every holder in the crib against it.
   */
  readonly holding?: Holding
}

/** A choice of holding, per tool, as the table needs to ask about it. */
export interface Holding {
  /** Every holder for this tool, best first; `trouble` is why not, if not. */
  readonly holdersFor: (tool: CatalogTool) => ReadonlyArray<{
    readonly guid: string
    readonly label: string
    readonly trouble: string | null
    /** The holder itself, for what draws it rather than lists it. */
    readonly holder: Holder
  }>
  /** The collets for one holder, or none when it takes none. */
  readonly colletsFor: (
    tool: CatalogTool,
    holderGuid: string | null,
  ) => ReadonlyArray<{ readonly guid: string; readonly label: string }>
  readonly chosen: (tool: CatalogTool) => {
    readonly holderGuid: string | null
    readonly colletGuid: string | null
  }
  /**
   * What the chosen stack has to stand out to clear the part, in mm — null
   * where no holder is chosen, or where nothing can be worked out (no reach
   * curve, or a holder whose nose the vendor never published).
   */
  readonly requiredStickout: (tool: CatalogTool) => number | null
  /** How far the chosen stack stands out, mm — what the drawing is drawn at. */
  readonly stickoutFor: (tool: CatalogTool) => number | null
  /**
   * Why nothing in the crib can hold this tool for this feature, in one line.
   *
   * Null where something can. A tool the rules admit and no holder reaches was
   * dropped in silence, which read as a tool that does not exist rather than
   * one that cannot be got down there (Paul, 2026-08-31).
   */
  readonly reachNote?: (tool: CatalogTool) => string | null
  readonly onChoose: (
    tool: CatalogTool,
    choice: { readonly holderGuid: string | null; readonly colletGuid: string | null },
  ) => void
}

const HOLDING_SELECT =
  'focus-visible:ring-info/60 w-36 max-w-full truncate rounded border border-zinc-800 bg-zinc-950 px-1.5 py-1 text-xs text-zinc-200 focus-visible:ring-1 focus-visible:outline-none'

/** One row's holder or collet, as a dropdown of what will fit it. */
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
    return (
      <select
        aria-label={`Holder for ${tool.catalogNumber}`}
        value={holderGuid ?? ''}
        // The row is clickable; choosing in the cell must not also choose the
        // row out from under the open list.
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => {
          event.stopPropagation()
          holding.onChoose(tool, {
            holderGuid: event.target.value === '' ? null : event.target.value,
            colletGuid: null,
          })
        }}
        className={HOLDING_SELECT}
      >
        <option value="">No holder</option>
        {holders.map((each) => (
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
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => {
        event.stopPropagation()
        holding.onChoose(tool, {
          holderGuid,
          colletGuid: event.target.value === '' ? null : event.target.value,
        })
      }}
      className={classNames(HOLDING_SELECT, collets.length === 0 && 'text-zinc-600')}
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

/** A column, and which way it is read. */
export interface Sort {
  readonly code: string
  readonly ascending: boolean
}

/**
 * The next state of a header that is pressed: up, then down, then off.
 *
 * Off is a state on purpose — the order a list arrives in is the sheet's
 * ranking, and somebody who sorted by diameter needs a way back to it.
 */
export const nextSort = (sort: Sort | null, code: string): Sort | null => {
  if (sort?.code !== code) {
    return { code, ascending: true }
  }
  return sort.ascending ? { code, ascending: false } : null
}

/** Sorts by one geometry column, tools that do not state it last either way. */
export const sortedBy = (
  tools: ReadonlyArray<CatalogTool>,
  sort: Sort | null,
): ReadonlyArray<CatalogTool> => {
  if (sort === null) {
    return tools
  }
  const read = (tool: CatalogTool): number | null =>
    sort.code === 'catalogNumber' ? null : (tool.geometry[sort.code] ?? null)
  return [...tools].sort((a, b) => {
    if (sort.code === 'catalogNumber') {
      const by = a.catalogNumber.localeCompare(b.catalogNumber)
      return sort.ascending ? by : -by
    }
    if (sort.code === 'form') {
      const by = a.form.localeCompare(b.form)
      return sort.ascending ? by : -by
    }
    const left = read(a)
    const right = read(b)
    if (left === null || right === null) {
      return left === right ? 0 : left === null ? 1 : -1
    }
    return sort.ascending ? left - right : right - left
  })
}

export const ToolTable = ({
  tools,
  unit,
  chosen,
  onChoose,
  ranges = {},
  onRange,
  terms = {},
  onTerm,
  hiddenColumns,
  columnOrder,
  marks,
  sort = null,
  onSort,
  onBom,
  inBom,
  onRemoveBom,
  keptElsewhere,
  onAlsoBom,
  holding,
  search = '',
  onSearch,
  nearest = false,
  onRailFilter,
  railKeys = {},
}: ToolTableProps) => {
  /**
   * The forms the list holds, for the Type column to narrow by.
   *
   * What is on screen plus anything already ticked — a ticked form whose tools
   * have all been filtered out by another column must stay listed, or there is
   * no way to untick it.
   */
  const forms = useMemo(() => {
    const counts = new Map<string, number>()
    for (const tool of tools) {
      counts.set(tool.form, (counts.get(tool.form) ?? 0) + 1)
    }
    for (const value of terms.form ?? []) {
      if (!counts.has(value)) {
        counts.set(value, 0)
      }
    }
    return [...counts]
      .map(([value, count]) => ({ value, label: toolTypeLabel(value), count }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [tools, terms.form])
  const hidden = useMemo(
    () =>
      hiddenColumns ??
      TOOL_COLUMNS.filter((column) => !column.default).map((column) => column.code),
    [hiddenColumns],
  )
  const shown = useMemo(() => shownColumns(hidden, columnOrder), [hidden, columnOrder])
  /**
   * **A page of rows, not the whole catalog.**
   *
   * With no feature selected the list is every tool the filters admit — 4,697
   * on a real dataset — and a table that draws them all takes nearly three
   * seconds to paint and re-lays out on every keystroke (Paul, 2026-08-31:
   * "things are running really slowly"). The list is ranked, so the first page
   * is the best of it, and the line under it says what is left rather than
   * truncating in silence.
   */
  const drawn = useMemo(() => tools.slice(0, PAGE), [tools])

  if (tools.length === 0) {
    return (
      <p className="p-6 text-sm text-zinc-400">
        No tool in the catalog matches every part of this selection.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full table-fixed border-collapse text-sm">
        <caption className="sr-only">Tools matching the current selection</caption>
        <thead data-list-chrome>
          <tr className="text-2xs border-b border-zinc-800 text-left tracking-wide text-zinc-400 uppercase">
            <th scope="col" className={classNames(COLUMN_WIDTH.name, 'px-3 py-2 font-semibold')}>
              {onSearch ? (
                <span className="flex items-center gap-1">
                  <MagnifyingGlassIcon aria-hidden="true" className="shrink-0 text-zinc-600" />
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => onSearch(event.target.value)}
                    placeholder="Catalog number"
                    aria-label="Search by catalog number"
                    className="focus-visible:ring-info/60 text-2xs w-32 rounded border border-transparent bg-transparent px-1 py-0.5 font-sans tracking-normal text-zinc-200 normal-case placeholder:text-zinc-400 hover:border-zinc-800 focus:border-zinc-700 focus-visible:ring-1 focus-visible:outline-none"
                  />
                </span>
              ) : (
                'Catalog number'
              )}
            </th>
            <th scope="col" className={classNames(COLUMN_WIDTH.type, 'px-3 py-2 font-semibold')}>
              {onRailFilter && railKeys.form !== undefined ? (
                <RailHandover
                  label="Type"
                  set={(terms.form ?? []).length > 0}
                  onOpen={() => onRailFilter(railKeys.form ?? 'form')}
                />
              ) : onTerm ? (
                <TermColumnFilter
                  label="Type"
                  options={forms}
                  chosen={terms.form ?? []}
                  onChosen={(values) => onTerm('form', values)}
                />
              ) : (
                'Type'
              )}
            </th>
            {shown.map((column) => (
              <th
                key={column.code}
                scope="col"
                className={classNames(
                  COLUMN_WIDTH.value,
                  'px-3 py-2 font-semibold',
                  isHolding(column.code) ? 'text-left' : 'text-right',
                )}
              >
                {/* Neither a range nor an order means anything on a column
                    that holds a choice rather than a measurement. */}
                {isHolding(column.code) || isStack(column.code) ? (
                  column.label
                ) : (
                  <span className="flex items-center justify-end gap-1">
                    {onRailFilter && railKeys[column.code] !== undefined ? (
                      <RailHandover
                        label={column.label}
                        set={ranges[column.code] !== undefined}
                        onOpen={() => onRailFilter(railKeys[column.code] ?? column.code)}
                      />
                    ) : onRange ? (
                      <ColumnFilter
                        label={column.label}
                        bound={ranges[column.code]}
                        onBound={(bound) => onRange(column.code, bound)}
                        unit={unit}
                        kind={kindOf(column.code)}
                      />
                    ) : (
                      column.label
                    )}
                    {onSort ? (
                      <SortButton
                        label={column.label}
                        sort={sort}
                        code={column.code}
                        onSort={onSort}
                      />
                    ) : null}
                  </span>
                )}
              </th>
            ))}
            {onBom ? (
              <th scope="col" className={classNames(COLUMN_WIDTH.bom, 'px-3 py-2 font-semibold')}>
                <span className="sr-only">Order list</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {drawn.map((tool) => {
            const here = inBom?.(tool) ?? false
            const elsewhere = !here && (keptElsewhere?.(tool) ?? false)
            /**
             * **Once per row, not once per cell.** `marks` walks the rules for
             * a tool, and calling it from inside the column loop ran it once
             * per column — four thousand rows deep that is fifty thousand
             * walks per render (Paul, 2026-08-31: "things are running really
             * slowly").
             */
            const rowMarks = marks?.(tool) ?? {}
            return (
              <tr
                key={tool.guid}
                onClick={onChoose ? () => onChoose(tool) : undefined}
                aria-selected={chosen === undefined ? undefined : chosen === tool.guid}
                className={[
                  'border-b border-zinc-900 hover:bg-info/10',
                  onChoose ? 'cursor-pointer' : '',
                  chosen === tool.guid ? 'bg-info/25' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <th
                  scope="row"
                  className={classNames(
                    'px-3 py-2 text-left font-normal',
                    nearest ? 'opacity-80' : '',
                  )}
                >
                  {nearest ? (
                    <span
                      className="text-2xs mr-1.5 rounded border border-amber-500/40 px-1 py-0.5 align-middle text-amber-300"
                      title="Nothing in the crib fits this feature; this is one of the closest, and the columns say what stops it"
                    >
                      near miss
                    </span>
                  ) : null}
                  {/* Where the page has somewhere to put a tool, the number
                    chooses it rather than navigating: leaving the part to read
                    a tool loses the selection that produced the list. */}
                  {onChoose ? (
                    <button
                      type="button"
                      onClick={(event) => {
                        // The row is clickable too; letting this bubble would
                        // choose the same tool twice on one click.
                        event.stopPropagation()
                        onChoose(tool)
                      }}
                      className="font-mono text-zinc-100 underline-offset-2 hover:underline"
                    >
                      {tool.catalogNumber}
                    </button>
                  ) : (
                    <Link
                      to={`/tools/${tool.guid}`}
                      className="font-mono text-zinc-100 underline-offset-2 hover:underline"
                    >
                      {tool.catalogNumber}
                    </Link>
                  )}
                  <span className="ml-2 text-xs text-zinc-500">{tool.brand}</span>
                  {/* Where to buy it, on the name it is bought by. */}
                  {tool.productLink === null ? null : (
                    <a
                      href={tool.productLink}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-label={`Open ${tool.catalogNumber} at the vendor`}
                      title="The vendor's page"
                      onClick={(event) => event.stopPropagation()}
                      className="text-info/80 hover:text-info focus-visible:ring-info/60 ml-1.5 inline-flex rounded align-middle focus-visible:ring-1 focus-visible:outline-none"
                    >
                      <ArrowSquareOutIcon aria-hidden="true" />
                    </a>
                  )}
                </th>
                {/*
                  **Clipped, like every other cell.** "Reduced shank bull nose
                  end mill" is wider than the column, and the row is `nowrap`,
                  so it painted straight across the diameter beside it (Paul,
                  2026-09-01). The whole of it is on the title.
                */}
                <td className="overflow-hidden px-3 py-2 text-zinc-300">
                  <span
                    className="flex items-center gap-1.5 whitespace-nowrap"
                    title={formLabel(tool)}
                  >
                    <span className="shrink-0 text-zinc-500">
                      <ToolTypeIcon toolType={tool.form} />
                    </span>
                    <span className="min-w-0 truncate">{formLabel(tool)}</span>
                  </span>
                </td>
                {shown.map((column) => {
                  if (isStack(column.code)) {
                    /**
                     * **The tool's own length below the holder, until a holder
                     * says otherwise** (Paul, 2026-09-01).
                     *
                     * On its own a tool stands out by what its shank allows —
                     * the overall length less the clamping length. Choose a
                     * holder and the part decides instead: the stack has to
                     * come out far enough to clear it, and where that is a
                     * different number the cell says so rather than quietly
                     * showing a figure nobody entered.
                     */
                    const own = tool.geometry.LBH
                    const needed = holding?.requiredStickout(tool) ?? null
                    const picked = holding?.chosen(tool).holderGuid ?? null
                    const cannot = holding?.reachNote?.(tool) ?? null
                    const changed =
                      own !== undefined && needed !== null && Math.abs(needed - own) > 0.005
                    const over = changed && needed !== null && own !== undefined && needed > own
                    return (
                      <td
                        key={column.code}
                        className="overflow-hidden px-3 py-2 text-right font-mono text-zinc-300"
                      >
                        {/*
                          **The number first, the trouble under it** (Paul,
                          2026-09-01). Why nothing holds it is worth saying,
                          and it was saying it *instead of* the length — which
                          took the column's own number off exactly the rows
                          somebody is trying to work out.
                        */}
                        {cannot !== null ? (
                          <span className="flex flex-col items-end leading-tight">
                            <span>
                              {own === undefined ? '—' : formatGeometry('LBH', own, unit)}
                            </span>
                            <span className="text-2xs font-sans text-amber-300">{cannot}</span>
                          </span>
                        ) : needed !== null ? (
                          <span className="flex items-baseline justify-end gap-1.5 whitespace-nowrap">
                            {changed ? (
                              <span
                                className={classNames(
                                  'text-2xs font-sans',
                                  over ? 'text-amber-300' : 'text-info',
                                )}
                                title={
                                  own === undefined
                                    ? 'What this holder needs to clear the part'
                                    : `The tool alone stands out ${formatGeometry('LBH', own, unit)}; this holder needs ${formatGeometry('LBH', needed, unit)} to clear the part`
                                }
                              >
                                {over ? 'holder needs' : 'holder'}
                              </span>
                            ) : null}
                            <span>{formatGeometry('LBH', needed, unit)}</span>
                          </span>
                        ) : own !== undefined ? (
                          <span
                            title={
                              holding === undefined || picked !== null
                                ? 'The overall length less the shank held'
                                : 'The overall length less the shank held — pick a holder and the part decides instead'
                            }
                          >
                            {formatGeometry('LBH', own, unit)}
                          </span>
                        ) : (
                          <span className="text-2xs font-sans text-zinc-600">—</span>
                        )}
                      </td>
                    )
                  }
                  if (isHolding(column.code)) {
                    return (
                      <td key={column.code} className="px-3 py-2">
                        {holding === undefined ? (
                          <span className="text-zinc-600">—</span>
                        ) : (
                          <HoldingCell tool={tool} code={column.code} holding={holding} />
                        )}
                      </td>
                    )
                  }
                  const value = tool.geometry[column.code]
                  const mark = marks?.(tool)[column.code]
                  return (
                    <td
                      key={column.code}
                      className={classNames(
                        // **Clipped, not spilled.** A note longer than its
                        // column used to paint straight across the next two
                        // (Paul, 2026-09-01): the row is `nowrap`, so nothing
                        // stopped it. It truncates inside its own cell now,
                        // with the whole of it on the title.
                        'overflow-hidden px-3 py-2 text-right font-mono',
                        // A caution is not a refusal: amber for a `should`,
                        // red only for the rule that took the tool off the list.
                        mark && !mark.ok
                          ? mark.level === 'must'
                            ? 'text-danger'
                            : 'text-amber-300'
                          : 'text-zinc-300',
                      )}
                    >
                      <span className="flex items-baseline justify-end gap-1.5 whitespace-nowrap">
                        {/* Three words for what is wrong; the rule's own
                          sentence is behind them. */}
                        {mark && !mark.ok ? (
                          <span className="text-2xs" title={mark.detail}>
                            {mark.why}
                          </span>
                        ) : null}
                        {/* A fact about the column, in the colour of a fact:
                          how far a drill is off the hole it is for. */}
                        {mark?.ok && mark.note ? (
                          <span
                            className="text-2xs min-w-0 truncate text-zinc-400"
                            title={mark.note}
                          >
                            {mark.note}
                          </span>
                        ) : null}
                        {/* A dash where the vendor states nothing, rather than a
                          zero that reads as a measured value of zero — and
                          nothing at all where the words already said the
                          number this column holds. */}
                        {mark && !mark.ok && mark.instead ? null : (
                          <span>
                            {value === undefined ? '—' : formatGeometry(column.code, value, unit)}
                          </span>
                        )}
                        {/*
                        A tick means "the rules read this and it passed". A
                        caution is not that, so it is not a tick: an amber
                        check read as a green one at a glance and as a smudge
                        at 12 px (Paul, 2026-08-31). A warning glyph says at a
                        glance that this one wants a second look.
                      */}
                        {mark?.ok ? (
                          mark.caution === undefined ? (
                            <CheckIcon
                              aria-label="within the rules"
                              className="size-3 shrink-0 text-emerald-400"
                            />
                          ) : (
                            <span className="shrink-0 text-amber-300" title={mark.caution}>
                              <WarningIcon
                                weight="fill"
                                aria-label={mark.caution}
                                className="size-3.5"
                              />
                            </span>
                          )
                        ) : null}
                      </span>
                    </td>
                  )
                })}
                {onBom ? (
                  <td className="px-3 py-2">
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-pressed={here}
                        aria-label={
                          here
                            ? `Remove ${tool.catalogNumber} from the order list`
                            : elsewhere
                              ? `Also cut this feature with ${tool.catalogNumber}`
                              : `Add ${tool.catalogNumber} to the order list`
                        }
                        title={
                          elsewhere
                            ? 'Already on the bill — also use it for this feature'
                            : undefined
                        }
                        // Kept for this feature, the same button takes it back
                        // off: the row that put a tool on the bill is where
                        // somebody looks to undo it. Kept for another one, it
                        // adds this feature to the tool without asking the
                        // holder question twice (Paul, 2026-08-31).
                        onClick={(event) => {
                          event.stopPropagation()
                          if (here) {
                            onRemoveBom?.(tool)
                            return
                          }
                          if (elsewhere && onAlsoBom) {
                            onAlsoBom(tool)
                            return
                          }
                          onBom(tool, event.currentTarget.getBoundingClientRect())
                        }}
                        className={classNames(
                          'text-2xs focus-visible:ring-info/60 rounded border px-1.5 py-1 whitespace-nowrap transition focus-visible:ring-1 focus-visible:outline-none',
                          here
                            ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                            : elsewhere
                              ? 'border-info/50 bg-info/10 text-info hover:border-info/80'
                              : 'border-info/50 text-info hover:border-info/80 hover:bg-info/10 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-600 dark:hover:bg-transparent dark:hover:text-zinc-100',
                        )}
                      >
                        {here ? (
                          <span className="flex items-center gap-1">
                            <TrashIcon aria-hidden="true" />
                            On list
                          </span>
                        ) : elsewhere ? (
                          <span className="flex items-center gap-1">
                            <PlusIcon aria-hidden="true" />
                            On list
                          </span>
                        ) : (
                          'Add to list'
                        )}
                      </button>
                      {/*
                    Kept, the holder and collet are still a decision: the
                    pencil reopens the box on what was chosen rather than
                    making somebody remove the tool to change its holder
                    (Paul, 2026-08-31).
                  */}
                      {here ? (
                        <button
                          type="button"
                          aria-label={`Edit the holder and collet for ${tool.catalogNumber}`}
                          title="Edit the holder and collet"
                          onClick={(event) => {
                            event.stopPropagation()
                            onBom(tool, event.currentTarget.getBoundingClientRect())
                          }}
                          className="focus-visible:ring-info/60 hover:text-info rounded border border-transparent p-1 text-zinc-500 transition hover:border-zinc-700 focus-visible:ring-1 focus-visible:outline-none"
                        >
                          <PencilSimpleIcon aria-hidden="true" />
                        </button>
                      ) : null}
                    </span>
                  </td>
                ) : null}
              </tr>
            )
          })}
          {tools.length > drawn.length ? (
            <tr>
              <td
                colSpan={shown.length + (onBom ? 3 : 2)}
                className="text-2xs px-3 py-2 text-zinc-500"
              >
                Showing the first {String(drawn.length)} of {String(tools.length)} — narrow the
                filters to see the rest.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}
