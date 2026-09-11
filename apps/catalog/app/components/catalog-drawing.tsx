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
  type Box,
  type Extent,
  type Padding,
  type Sheet,
  type ViewerAssembly,
} from '@toolpath/tool-drawing'
import { ClearanceOverlay, type Gaps } from '@toolpath/tool-drawing/clearance'
import { assemblyLabel } from 'shared/assemblies'
import { cuttingRadiusOf, gapsFor, viewerFor } from 'shared/assembly-gaps'
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
 * **Nothing is written over the drawing any more** (Paul, 2026-09-11).
 *
 * Two things used to be. The sentence went first: "at 47.00 mm below the
 * holder · tightest: 24.80 mm into the wall at the shank — 0.51 mm up and
 * 0.51 mm sideways wanted", five lines saying what the three clearance boxes
 * under the sheet now say in three, and say editably.
 *
 * The verdict over it went with it, and that one was not only a layout call.
 * "clears the part" is reached by `clearance()`, which sweeps the holder's
 * *parametric* nose, body and flange — and most holders publish none of those.
 * Asked about `BT30-ER11-110DT` + `11ERSS0250` + `V2160617` it answers
 * `clears: true` with `checked: ["shank"]`: a pass for the tool's own shank and
 * nothing whatever about what holds it, printed in the same words as a pass
 * that checked a whole stack. The clearance boxes read the measured silhouette
 * instead, so they answer the same question about the holder that is actually
 * drawn — and a gap that has gone into the material reads as a negative number
 * there, which is the honest version of the same warning.
 *
 * The collisions are still handed down, so the part that fouls is still painted
 * on the drawing. That is the verdict in the place it is about.
 */

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
  materialRoom = MATERIAL_ROOM,
}: CatalogDrawingProps) => {
  const [theme] = useTheme()
  const format = (millimetres: number) => formatLength(millimetres, unit)
  const holder = assembly?.holder ?? null
  const viewer = viewerFor({ tool, holder, stickout: assembly?.stickout ?? null }, measured)
  const caption = assembly === null ? tool.catalogNumber : assemblyLabel(assembly)

  /**
   * The verdict, reached here and handed over as data.
   *
   * The package draws a clearance; it does not decide one. What it gets is the
   * answer this application's own engine already gave, so the number under the
   * drawing is the number the tool list sorted on.
   */
  const verdict = curve !== null && assembly !== null ? clearance(assembly, curve, margins) : null
  const cuttingRadius = cuttingRadiusOf(tool)
  const profile =
    curve !== null && tool.geometry.DC !== undefined ? materialProfile(curve, cuttingRadius) : null
  /**
   * The gaps, measured where every other reader of them measures them.
   *
   * `shared/assembly-gaps` and not an outline of its own: the three boxes under
   * this sheet show the same two numbers the caption below writes out, and two
   * measurements of one gap is the divergence-with-a-delay this repository has
   * paid for once already.
   */
  const gaps = gapsFor(viewer, curve, cuttingRadius, margins)

  const overlaid = profile !== null && gaps !== null
  const padding: Partial<Padding> = overlaid ? { plus: materialRoom } : {}

  return (
    <ToolDrawing
      assembly={viewer}
      theme={theme}
      caption={caption}
      dimensions={dimensions}
      dimensionSides={dimensionSides}
      highlight={highlight}
      {...(onDimensionHover === undefined ? {} : { onDimensionHover })}
      padding={padding}
      collisions={verdict?.collisions}
      verdict={null}
      className="size-full"
    >
      {overlaid && profile !== null && gaps !== null ? (
        <ClearanceOverlay
          profile={profile}
          cuttingRadius={cuttingRadius}
          gaps={UNDIMENSIONED}
          margins={margins}
          formatLength={format}
        />
      ) : null}
    </ToolDrawing>
  )
}
