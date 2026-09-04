import { useState } from 'react'
import { ArrowSquareOutIcon } from '@phosphor-icons/react'
import { Badge, cn } from '@toolpath/ui'
import { NO_MARGINS, type CatalogTool, type Margins } from '@toolpath/catalog-data'
import type { ReachCurve } from '@toolpath/part-contracts'
import { formatLength, type UnitSystem } from '@toolpath/tool-support'
import { formatGeometry } from 'shared/geometry'
import { getFamily } from 'shared/catalog'
import { drawnAssembly } from 'shared/drawn-assembly'
import { thresholdsFrom } from 'shared/holder-choice'
import { ToolTypeIcon, formLabel } from './tool-icons'
import { MeasurementIcon } from './feature-icons'
import { CatalogDrawing } from './catalog-drawing'

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

/**
 * What each number is called, and the code the drawing calls it by.
 *
 * **Both** (Paul, 2026-09-01: "show the abbreviation for each dimension shown
 * in the 2d tool visualization alongside the name in the table"). The drawing
 * is dimensioned in ISO 13399's codes and the table was named in English, so
 * pairing a figure with its line meant knowing that "Shank" is `SFDM`.
 */
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

/**
 * The codes the drawing has no line for, so the table shows no code for them.
 *
 * A ratio and a count are not dimensions: nothing on a drawing runs between
 * two points and measures four flutes. The chip is the pointer at a line, and
 * a chip pointing at nothing is worse than none.
 *
 * `RE` is the near miss and stays: the corner radius is a real measurement the
 * drawing puts on the corner, and it is the one key number with no dimension
 * line of its own — so its chip names a thing on the sheet, and hovering it
 * lights nothing, which is the truth.
 */
const UNLETTERED: ReadonlySet<string> = new Set(['LD', 'NOF'])

const SELECT =
  'focus-visible:ring-info/60 w-full truncate rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 focus-visible:ring-1 focus-visible:outline-none'

/**
 * Room for the material on this panel's sheet, in pixels.
 *
 * The drawing card's own figure is `MATERIAL_ROOM`, 240, which is right on a
 * full-width `h-96` card and wrong here: this panel is a column beside the
 * part, `minSize={280}` wide and around 400 tall, and the package caps every
 * flank at 0.6 of the axis — so 240 was the whole allowance, taken from the
 * assembly and from the dimension bands that share it (2026-09-03). About a
 * third of the short axis leaves the tool the sheet and the material a band
 * wide enough to read.
 */
const PANEL_MATERIAL_ROOM = 130

export interface ToolDetailsProps {
  readonly tool: CatalogTool
  readonly unit: UnitSystem
  /** The holder and collet for this tool, asked the same way the list asks. */
  readonly holding?: Holding | undefined
  /**
   * Keeping the tool, from the panel it was assembled in.
   *
   * **The list no longer offers it** (Paul, 2026-09-01): a row is a tool to
   * read, and what gets ordered is a tool *with* a holder and a collet — which
   * is a decision made here, so the button that finishes it is here too.
   */
  /**
   * What can be done with this tool, given what is being asked about.
   *
   * **Handed in rather than worked out here** (Paul, 2026-09-02, on a feature
   * holding more than one tool): which of add, update, remove, replace and
   * "add this one too" apply is four sentences about the *list*, and
   * `shared/tool-actions` is where they are said and tested. This panel draws
   * them.
   */
  readonly actions?: ReadonlyArray<{
    readonly key: string
    readonly label: string
    readonly onClick: () => void
    readonly danger?: boolean
  }>
  /**
   * The features on the list this tool is already cutting, by name.
   *
   * **A tool that is on the bill says what it is on the bill for** (Paul,
   * 2026-09-02: "if I open a tool that is mapped to features, I want to see
   * which features"). The panel showed a tool as if it were a page in the
   * catalog, whichever decisions had been made with it.
   */
  readonly mappedTo?: ReadonlyArray<string>
  /**
   * The material around the feature, read off the row being answered.
   *
   * **The section beside the tool is back** (2026-09-03). The panel drew the
   * cutter against nothing from 2026-08-31, while the page had the curve in
   * hand and spent it on the holder list — so the one place a shop looks at a
   * tool showed no reason for the stickout the list had settled on. With it,
   * the sheet carries the part wall, the tightest gaps, and the verdict the
   * list sorted on.
   */
  readonly curve?: ReachCurve | null
  /** Room the shop wants kept between the stack and the part. */
  readonly margins?: Margins
}

