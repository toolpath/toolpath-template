import {
  clearance,
  materialProfile,
  NO_MARGINS,
  type Assembly,
  type CatalogTool,
  type Margins,
} from '@toolpath/catalog-data'
import type { ReachCurve } from '@toolpath/part-contracts'
import { formatLength, type UnitSystem } from '@toolpath/tool-support'
import {
  SHEETS,
  ToolDrawing,
  useDrawingContext,
  type Box,
  type Extent,
  type Padding,
  type Sheet,
  type ViewerAssembly,
  type Zoom,
} from '@toolpath/tool-drawing'
import { assemblyOutline } from '@toolpath/tool-drawing/geometry'
import {
  ClearanceOverlay,
  describeGaps,
  tightestGaps,
  type Gaps,
} from '@toolpath/tool-drawing/clearance'
import { useEffect, useRef } from 'react'
import { assemblyLabel } from 'shared/assemblies'
import {
  clearanceCase,
  clearanceReport,
  type ClearanceCase,
  type ClearanceDebugInput,
} from 'shared/clearance-debug'
import { getProfile } from 'shared/catalog'
import { toViewerAssembly } from 'shared/tool-drawing-input'
import { useTheme } from 'shared/use-theme'

/**
 * `@toolpath/tool-drawing`, wired to this catalog.
 *
 * The package draws; this decides what it draws with. Everything the package
 * deliberately declined to own lives here — the theme, because a package cannot
 * reach `useTheme`; the unit and its rounding, because the shop's unit is the
 * application's; the caption, because what an assembly is called is the
 * catalog's word for it; and **the clearance verdict**, because `clearance()`
 * has a dozen callers that draw nothing at all and must not end up behind a
 * dependency on React.
 *
 * Two pages draw the same thing — the tool page's details panel and the part
 * page's drawing card — so the wiring is here once rather than in both.
 */

/**
 * Room reserved on the `+r` flank for the material, in pixels.
 *
 * A number, because `<ToolDrawing>` is told its padding before it has measured
 * anything. The drawing this replaces gave the material whatever the panel had
 * spare, which it could do only because it did its own framing; the package
 * clamps an over-large request back to `MOST_OF_A_PANEL` — 0.6 of the axis —
 * and scales the dimension bands back with it.
 *
 * That clamp is a guard, not a layout: on the part page's tool panel, 240 px
 * of a 400 px-tall sheet *is* the whole 0.6, so the assembly was crushed into
 * the top third and the dimension bands with it (2026-09-03). So the room is a
 * prop, and this is the wide card's default rather than everybody's — see
 * {@link CatalogDrawingProps.materialRoom}.
 */
export const MATERIAL_ROOM = 240

/**
 * The gaps, as the overlay is told them: neither one.
 *
 * **The two tightest points are said in words, not lettered on the sheet**
 * (Paul, 2026-09-03: "I don't know what those numbers are… they should just
 * not show at all, not even the call out arrows"). The overlay draws a green
 * figure with a leader at each gap's own tightest point, which is a place on
 * the *stack* — the holder body, a flute — rather than anywhere the eye reads
 * as a gap. On a tool alone it lands out in the white beside the flutes; under
 * a holder it lands against the flange, yards from the material it measures.
 * Two numbers with nothing legible under them.
 *
 * They are not lost: the same two gaps are the caption's sentence below,
 * where `describeGaps` writes out what was measured **and where** — "0.135 in
 * above the wall at the body" says the part the figure could only point at.
 * So the real {@link Gaps} still reach `describeGaps`, and only the drawing is
 * told there is nothing to letter. Both readouts inside the overlay are
 * guarded on null, so this removes the leaders and the arrowheads with them
 * and leaves the hatched material, its break and the margin line standing.
 */
const UNDIMENSIONED: Gaps = { axial: null, radial: null }

/**
 * The colour of the sheet the drawing is on, for the panel it sits in.
 *
 * **The drawing is a sheet of paper and the panel was a grey wash around it**
 * (Paul, 2026-09-01), which read as a white rectangle inset in a card rather
 * than as a drawing (Paul, 2026-09-11). A panel flush with the sheet has no
 * inset to read, and the sheet reaches the card's own edge.
 *
 * It is a hook rather than a constant because the two grounds are not the same
 * colour: white on a light page, and `#22252b` on a dark one, which is a step
 * above the card on purpose — the package will not put a torch in a dark
 * application. So a panel that hard-coded white would match in one theme and
 * glare in the other.
 *
 * Here rather than in the panel because this is the file wired to
 * `@toolpath/tool-drawing`: `SHEETS` is the package's word for its own ground,
 * and a second copy of those two colours in a stylesheet is a drift with a
 * delay on it.
 */
export const useSheetGround = (): string => {
  const [theme] = useTheme()
  return SHEETS[theme].ground
}

