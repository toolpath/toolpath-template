import { Button } from '@toolpath/ui'
import { colletsFor, isOnSize, type CatalogTool, type Collet } from '@toolpath/catalog-data'
import { classNames } from '@toolpath/domain/class-names'
import { formatLength, type Unit } from '@toolpath/domain/units'
import type { Verdict } from 'shared/judge'
import { describeGrade, type HolderOption } from 'shared/holder-choice'
import { collets as allCollets } from 'shared/catalog'
import { ToolTypeIcon, formLabel } from './tool-icons'

/**
 * The tools that cut the feature, each as an assembly, best first.
 *
 * Paul's layout (2026-08-29): the goal is the tool *assembly* as quickly as
 * possible, so the list leads with it. One row is one tool with the holder
 * the rules recommend and the collet that fits, both changeable in place, and
 * a way to keep the stack. Beside the tool, **why** it is a good match — what
 * the sheet's rank rows read off it, and any warning or demotion — coloured
 * by its standing. When fewer than the wanted number fit, the nearest misses
 * follow, marked incompatible and saying by how much.
 *
 * Clicking a row draws it; changing its holder or collet draws that at once.
 */

export type Standing = 'fits' | 'warned' | 'demoted' | 'close'

export interface RecommendationRow {
  readonly verdict: Verdict
  readonly standing: Standing
  /** Every way to hold it for this feature, recommended first. */
  readonly options: ReadonlyArray<HolderOption>
  readonly holderGuid: string | null
  readonly colletGuid: string | null
  readonly saved: boolean
}

export interface RecommendationTableProps {
  readonly rows: ReadonlyArray<RecommendationRow>
  readonly unit: Unit
  readonly chosen: string | null
  readonly onChoose: (tool: CatalogTool) => void
  readonly onHolder: (tool: CatalogTool, holderGuid: string | null) => void
  readonly onCollet: (tool: CatalogTool, colletGuid: string | null) => void
  readonly onSave: (tool: CatalogTool) => void
}

