import { useMemo, useState, type ReactNode } from 'react'
import { ArrowSquareOutIcon } from '@phosphor-icons/react'
import { Badge, Button, Combobox, Toggle, cn } from '@toolpath/ui'
import {
  NO_MARGINS,
  stickoutLimits,
  type CatalogTool,
  type Collet,
  type Holder,
  type Margins,
} from '@toolpath/catalog-data'
import type { ReachCurve } from '@toolpath/part-contracts'
import { formatLength, type UnitSystem } from '@toolpath/tool-support'
import { formatGeometry } from 'shared/geometry'
import { getFamily } from 'shared/catalog'
import { drawnAssembly } from 'shared/drawn-assembly'
import { roomAt } from 'shared/assembly-gaps'
import { askFor, boxesFor, lengthFor, type ClearanceEdit } from 'shared/clearance-entry'
import { thresholdsFrom } from 'shared/holder-choice'
import { ToolTypeIcon, formLabel } from './tool-icons'
import { MeasurementIcon } from './feature-icons'
import { CatalogDrawing } from './catalog-drawing'
import { ClearanceEntry } from './clearance-entry'
import { CatalogComboboxButton } from './catalog-combobox-button'

/**
 * The tool being read, beside the part.
 *
 * Paul's panel (2026-08-31): the cutter drawn on its own, the numbers it is
 * chosen on in a form somebody can read at a glance, and the two decisions
 * that finish an assembly — a holder and a collet — asked here rather than
 * only in the list. The vendor's page is a button at the top, because "where
 * do I buy this" is asked of the thing on screen.
 *
 * This is the working panel, not a reference sheet: the tool's own page and
 * the standalone catalog browser were removed on 2026-09-03, so the panel
 * beside the part is the only place a tool is read.
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
   * side, and why the Tool / Tool + holder switch vanished the moment somebody
   * looked at a holder. The sheet above is the same sheet either way; this is
   * the half that answers "which component am I reading".
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
  /**
   * The stack this panel is drawing, which is the tree's and nothing else's
   * (Paul, 2026-09-10). The panel used to offer a holder and a collet of its
   * own when no feature was open, so a stack could be assembled in two places
   * — the tree, and a pair of dropdowns over a tool nobody had ordered.
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
  /**
   * The one of the three clearance numbers a shop has stated, if any.
   *
   * **Kept against the stack it was stated about**, rather than reset from an
   * effect: a length below the holder typed for one assembly means nothing on
   * the next tool or under a different holder, and an effect would leave it on
   * screen for the render in between. Reading it through the key is how it
   * cannot outlive what it was about.
   */
  const stackKey = `${tool.guid}:${chosen.holderGuid ?? ''}:${chosen.colletGuid ?? ''}`
  const [stated, setStated] = useState<{
    readonly key: string
    readonly edit: ClearanceEdit | null
  }>({ key: stackKey, edit: null })
  const edit = stated.key === stackKey ? stated.edit : null

  /**
   * The least this stack can stand out and still leave the room asked for.
   *
   * **Solved on the holder that is drawn, not the one the vendor tabulated.**
   * `clearance().requiredStickout` was the obvious answer and is the wrong one:
   * it sweeps the parametric nose, body and flange, and most holders publish
   * none of those — `RequiredAt` in `shared/clearance-entry.ts` has the reading
   * off `BT30-ER11-110DT` that settled it. `lengthFor` halves its way down the
   * same measurement the other two boxes are read from, so the three of them
   * describe one stack rather than two.
   *
   * Memoised on what it depends on, because a solve is forty sweeps and an
   * entry that stands must not re-run them on every keystroke elsewhere.
   */
  /*
    The ends to search between. `StickoutRange.max` is null where the tool
    states no overall length — an unbounded range rather than a bound of
    nothing — and a search needs a far end, so the tool's own length stands in
    and the ends collapse onto the floor where there is not even that.
  */
  const bracket = useMemo(() => {
    const range = stickoutLimits(tool, stack?.collet ?? null)
    return range === null
      ? null
      : { min: range.min, max: range.max ?? tool.geometry.OAL ?? range.min }
  }, [tool, stack?.collet])
  const requiredAt = useMemo(
    () =>
      (field: 'axial' | 'radial', wanted: number): number | null => {
        if (holderChosen === undefined || curve === null || bracket === null) {
          return null
        }
        return lengthFor(
          wanted,
          bracket,
          (stickout) => roomAt({ tool, holder: holderChosen }, stickout, curve, margins)[field],
        )
      },
    [tool, holderChosen, curve, margins, bracket],
  )
  /*
    The ask is memoised, not just the search behind it: `askFor` calls the
    search, the search is forty sweeps of the outline, and this panel re-renders
    on anything the page does. Without this, every keystroke in a filter on the
    other side of the screen would re-solve a length nobody had touched.
  */
  const ask = useMemo(() => askFor(edit, margins, requiredAt), [edit, margins, requiredAt])

  const drawn = drawnAssembly(
    tool,
    { holder: chosen.holderGuid, collet: chosen.colletGuid, stickout: ask.stickout },
    curve,
    ask.margins,
    thresholdsFrom(),
    holderChosen === undefined ? [] : [holderChosen],
  )
  /** Whether the sheet below is the stack rather than the bare tool. */
  const drawnAsStack = drawn.assembly !== null && view === 'stack'

  /**
   * The room this stack actually leaves, at the length it is actually drawn at.
   *
   * Measured after the stack has had the ask, because the stack floors and caps
   * a stated length — a box showing the room at a length nobody is looking at
   * would be worse than no box. Memoised on the stack and the length: the sweep
   * is a loop over a few dozen segments, but it is one the panel would otherwise
   * run on every keystroke anywhere on the page.
   */
  const room = useMemo(
    () =>
      drawnAsStack
        ? roomAt({ tool, holder: drawn.holder }, drawn.stickout, curve, ask.margins)
        : { axial: null, radial: null },
    [
      drawnAsStack,
      tool,
      drawn.holder,
      drawn.stickout,
      curve,
      ask.margins.axial,
      ask.margins.radial,
    ],
  )
  const boxes = boxesFor(
    edit,
    margins,
    { stickout: drawn.stickout, overLimit: drawn.overLimit },
    room,
  )

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
        {drawn.holder === null ? null : (
          <div className="flex justify-end gap-1">
            <Toggle
              value={view}
              onValueChange={(next) => {
                if (next === 'tool' || next === 'stack') {
                  setView(next)
                }
              }}
              size="sm"
            >
              <Toggle.Item value="tool" className="text-2xs px-2 py-0.5">
                Tool
              </Toggle.Item>
              <Toggle.Item value="stack" className="text-2xs px-2 py-0.5">
                Tool + holder
              </Toggle.Item>
            </Toggle>
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

          **A capped width and a floor under the height**, rather than an
          aspect ratio off `h-full`. That version was right two runs in three
          and wrong in the other: `h-full` resolves against a parent whose own
          height is not definite on the first layout pass, so `aspect-ratio`
          derived the height from the width instead and the box came out
          landscape — and the package reads the box once. 16 rem of width under
          18 rem of height cannot be landscape whatever the panel is doing,
          because neither figure waits on a percentage to resolve. A taller
          panel only makes it more portrait.
        */}
        <div className="flex min-h-0 flex-1 flex-col items-center">
          {/*
            **Bigger, now that nothing is written over it** (Paul, 2026-09-11).
            The five lines the verdict's sentence took went to the sheet, and
            the clearance row under it is folded to begin with.

            Still a capped width under a floored height, and for the reason the
            note above gives: `orientationFor` is `width >= height`, measured
            once, so the two figures have to stay apart or a tall panel lays the
            tool on its side. 18 rem under 22 rem cannot be landscape whatever
            the panel does.
          */}
          <div className="h-full min-h-[22rem] w-full max-w-[18rem]">
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
      </div>

      {/*
        **The three numbers that decide each other**, under the sheet they are
        about (Paul, 2026-09-11). Only with a stack and a feature: a clearance
        is room between something and something else, and a cutter drawn on its
        own has neither.
      */}
      {drawnAsStack && curve !== null ? (
        <ClearanceEntry
          boxes={boxes}
          unit={unit}
          edit={edit}
          onEdit={(next) => setStated({ key: stackKey, edit: next })}
        />
      ) : null}

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