export interface CatalogDrawingProps {
  readonly tool: CatalogTool
  /** The stack around the tool, or null to draw the tool alone. */
  readonly assembly?: Assembly | null
  readonly unit: UnitSystem
  /** The material around the feature: swept to paint what collides, and drawn beside the stack. */
  readonly curve?: ReachCurve | null
  /** Room the shop wants kept between the stack and the part. */
  readonly margins?: Margins
  readonly dimensions?: boolean
  readonly dimensionSides?: 'one' | 'both'
  /**
   * Which dimension lines are lit, by ISO 13399 code.
   *
   * **The drawing letters nothing**, so this is how a reader is told which
   * line is which: the panel's own table of numbers lights the line for the
   * number under the pointer. A code the drawing has no line for — `RE`, and
   * the two this catalog derives — lights nothing, which is the honest answer
   * rather than an error.
   */
  readonly highlight?: string | ReadonlyArray<string> | null
  /**
   * The code under the pointer on the drawing, and `null` when it leaves.
   *
   * The other direction of the same wire, so pointing at a line names the
   * number in the table. Passing it is what puts hit targets on the lines;
   * without it the drawing is inert, which is what a card beside a list wants.
   */
  readonly onDimensionHover?: (code: string | null) => void
  /**
   * Draw the holder from its measured silhouette where one exists.
   *
   * On by default, and worth a switch rather than a constant: the parametric
   * holder is what `clearance()` still reasons about, so being able to put the
   * two pictures side by side is how a disagreement between the drawing and the
   * verdict under it gets noticed at all.
   */
  readonly measured?: boolean
  /**
   * How much of the stack the sheet is framed to.
   *
   * `'assembly'` is the whole stack, `'tool'` the working end and a sliver of
   * the holder above it. The package's own prop, handed straight on: the cut,
   * the headroom above it and the refusal to zoom a tool that states no length
   * are all its rules, and a second copy of them here would be a drift with a
   * delay on it.
   *
   * The caller's rather than this file's because it is a reading decision —
   * the panel that has a button for it passes what the button says, and a card
   * beside a list has no button and takes the whole stack.
   */
  readonly zoom?: Zoom
  /**
   * Room reserved on the `+r` flank for the material, in pixels.
   *
   * The caller's, because only the caller knows how much sheet there is: the
   * package measures its panel *after* it has been told its padding, so it
   * cannot ask for a share of an axis it has not seen yet. A narrow panel
   * passes less; {@link MATERIAL_ROOM} is what a full-width card wants.
   */
  readonly materialRoom?: number
}

/**
 * The verdict's sentence, and **the length below the holder it is about**.
 *
 * The package writes "clears the part"; this writes what follows it. It used
 * to be the two tightest gaps alone, which left the reading unanswerable
 * (Paul, 2026-09-08: "it's not clear what length below holder this applies
 * to"): a stack clears at one stickout and fouls at another, so a verdict with
 * no length on it is a verdict about nothing in particular. The number is the
 * one the sheet is drawn at and the one the list's column now prints — the
 * same `drawnAssembly` stickout in all three places.
 *
 * On a tool drawn alone there is no holder and so no such length, and the
 * sentence is the gaps by themselves as before.
 */
const verdictNote = (
  stickout: number | null,
  gaps: Gaps | null,
  margins: Margins,
  format: (millimetres: number) => string,
): string | null => {
  const said = gaps === null ? null : describeGaps(gaps, margins, format)
  if (stickout === null) {
    return said
  }
  const at = `at ${format(stickout)} below the holder`
  return said === null ? at : `${at} · ${said}`
}

/**
 * What the clearance wall was drawn from, in the console, while it is wrong.
 *
 * **Four of the overlay's inputs are only knowable from inside the sheet.** The
 * curve and the cutting radius are this file's, but the extent the sheet was
 * framed to, the panel as the `ResizeObserver` measured it and the room the
 * frame actually granted on the `+r` flank are all settled after
 * `<ToolDrawing>` has been called — so a caller debugging a wall that collapsed
 * against the cut can see none of them. A child inside the drawing can: the
 * frame reaches it through `useDrawingContext`, and the `<svg>` it is rendered
 * into is the box that was measured.
 *
 * Dev only, and it draws nothing. It prints once per drawing rather than once
 * per render — pointing at a dimension line re-renders the sheet and would
 * otherwise fill the console — and leaves `__clearanceDebug()` behind, which
 * reprints the report and returns the case as JSON for
 * `scratchpad/reach-probe.mjs`.
 */
