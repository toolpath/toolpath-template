import { useState } from 'react'
import { ArrowSquareOutIcon } from '@phosphor-icons/react'
import { Badge } from '@toolpath/ui'
import { classNames } from '@toolpath/domain/class-names'
import type { CatalogTool } from '@toolpath/catalog-data'
import { formatLength, type Unit } from '@toolpath/domain/units'
import { formatGeometry } from 'shared/geometry'
import { ToolTypeIcon, formLabel } from './tool-icons'
import { ToolDrawing } from './tool-drawing'
import type { Holding } from './tool-table'

/**
 * The tool being read, beside the part.
 *
 * Paul's panel (2026-08-31): the cutter drawn on its own, the numbers it is
 * chosen on in a form somebody can read at a glance, and the two decisions
 * that finish an assembly — a holder and a collet — asked here rather than
 * only in the list. The vendor's page is a button at the top, because "where
 * do I buy this" is asked of the thing on screen.
 *
 * The long field-by-field sheet still lives on the tool's own page: this is
 * the working panel, not the reference.
 *
 * **The drawing shows the tool, or the tool and what holds it** (Paul,
 * 2026-09-01), and says so with a switch rather than by whether a holder
 * happens to have been chosen. Either way it is dimensioned — the lengths and
 * widths the vendor states, drawn on the tool the way a drawing states them.
 */

/** The numbers a tool is chosen on, in the order the question is asked. */
const KEY_CODES = ['DC', 'RE', 'LCF', 'LBH', 'LD', 'OAL', 'SFDM', 'NOF'] as const

const KEY_LABELS: Record<(typeof KEY_CODES)[number], string> = {
  DC: 'Diameter',
  RE: 'Corner radius',
  LCF: 'Flute length',
  LBH: 'Below holder',
  LD: 'L/D',
  OAL: 'Overall length',
  SFDM: 'Shank',
  NOF: 'Flutes',
}

const SELECT =
  'focus-visible:ring-info/60 w-full truncate rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 focus-visible:ring-1 focus-visible:outline-none'

export interface ToolDetailsProps {
  readonly tool: CatalogTool
  readonly unit: Unit
  /** The holder and collet for this tool, asked the same way the list asks. */
  readonly holding?: Holding | undefined
}

export const ToolDetails = ({ tool, unit, holding }: ToolDetailsProps) => {
  /**
   * Which of the two is drawn. Kept while the panel is up, so a shop reading
   * cutters does not have to say so again on every tool it clicks.
   */
  const [view, setView] = useState<'tool' | 'stack'>('stack')
  const chosen = holding?.chosen(tool) ?? { holderGuid: null, colletGuid: null }
  const holders = holding?.holdersFor(tool) ?? []
  const collets = holding?.colletsFor(tool, chosen.holderGuid) ?? []
  const needed = holding?.requiredStickout(tool) ?? null
  const holderChosen = holders.find((each) => each.guid === chosen.holderGuid)?.holder
  const stickout = holding?.stickoutFor?.(tool) ?? null

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-auto">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 shrink-0 text-zinc-400">
          <ToolTypeIcon toolType={tool.form} className="size-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-lg leading-tight font-bold text-zinc-100">
            {tool.catalogNumber}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
            {tool.brand}
            <Badge variant="secondary">{formLabel(tool)}</Badge>
          </span>
        </span>
        {tool.productLink === null ? null : (
          <a
            href={tool.productLink}
            target="_blank"
            rel="noreferrer noopener"
            className="text-2xs focus-visible:ring-info/60 border-info/40 text-info hover:border-info/70 hover:bg-info/10 inline-flex shrink-0 items-center gap-1 rounded border px-2 py-1 font-semibold whitespace-nowrap transition focus-visible:ring-1 focus-visible:outline-none"
          >
            Vendor
            <ArrowSquareOutIcon aria-hidden="true" />
          </a>
        )}
      </div>

      {/* The cutter, or the whole stack — the switch says which. */}
      <div className="flex flex-col gap-1">
        {holderChosen === undefined ? null : (
          <div className="flex justify-end gap-1">
            {(
              [
                ['tool', 'Tool'],
                ['stack', 'Tool + holder'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                onClick={() => setView(value)}
                className={classNames(
                  'text-2xs focus-visible:ring-info/60 rounded border px-2 py-0.5 transition focus-visible:ring-1 focus-visible:outline-none',
                  view === value
                    ? 'border-info/60 bg-info/15 text-info'
                    : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        <ToolDrawing
          tool={tool}
          unit={unit}
          {...(holderChosen === undefined || view === 'tool' ? {} : { holder: holderChosen })}
          stickout={stickout}
        />
      </div>

      {/* The numbers it is chosen on: two columns, big enough to read across
          the desk, each saying what it is rather than only its code. */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5">
        {KEY_CODES.flatMap((code) => {
          const value = tool.geometry[code]
          if (value === undefined) {
            return []
          }
          const provenance = tool.provenance[code]
          return [
            <div
              key={code}
              className="flex items-baseline justify-between gap-2 border-b border-zinc-900 pb-1"
              title={
                provenance && provenance !== 'vendor-stated'
                  ? `${provenance} — not the vendor's figure`
                  : 'vendor-stated'
              }
            >
              <dt className="text-2xs text-zinc-500">{KEY_LABELS[code]}</dt>
              <dd className="font-mono text-sm text-zinc-100">
                {formatGeometry(code, value, unit)}
                {provenance && provenance !== 'vendor-stated' ? (
                  <span className="ml-0.5 text-zinc-500" aria-label={provenance}>
                    °
                  </span>
                ) : null}
              </dd>
            </div>,
          ]
        })}
      </dl>

      {holding === undefined ? null : (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-2xs font-semibold tracking-wide text-zinc-500 uppercase">
              Holder
            </span>
            <select
              className={SELECT}
              value={chosen.holderGuid ?? ''}
              onChange={(event) =>
                holding.onChoose(tool, {
                  holderGuid: event.target.value === '' ? null : event.target.value,
                  colletGuid: null,
                })
              }
            >
              <option value="">No holder</option>
              {holders.map((each) => (
                <option key={each.guid} value={each.guid}>
                  {each.label}
                  {each.trouble === null ? '' : ` · ${each.trouble}`}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-2xs font-semibold tracking-wide text-zinc-500 uppercase">
              Collet
            </span>
            <select
              className={SELECT}
              disabled={collets.length === 0}
              value={chosen.colletGuid ?? ''}
              onChange={(event) =>
                holding.onChoose(tool, {
                  holderGuid: chosen.holderGuid,
                  colletGuid: event.target.value === '' ? null : event.target.value,
                })
              }
            >
              <option value="">No collet</option>
              {collets.map((each) => (
                <option key={each.guid} value={each.guid}>
                  {each.label}
                </option>
              ))}
            </select>
          </label>
          {needed === null ? null : (
            <p className="text-2xs text-zinc-500">
              This stack has to stand out{' '}
              <span className="font-mono text-zinc-300">{formatLength(needed, unit)}</span> to clear
              the part.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