export const ToolDetails = ({
  tool,
  unit,
  holding,
  actions = [],
  mappedTo = [],
  curve = null,
  margins = NO_MARGINS,
}: ToolDetailsProps) => {
  const family = getFamily(tool.familyId)
  /**
   * Which of the two is drawn. Kept while the panel is up, so a shop reading
   * cutters does not have to say so again on every tool it clicks.
   */
  const [view, setView] = useState<'tool' | 'stack'>('stack')
  /**
   * The number the reader is pointing at, by ISO 13399 code.
   *
   * **The drawing letters nothing** as of `@toolpath/tool-drawing` 0.2.0: the
   * six two-line figures were fighting for the margin of a panel that already
   * had the same six numbers in the table below, so the linework stayed and
   * the naming moved here. Which line is which is now answered by pointing —
   * the card lights its line, and the line lights its card.
   *
   * One piece of state for both directions, so the two can never disagree
   * about what is lit.
   */
  const [pointed, setPointed] = useState<string | null>(null)
  const chosen = holding?.chosen(tool) ?? { holderGuid: null, colletGuid: null }
  const holders = holding?.holdersFor(tool) ?? []
  const collets = holding?.colletsFor(tool, chosen.holderGuid) ?? []
  /**
   * What the stack has to stand out to clear, from the list rather than the
   * drawing. `drawnAssembly` works the same number out as `drawn.required`,
   * and this is the one shown: the tool list was sorted and graded on
   * `holding`'s, so printing the drawing's beside a list ordered by the
   * other would be two answers to one question.
   */
  const needed = holding?.requiredStickout(tool) ?? null
  const holderChosen = holders.find((each) => each.guid === chosen.holderGuid)?.holder
  const stickout = holding?.stickoutFor?.(tool) ?? null
  /**
   * The stack, worked out where every other page works it out.
   *
   * **One assembly, not two** (2026-09-03). This panel built its own inline,
   * with the collet hardcoded to `null` and no stickout ceiling — which was
   * cosmetic only while the sheet drew the tool against nothing. The moment a
   * curve arrives it stops being: the drawing asks `clearance()` about the
   * stack it is given, so an assembly missing its collet would print gaps for
   * a stack nobody picked. `shared/drawn-assembly` is the one place that stack
   * is worked out, and its own header says why.
   *
   * The holder is handed in rather than looked up in the crib, so the panel
   * draws the holder it *offered*: `holdersFor` is already filtered by what
   * the rail asks for, and a holder that has dropped off that list is one the
   * panel has always drawn nothing for.
   */
  const drawn = drawnAssembly(
    tool,
    { holder: chosen.holderGuid, collet: chosen.colletGuid, stickout },
    curve,
    margins,
    thresholdsFrom(),
    holderChosen === undefined ? [] : [holderChosen],
  )
  /** Whether the sheet below is the stack rather than the bare tool. */
  const drawnAsStack = drawn.assembly !== null && view === 'stack'

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
        {actions.length === 0 ? null : (
          <span className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
            {actions.map((action) => (
              <button
                key={action.key}
                type="button"
                onClick={action.onClick}
                /*
                  **Bold, and on its own ground** (Paul, 2026-09-01): these are
                  the things somebody presses in this panel, and the blue wash
                  behind it was tinting them. The solid surface underneath is
                  what keeps them the colour they are.
                */
                className={cn(
                  'text-2xs focus-visible:ring-info/60 inline-flex shrink-0 items-center gap-1 rounded border-2 bg-zinc-950 px-2 py-1 font-bold whitespace-nowrap transition focus-visible:ring-1 focus-visible:outline-none',
                  action.danger === true
                    ? 'border-danger/70 text-danger hover:border-danger hover:bg-danger/10'
                    : 'border-emerald-600 text-emerald-600 hover:border-emerald-500 hover:text-emerald-500',
                )}
              >
                {action.label}
              </button>
            ))}
          </span>
        )}
      </div>

      {/*
        **What it is cutting, where it is cutting something** (Paul,
        2026-09-02). A tool on the bill is a decision, and the decision is
        which features it was chosen for.
      */}
      {mappedTo.length === 0 ? null : (
        <p className="text-2xs text-zinc-400">
          <span className="text-zinc-500">On the list for </span>
          {mappedTo.join(', ')}
        </p>
      )}

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
            /*
              **A collet chosen first survives the holder** (Paul, 2026-09-01):
              the collet can be picked before there is a holder, and the holders
              that take it are listed first — so picking one of them and losing
              the collet would undo the step that got you there. It is dropped
              only where the new holder cannot take it.
            */
            onChange={(event) => {
              const holderGuid = event.target.value === '' ? null : event.target.value
              const kept = holding
                .colletsFor(tool, holderGuid)
                .some((each) => each.guid === chosen.colletGuid)
              holding.onChoose(tool, {
                holderGuid,
                colletGuid: kept ? chosen.colletGuid : null,
              })
            }}
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
        {drawn.holder === null ? null : (
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
                className={cn(
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
          <CatalogDrawing
            tool={tool}
            unit={unit}
            curve={curve}
            margins={margins}
            materialRoom={PANEL_MATERIAL_ROOM}
            dimensions
            dimensionSides="both"
            highlight={pointed}
            onDimensionHover={setPointed}
            assembly={drawnAsStack ? drawn.assembly : null}
          />
        </div>
      </div>

      {/* The numbers it is chosen on, at the bottom: two columns, big enough
          to read across the desk, each saying what it is rather than only its
          code (Paul, 2026-09-01). */}
      <dl className="grid shrink-0 grid-cols-2 gap-x-4 gap-y-1.5 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-2">
        {KEY_CODES.flatMap((code) => {
          /**
           * **`LBH` is whatever the drawing above is drawn at** (2026-09-03).
           * The panel printed the tool's own figure beside a drawing of the
           * stack, so a tool set out further to clear the part read as two
           * different lengths on one card — and the sheet dimensioned the one
           * it drew. Drawn as the stack, the number is the stack's; drawn
           * alone, it is the tool's own.
           */
          const asDrawn = drawnAsStack ? drawn.stickout : null
          const shown = code === 'LBH' && asDrawn !== null ? asDrawn : tool.geometry[code]
          const value = shown
          if (value === undefined) {
            return []
          }
          const provenance = code === 'LBH' && asDrawn !== null ? 'derived' : tool.provenance[code]
          return [
            <div
              key={code}
              /*
                Pointing at a number lights its line on the drawing above, and
                the drawing lights the number back. The pointer only: a card
                holds nothing focusable, so a `focus` handler here would be a
                claim about the keyboard that nothing honours. Reaching this by
                keyboard means making eight cards tab stops, which is a bigger
                question than this change.
              */
              onMouseEnter={() => setPointed(code)}
              onMouseLeave={() => setPointed(null)}
              className={cn(
                'flex items-baseline justify-between gap-2 rounded-sm border-b border-zinc-900 pb-1 transition',
                // The same blue the panel lights the tool it is about in, so
                // the sheet and the table agree about what is being pointed at.
                pointed === code ? 'bg-info/15' : null,
              )}
              title={
                provenance && provenance !== 'vendor-stated'
                  ? `${provenance} — not the vendor's figure`
                  : 'vendor-stated'
              }
            >
              <dt className="text-2xs flex min-w-0 items-center gap-1.5 text-zinc-500">
                <span className="shrink-0 text-zinc-600">
                  <MeasurementIcon measurement={code} />
                </span>
                <span className="truncate">{KEY_LABELS[code]}</span>
                {UNLETTERED.has(code) ? null : (
                  <span className="shrink-0 font-mono text-zinc-600">{code}</span>
                )}
              </dt>
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