const ClearanceProbe = ({
  about,
  curve,
  cuttingRadius,
  profile,
  margins,
  asked,
  stickout,
}: Omit<ClearanceDebugInput, 'extent' | 'box' | 'granted' | 'scale' | 'fontSize' | 'viewBox'>) => {
  const drawing = useDrawingContext()
  /** An anchor in the sheet, for the one thing context does not publish: the measured box. */
  const anchor = useRef<SVGGElement>(null)
  const frame = drawing?.frame ?? null
  const extent = drawing?.extent ?? null
  /**
   * One line per drawing, not one per render.
   *
   * The scale stands in for the panel: the box is measured after the paint that
   * would have to report it, and every box that framed differently reaches here
   * as a different scale.
   */
  const signature = JSON.stringify([
    about,
    curve.horizontalOffset,
    curve.verticalOffset,
    cuttingRadius,
    extent,
    frame?.scale,
    frame?.reserve?.plus,
  ])
  useEffect(() => {
    if (!import.meta.env.DEV || frame === null || extent === null) {
      return
    }
    const measured = anchor.current?.ownerSVGElement?.getBoundingClientRect()
    const input: ClearanceDebugInput = {
      about,
      curve,
      cuttingRadius,
      profile,
      margins,
      asked,
      stickout,
      extent,
      box: { width: measured?.width ?? 0, height: measured?.height ?? 0 },
      granted: { padding: frame.padding, reserve: frame.reserve ?? null },
      scale: frame.scale,
      fontSize: frame.fontSize,
      viewBox: frame.viewBox,
    }
    const report = (): ClearanceCase => {
      console.log(clearanceReport(input))
      const shape = clearanceCase(input)
      console.log('case.json for scratchpad/reach-probe.mjs:\n' + JSON.stringify(shape, null, 2))
      return shape
    }
    report()
    ;(window as unknown as { __clearanceDebug?: () => ClearanceCase }).__clearanceDebug = report
    return () => {
      delete (window as unknown as { __clearanceDebug?: () => ClearanceCase }).__clearanceDebug
    }
    // The signature is what identifies a drawing; the rest is read through it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])
  return <g ref={anchor} data-clearance-probe />
}

export const CatalogDrawing = ({
  tool,
  assembly = null,
  unit,
  curve = null,
  margins = NO_MARGINS,
  dimensions = false,
  dimensionSides = 'one',
  highlight = null,
  onDimensionHover,
  measured = true,
  zoom = 'assembly',
  materialRoom = MATERIAL_ROOM,
}: CatalogDrawingProps) => {
  const [theme] = useTheme()
  const format = (millimetres: number) => formatLength(millimetres, unit)
  const holder = assembly?.holder ?? null
  const holderProfile = measured && holder !== null ? getProfile(holder.guid) : null
  const viewer = toViewerAssembly(
    {
      tool,
      holder,
      stickout: assembly?.stickout ?? null,
    },
    holderProfile,
  )
  const caption = assembly === null ? tool.catalogNumber : assemblyLabel(assembly)

  /**
   * The verdict, reached here and handed over as data.
   *
   * The package draws a clearance; it does not decide one. What it gets is the
   * answer this application's own engine already gave, so the number under the
   * drawing is the number the tool list sorted on.
   */
  const outline = curve === null ? null : assemblyOutline(viewer)
  const verdict = curve !== null && assembly !== null ? clearance(assembly, curve, margins) : null
  const cuttingRadius = (tool.geometry.DC ?? 0) / 2
  const profile =
    curve !== null && tool.geometry.DC !== undefined ? materialProfile(curve, cuttingRadius) : null
  const gaps =
    curve !== null && outline !== null
      ? tightestGaps(outline.segments, curve, cuttingRadius, margins)
      : null

  const overlaid = profile !== null && gaps !== null && outline !== null
  const padding: Partial<Padding> = overlaid ? { plus: materialRoom } : {}

  return (
    <ToolDrawing
      assembly={viewer}
      theme={theme}
      caption={caption}
      dimensions={dimensions}
      dimensionSides={dimensionSides}
      zoom={zoom}
      highlight={highlight}
      {...(onDimensionHover === undefined ? {} : { onDimensionHover })}
      padding={padding}
      collisions={verdict?.collisions}
      verdict={
        verdict === null
          ? null
          : {
              clears: verdict.clears,
              note: verdictNote(viewer.stickout, gaps, margins, format),
            }
      }
      className="size-full"
    >
      {overlaid && profile !== null && gaps !== null && outline !== null ? (
        <>
          <ClearanceOverlay
            profile={profile}
            cuttingRadius={cuttingRadius}
            gaps={UNDIMENSIONED}
            margins={margins}
            formatLength={format}
          />
          {import.meta.env.DEV && curve !== null ? (
            <ClearanceProbe
              about={caption}
              curve={curve}
              cuttingRadius={cuttingRadius}
              profile={profile}
              margins={margins}
              asked={padding}
              stickout={viewer.stickout}
            />
          ) : null}
        </>
      ) : null}
    </ToolDrawing>
  )
}
