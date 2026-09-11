import { useState, type ReactNode } from 'react'
import { ArrowSquareOutIcon } from '@phosphor-icons/react'
import { Badge, Button, cn } from '@toolpath/ui'
import {
  NO_MARGINS,
  type CatalogTool,
  type Collet,
  type Holder,
  type Margins,
} from '@toolpath/catalog-data'
import type { ReachCurve } from '@toolpath/part-contracts'
import type { UnitSystem } from '@toolpath/tool-support'
import type { Zoom } from '@toolpath/tool-drawing'
import { formatGeometry } from 'shared/geometry'
import { getFamily } from 'shared/catalog'
import { drawnAssembly } from 'shared/drawn-assembly'
import { thresholdsFrom } from 'shared/holder-choice'
import { ToolTypeIcon, formLabel } from './tool-icons'
import { MeasurementIcon } from './feature-icons'
import { CatalogDrawing, useSheetGround } from './catalog-drawing'

/**
 * The tool being read, beside the part.
 *
 * Paul's panel (2026-08-31): the cutter drawn on its own and the numbers it
 * is chosen on, in a form somebody can read at a glance. The vendor's page is
 * a button at the top, because "where do I buy this" is asked of the thing on
 * screen.
 *
 * **It reads a tool; it does not assemble one** (2026-09-11). It carried a
 * holder dropdown and a collet dropdown from 2026-08-31, and the tool assembly
 * tree took that job on 2026-09-08 — but the pair survived in the one state
 * the tree does not cover, a panel with no feature selected, so the page still
 * had two ways to fill a slot and no rule saying which won. The dropdowns are
 * gone; `stack` is what this panel is told about a holder.
 *
 * This is the working panel, not a reference sheet: the tool's own page and
 * the standalone catalog browser were removed on 2026-09-03, so the panel
 * beside the part is the only place a tool is read.
 *
 * **The drawing shows the whole stack, and the switch over it is a zoom**
 * (2026-09-11). It used to choose between the tool and the tool with its
 * holder, which was a second answer to a question the tree already settles —
 * a panel drawing the cutter alone beside a stack the tree had fully
 * assembled. What a reader actually wanted from the *Tool* half was the
 * working end drawn bigger, and `@toolpath/tool-drawing` now frames that
 * itself: `zoom` cuts the sheet just above the holder nose rather than
 * dropping the holder out of the picture. Either way it is dimensioned — the
 * lengths and widths the vendor states, drawn on the tool the way a drawing
 * states them.
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

export interface ToolDetailsProps {
  readonly tool: CatalogTool
  readonly unit: UnitSystem
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
  /**
   * The stack around the tool, worked out by the tree that holds it.
   *
   * **The tree is the only thing that holds a tool** (Paul, 2026-09-07 for the
   * tree, 2026-09-10 for the last of the dropdowns): a holder is a slot with a
   * table of its own, and this panel offers no holding of its own at all.
   * Without this the sheet would draw the cutter on its own beside a stack the
   * tree had fully assembled; with it there is one answer rather than two that
   * can disagree.
   */
  readonly stack?: { readonly holder: Holder | null; readonly collet: Collet | null }
  /**
   * What fills the column under the drawing, in place of the tool's numbers.
   *
   * **One drawing, and only the details change** (Paul, 2026-09-07: "there
   * should really only be one view that can show tool and tool + holder, only
   * the details column should change when a different component is selected").
   * Selecting a holder in the tree used to swap the whole panel for a second
   * drawing in a box of its own — which is why that one came out lying on its
   * side, and why the zoom over the sheet vanished the moment somebody looked
   * at a holder. The sheet above is the same sheet either way; this is the
   * half that answers "which component am I reading".
   */
  readonly details?: ReactNode
}