const STANDING: Record<Standing, { label: string; className: string }> = {
  fits: { label: 'fits', className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' },
  warned: {
    label: 'fits, with a warning',
    className: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  },
  demoted: {
    label: 'fits, not preferred',
    className: 'border-zinc-600 bg-zinc-800/60 text-zinc-300',
  },
  close: {
    label: 'incompatible, but close',
    className: 'border-red-500/40 bg-red-500/10 text-red-300',
  },
}

const GRADE: Record<HolderOption['grade'], string> = {
  good: 'text-emerald-300',
  medium: 'text-amber-300',
  bad: 'text-red-300',
}

const SELECT =
  'h-7 min-w-0 max-w-full truncate rounded border border-zinc-700 bg-zinc-950 px-1.5 text-xs text-zinc-100 focus-visible:ring-info/60 focus-visible:ring-1 focus-visible:outline-none'

const shortReason = (text: string): string => text.split(' — ')[0] ?? text

/** The stickouts that clear this feature, or why none do. */
const describeRange = (option: HolderOption, unit: Unit): string => {
  const { range } = option
  if (!range) {
    return ''
  }
  if (range.max !== null && range.min > range.max + 1e-6) {
    return ` — needs ${formatLength(range.min, unit)}, over the ${formatLength(range.max, unit)} the tool allows`
  }
  return ` (${formatLength(range.min, unit)} – ${range.max === null ? 'no limit' : formatLength(range.max, unit)})`
}

export const RecommendationTable = ({
  rows,
  unit,
  chosen,
  onChoose,
  onHolder,
  onCollet,
  onSave,
}: RecommendationTableProps) => (
  <table className="w-full border-separate border-spacing-0 text-xs">
    <thead className="text-2xs sticky top-0 z-10 bg-zinc-950 text-left font-semibold tracking-wide text-zinc-500 uppercase">
      <tr>
        <th className="px-3 py-1.5">Tool</th>
        <th className="px-3 py-1.5">Why</th>
        <th className="px-3 py-1.5">Holder</th>
        <th className="px-3 py-1.5">Collet</th>
        <th className="px-3 py-1.5" />
      </tr>
    </thead>
    <tbody>
      {rows.map((row) => {
        const { tool } = row.verdict
        const option =
          row.options.find((each) => each.holder.guid === row.holderGuid) ??
          row.options.find((each) => each.recommended) ??
          row.options[0] ??
          null
        const collets: ReadonlyArray<Collet> = option
          ? colletsFor(tool, option.holder, allCollets)
          : []
        const collet =
          collets.find((each) => each.guid === row.colletGuid) ?? option?.collet ?? null
        const standing = STANDING[row.standing]
        const notes = [...row.verdict.removed, ...row.verdict.warned, ...row.verdict.demoted].map(
          (reason) => shortReason(reason.text),
        )
        const selected = chosen === tool.guid
        return (
          <tr
            key={tool.guid}
            data-tool={tool.guid}
            data-standing={row.standing}
            aria-selected={selected}
            onClick={() => onChoose(tool)}
            className={classNames(
              'cursor-pointer align-top transition',
              selected ? 'bg-info/10' : 'hover:bg-zinc-900/70',
            )}
          >
            <td className="border-b border-zinc-900 px-3 py-2">
              <span className="flex items-center gap-2">
                <span className="text-zinc-400">
                  <ToolTypeIcon toolType={tool.form} className="size-5" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-mono font-semibold text-zinc-100">
                    {tool.catalogNumber}
                  </span>
                  <span className="text-2xs block text-zinc-500">
                    {tool.brand} · {formLabel(tool)}
                    {tool.geometry.DC !== undefined
                      ? ` · ⌀${formatLength(tool.geometry.DC, unit)}`
                      : ''}
                    {tool.geometry.LCF !== undefined
                      ? ` · ${formatLength(tool.geometry.LCF, unit)} flute`
                      : ''}
                  </span>
                </span>
              </span>
            </td>
            <td className="border-b border-zinc-900 px-3 py-2">
              <span
                className={classNames(
                  'text-2xs inline-block rounded border px-1.5 py-0.5 font-semibold',
                  standing.className,
                )}
              >
                {standing.label}
              </span>
              <span className="text-2xs mt-1 block text-zinc-400">
                {row.verdict.readings.join(' · ')}
              </span>
              {notes.length > 0 ? (
                <span className="text-2xs mt-0.5 block text-zinc-500">{notes.join(' · ')}</span>
              ) : null}
            </td>
            <td className="border-b border-zinc-900 px-3 py-2">
              {row.options.length === 0 ? (
                <span className="text-2xs text-zinc-500">nothing in the crib holds this shank</span>
              ) : (
                <span className="flex flex-col gap-0.5">
                  <select
                    aria-label={`Holder for ${tool.catalogNumber}`}
                    className={SELECT}
                    value={option?.holder.guid ?? ''}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => {
                      onChoose(tool)
                      onHolder(tool, event.target.value === '' ? null : event.target.value)
                    }}
                  >
                    {row.options.map((each) => (
                      <option key={each.holder.guid} value={each.holder.guid}>
                        {each.holder.catalogNumber}
                        {each.recommended ? ' · recommended' : ''}
                        {each.grade === 'good' ? '' : ` · ${each.grade}`}
                      </option>
                    ))}
                  </select>
                  {option ? (
                    <span className={classNames('text-2xs', GRADE[option.grade])}>
                      {[
                        option.stickout !== null
                          ? `${formatLength(option.stickout, unit)} out${describeRange(option, unit)}`
                          : '',
                        describeGrade(option),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  ) : null}
                </span>
              )}
            </td>
            <td className="border-b border-zinc-900 px-3 py-2">
              {option === null ? null : collets.length === 0 ? (
                <span className="text-2xs text-zinc-500">
                  {option.holder.clamping === 'collet' ? 'no collet fits' : 'no collet needed'}
                </span>
              ) : (
                <select
                  aria-label={`Collet for ${tool.catalogNumber}`}
                  className={SELECT}
                  value={collet?.guid ?? ''}
                  onClick={(event) => event.stopPropagation()}
                  onChange={(event) => {
                    onChoose(tool)
                    onCollet(tool, event.target.value === '' ? null : event.target.value)
                  }}
                >
                  {collets.map((each) => (
                    <option key={each.guid} value={each.guid}>
                      {each.catalogNumber}
                      {tool.geometry.SFDM !== undefined && isOnSize(each, tool.geometry.SFDM)
                        ? ' · on-size'
                        : ''}
                    </option>
                  ))}
                </select>
              )}
            </td>
            <td className="border-b border-zinc-900 px-3 py-2 text-right">
              <Button
                size="sm"
                variant={row.saved ? 'secondary' : 'primary'}
                disabled={option === null}
                onClick={(event) => {
                  event.stopPropagation()
                  onChoose(tool)
                  onSave(tool)
                }}
              >
                {row.saved ? 'Saved' : 'Save assembly'}
              </Button>
            </td>
          </tr>
        )
      })}
    </tbody>
  </table>
)
