import { useState } from 'react'
import { ArrowSquareOutIcon, TrashIcon } from '@phosphor-icons/react'
import { Badge } from '@toolpath/ui'
import { classNames } from '@toolpath/domain/class-names'
import type { CatalogTool } from '@toolpath/catalog-data'
import { formatLength, type Unit } from '@toolpath/domain/units'
import { formatGeometry } from 'shared/geometry'
import { getFamily } from 'shared/catalog'
import { ToolTypeIcon, formLabel } from './tool-icons'
import { AssemblyDrawing } from './assembly-drawing'
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
  /**
   * Keeping the tool, from the panel it was assembled in.
   *
   * **The list no longer offers it** (Paul, 2026-09-01): a row is a tool to
   * read, and what gets ordered is a tool *with* a holder and a collet — which
   * is a decision made here, so the button that finishes it is here too.
   */
  readonly onSave?: () => void
  readonly saved?: boolean
  readonly onRemove?: () => void
}

export const ToolDetails = ({ tool, unit, holding, onSave, saved, onRemove }: ToolDetailsProps) => {
  const family = getFamily(tool.familyId)
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
    /*
      **The panel is a grey wash, and everything on it floats** (Paul,
      2026-09-01): the head, the two selections, the sheet the tool is drawn
      on and the numbers each sit on their own surface, in the tone the table's
      rows are. The padding is also what keeps a square-cornered band out of
      the card's rounded corner.
    */
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden rounded-xl bg-zinc-900/60 p-2">
      {/*
        **What it is, then who makes it** (Paul, 2026-09-01): the number a shop
        orders by, and under it the vendor, the family it belongs to and what
        kind of tool it is. The button that keeps it sits in the corner, where
        a save belongs.
      */}
      {/*
        Lit, because it is the tool the rest of the panel is about (Paul,
        2026-09-01) — the same blue a chosen row is lit in, so the panel and
        the table agree about what is being read.
      */}
      <div className="bg-info/15 border-info/30 flex items-start gap-2 rounded-md border px-2 py-1.5">
        <span className="mt-0.5 shrink-0 text-zinc-400">
          <ToolTypeIcon toolType={tool.form} className="size-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-lg leading-tight font-bold text-zinc-100">
            {tool.catalogNumber}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-400">
            {tool.productLink === null ? (
              <span>{tool.brand}</span>
            ) : (
              <a
                href={tool.productLink}
                target="_blank"
                rel="noreferrer noopener"
                title="The vendor's page"
                className="text-info/90 hover:text-info focus-visible:ring-info/60 inline-flex items-center gap-1 rounded focus-visible:ring-1 focus-visible:outline-none"
              >
                {tool.brand}
                <ArrowSquareOutIcon aria-hidden="true" />
              </a>
            )}
            {family === null ? null : (
              <span className="min-w-0 truncate" title={`Family: ${family.name}`}>
                {family.name}
              </span>
            )}
            <Badge variant="secondary">{formLabel(tool)}</Badge>
          </span>
        </span>
        {onSave === undefined ? null : (
          <button
            type="button"
            onClick={() => {
              if (saved === true) {
                onRemove?.()
                return
              }
              onSave()
            }}
            /*
              **Green, bold, and on its own ground** (Paul, 2026-09-01): the
              button that keeps a tool is the one thing in this panel somebody
              presses, and the blue wash behind it was tinting it. The solid
              surface underneath is what keeps it the colour it is.
            */
            className={classNames(
              'text-2xs focus-visible:ring-info/60 inline-flex shrink-0 items-center gap-1 rounded border-2 bg-zinc-950 px-2 py-1 font-bold whitespace-nowrap transition focus-visible:ring-1 focus-visible:outline-none',
              saved === true
                ? 'border-emerald-500 text-emerald-500 hover:bg-emerald-500/10'
                : 'border-emerald-600 text-emerald-600 hover:border-emerald-500 hover:text-emerald-500',
            )}
          >
            {saved === true ? (
              <>
                <TrashIcon aria-hidden="true" />
                On list
              </>
            ) : (
              'Add to list'
            )}
          </button>
        )}
      </div>

      {/*
        **Holding first, because it changes the picture below it.** The tool is
        assembled here: a holder and a collet, then what that stack looks like,
        then the numbers (Paul, 2026-09-01).
      */}
      {holding === undefined ? null : (
        <div className="flex flex-col gap-2">
          {/* No label over either: the select says which it is (Paul, 2026-09-01). */}
          <select
            aria-label="Holder"
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
          <select
            aria-label="Collet"
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
          {needed === null ? null : (
            <p className="text-2xs text-zinc-500">
              This stack has to stand out{' '}
              <span className="font-mono text-zinc-300">{formatLength(needed, unit)}</span> to clear
              the part.
            </p>
          )}
        </div>
      )}
      {/*
        **The drawing takes the room** (Paul, 2026-09-01). It was a fixed 16 rem
        in a panel half a screen tall, which is a thumbnail of the one thing
        the panel exists to show. It fills what the head, the holding and the
        numbers leave.
      */}
      <div className="flex min-h-0 flex-1 flex-col gap-1">
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
        {/*
          **The same drawing the rest of the application draws** (Paul,
          2026-09-01): flutes gold, the shank and the shaft grey, the corner
          radius on the corner, and every stated length dimensioned — a
          silhouette of its own could not have any of that without keeping a
          second copy of all of it in step.
        */}
        {/*
          **A white sheet, in a grey wash** (Paul, 2026-09-01): the drawing is
          a sheet of paper, and the room the panel has left around it is the
          same tone the table's rows are — so the sheet reads as a thing on the
          panel rather than as the panel itself.
        */}
        <div className="flex min-h-0 flex-1 flex-col">
          <AssemblyDrawing
            tool={tool}
            unit={unit}
            dimensions
            dimensionSides="both"
            {...(holderChosen === undefined || view === 'tool' || stickout === null
              ? {}
              : {
                  assembly: {
                    tool,
                    holder: holderChosen,
                    collet: null,
                    stickout,
                    maxStickout: null,
                  },
                })}
          />
        </div>
      </div>

      {/* The numbers it is chosen on, at the bottom: two columns, big enough
          to read across the desk, each saying what it is rather than only its
          code (Paul, 2026-09-01). */}
      <dl className="grid shrink-0 grid-cols-2 gap-x-4 gap-y-1.5 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-2">
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
                  /*
                    **A footnote mark, not a unit** (Paul, 2026-09-01: "L/D
                    ratio in tool details shows a degree sign instead of a X").
                    The degree sign after a number reads as degrees, and the two
                    figures this catalog derives — the L/D and the length below
                    the holder — are exactly the two it sat on.
                  */
                  <sup className="ml-0.5 text-zinc-500" aria-label={provenance}>
                    *
                  </sup>
                ) : null}
              </dd>
            </div>,
          ]
        })}
      </dl>
    </div>
  )
}
