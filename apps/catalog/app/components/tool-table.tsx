import { useMemo } from 'react'
import type { CatalogTool } from '@toolpath/catalog-data'
import { GEOMETRY_FIELDS } from '@toolpath/catalog-data'
import { Link } from 'react-router'
import type { Unit } from '@toolpath/domain/units'
import { formatGeometry } from 'shared/geometry'
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
  { code: 'LCF', label: 'Flute length', default: true },
  { code: 'LBH', label: 'Below holder', default: false },
  { code: 'LD', label: 'L/D', default: true },
  { code: 'OAL', label: 'Overall length', default: true },
  { code: 'RE', label: 'Corner radius', default: true },
  { code: 'NOF', label: 'Flutes', default: true },
  { code: 'SFDM', label: 'Shank', default: true },
  { code: 'SIG', label: 'Point angle', default: false },
  { code: 'LU', label: 'Usable length', default: false },
] as const

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
  const shown = useMemo(
    () => TOOL_COLUMNS.filter((column) => !hidden.includes(column.code)),
    [hidden],
  )

  if (tools.length === 0) {
    return (
      <p className="p-6 text-sm text-zinc-400">
        No tool in the catalog matches every part of this selection.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">Tools matching the current selection</caption>
        <thead>
          <tr className="text-2xs border-b border-zinc-800 text-left tracking-wide text-zinc-400 uppercase">
            <th scope="col" className="px-3 py-2 font-semibold">
              Catalog number
            </th>
            <th scope="col" className="px-3 py-2 font-semibold">
              {onTerm ? (
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
              <th key={column.code} scope="col" className="px-3 py-2 text-right font-semibold">
                {onRange ? (
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
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tools.map((tool) => (
            <tr
              key={tool.guid}
              onClick={onChoose ? () => onChoose(tool) : undefined}
              aria-selected={chosen === undefined ? undefined : chosen === tool.guid}
              className={[
                'border-b border-zinc-900 hover:bg-zinc-900/50',
                onChoose ? 'cursor-pointer' : '',
                chosen === tool.guid ? 'bg-info/10' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <th scope="row" className="px-3 py-2 text-left font-normal">
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
              </th>
              <td className="px-3 py-2 text-zinc-300">
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className="text-zinc-500">
                    <ToolTypeIcon toolType={tool.form} />
                  </span>
                  {formLabel(tool)}
                </span>
              </td>
              {shown.map((column) => {
                const value = tool.geometry[column.code]
                return (
                  <td key={column.code} className="px-3 py-2 text-right font-mono text-zinc-300">
                    {/* A dash where the vendor states nothing, rather than a
                        zero that reads as a measured value of zero. */}
                    {value === undefined ? '—' : formatGeometry(column.code, value, unit)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