export const ToolDetails = ({
  tool,
  unit,
  actions = [],
  mappedTo = [],
  curve = null,
  margins = NO_MARGINS,
  stack,
  details,
}: ToolDetailsProps) => {
  const family = getFamily(tool.familyId)
  /**
   * How much of the stack the sheet is framed to. Kept while the panel is up,
   * so a shop reading cutters does not have to say so again on every tool it
   * clicks.
   */
  const [zoom, setZoom] = useState<Zoom>('assembly')
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
  /** The ground the panel is painted in: the drawing's own, whichever theme. */
  const ground = useSheetGround()
  /**
   * The stack this panel draws, and the only place it can come from.
   *
   * **The tree is what assembles a tool** (2026-09-11). This panel used to
   * offer a holder and a collet of its own, which made it a second way to fill
   * a slot the tree already owns — and the two could disagree, because the
   * dropdowns wrote to `picked` and the tree wrote to the assembly. `stack` is
   * now the whole answer: what the tree has put in the slots, or nothing.
   */
  const chosen = {
    holderGuid: stack?.holder?.guid ?? null,
    colletGuid: stack?.collet?.guid ?? null,
  }
  const holderChosen = stack?.holder ?? undefined
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
    { holder: chosen.holderGuid, collet: chosen.colletGuid, stickout: null },
    curve,
    margins,
    thresholdsFrom(),
    holderChosen === undefined ? [] : [holderChosen],
  )
  /**
   * Whether there is a stack to draw at all.
   *
   * **Not a choice any more** (2026-09-11). The panel drew the cutter alone
   * whenever the switch said `tool`, which meant the one picture on the page
   * could disagree with the tree about what was on the tool. The sheet is now
   * whatever the tree assembled, and the press over it moves the frame rather
   * than the subject.
   */
  const drawnAsStack = drawn.assembly !== null

  return (
    /*
      **The panel is the sheet the tool is drawn on** (Paul, 2026-09-11). It
      was a grey wash, and everything on it floated in the tone the table's
      rows are (Paul, 2026-09-01) — which left the drawing reading as a white
      rectangle inset in a card rather than as a drawing, because the sheet is
      capped at 16 rem and the wash filled whatever the panel had either side
      of it. Flush with the sheet, there is no inset to read: the head and the
      numbers still float, a shade off the ground rather than onto it.

      **The colour is the package's, not a zinc step** — `useSheetGround`, so
      the two grounds turn over together. Dark is `#22252b`, a deliberate step
      above the card, so a hard-coded white would have matched in one theme and
      glared in the other. A runtime value, hence `style`.

      The padding is also what keeps a square-cornered band out of the card's
      rounded corner.
    */
    <div
      className="flex h-full min-h-0 flex-col gap-2 overflow-hidden rounded-xl p-2"
      style={{ background: ground }}
    >
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
      <div className="flex items-start gap-2 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5">
        <span className="mt-0.5 shrink-0 text-zinc-400">
          <ToolTypeIcon toolType={tool.form} className="size-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-lg leading-tight text-zinc-100">
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
              <Button
                key={action.key}
                type="button"
                size="md"
                variant={action.danger === true ? 'danger' : 'success'}
                onClick={action.onClick}
                className="shrink-0 whitespace-nowrap"
              >
                {action.label}
              </Button>
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
        **The drawing takes the room** (Paul, 2026-09-01). It was a fixed 16 rem
        in a panel half a screen tall, which is a thumbnail of the one thing
        the panel exists to show. It fills what the head and the numbers
        leave.
      */}
      <div className="flex min-h-0 flex-1 flex-col gap-1">
        {/*
          **One press, and it says which way it goes** (2026-09-11) — the same
          rule `NoColletToggle` follows: a toggle labelled with its own state
          leaves the reader working out which of the two they are looking at
          from the picture, which is the thing they were looking at the picture
          to find out. So it names the frame it would move to.

          Drawn only where a holder is: the cut is the length of tool below the
          holder, so with nothing holding the cutter the zoom has no nose face
          to frame against and the sheet is already the tool.
        */}
        {drawn.holder === null ? null : (
          <div className="flex justify-end gap-1">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              aria-pressed={zoom === 'tool'}
              title={
                zoom === 'tool'
                  ? 'The sheet is framed on the working end. Zooming out draws the whole stack, tip to the top of the holder.'
                  : 'The sheet is framed on the whole stack. Zooming to the tool frames what stands below the holder, with a sliver of the nose above it.'
              }
              onClick={() => setZoom(zoom === 'tool' ? 'assembly' : 'tool')}
              className="text-2xs rounded border border-zinc-800 px-2 py-0.5 text-zinc-300 hover:border-zinc-700"
            >
              {zoom === 'tool' ? 'Zoom out' : 'Zoom to tool'}
            </Button>
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
        {/*
          **The sheet is portrait by construction** (Paul, 2026-09-07, twice:
          "should be kept vertical", then "holder visualization is still
          horizontal").

          `orientationFor` in `@toolpath/tool-drawing` is
          `width >= height ? 'horizontal' : 'vertical'` — the measured box and
          nothing else, with no prop to override it. So a wide panel, or a short
          window, or a details column that happens to be tall enough to squeeze
          the sheet, all lay the tool on its side; the first fix only gave the
          box a definite height, which left the ratio to chance.

          **The height, and a width derived from it** (Paul, 2026-09-11: "be
          more aggressive about adjusting the viewer panel to match the
          available space"). It was a flat 16 rem cap on the width, which is
          upright at any panel size and throttles the drawing at most of them:
          the scale is the smaller of the two ratios that fit, so on a panel
          taller than it is wide the *width* is what binds — 16 rem of sheet
          under 56 rem of panel drew a BT40 stack a third of the height it had
          room for, with the rest of the sheet empty above and below it.

          So the box fills the height it is given and takes its width from
          that: `width = height × 3/4`, clamped by the panel it is in. A box
          whose width is three quarters of its own height cannot be landscape
          whichever of the two the browser settles first, which is what the
          16 rem cap was buying — and on a panel narrower than that it is the
          `max-w-full` that binds, so the sheet takes the whole column.

          The floor under the height is what keeps `w-auto` from collapsing:
          the width is derived from the used height, so a height of nothing
          would be a width of nothing. And the package re-measures — it watches
          its own `<svg>` with a `ResizeObserver` as of 0.3.1 — so a box that
          settles a frame late is corrected rather than fixed wrong, which is
          what the first aspect-ratio attempt could not rely on.
        */}
        {/* Named so a test can measure the sheet against the room it was
            given — the rule is a ratio, and a ratio needs both numbers. */}
        <div data-sheet-room className="flex min-h-0 flex-1 flex-col items-center">
          <div className="aspect-[3/4] h-full min-h-[18rem] w-auto max-w-full">
            <CatalogDrawing
              tool={tool}
              unit={unit}
              curve={curve}
              margins={margins}
              dimensions
              dimensionSides="both"
              highlight={pointed}
              onDimensionHover={setPointed}
              assembly={drawn.assembly}
              zoom={zoom}
            />
          </div>
        </div>
      </div>

      {/* The numbers it is chosen on, at the bottom: two columns, big enough
          to read across the desk, each saying what it is rather than only its
          code (Paul, 2026-09-01) — or whatever else is being read, where the
          caller is showing a component of the stack rather than the cutter. */}
      {details === undefined ? (
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
            const provenance =
              code === 'LBH' && asDrawn !== null ? 'derived' : tool.provenance[code]
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
      ) : (
        <div className="shrink-0 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-2">
          {details}
        </div>
      )}
    </div>
  )
}
