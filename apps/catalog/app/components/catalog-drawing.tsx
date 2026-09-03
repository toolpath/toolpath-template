import {
  clearance,
  materialProfile,
  NO_MARGINS,
  type Assembly,
  type CatalogTool,
  type Margins,
} from '@toolpath/catalog-data'
import type { ReachCurve } from '@toolpath/part-contracts'
import { formatLength, type Unit } from '@toolpath/domain/units'
import {
  SHEETS,
  ToolDrawing,
  type Box,
  type Extent,
  type Padding,
  type Sheet,
  type ViewerAssembly,
} from '@toolpath/tool-drawing'
import { assemblyOutline } from '@toolpath/tool-drawing/geometry'
import {
  ClearanceOverlay,
  describeGaps,
  tightestGaps,
  type Gaps,
} from '@toolpath/tool-drawing/clearance'
import { assemblyLabel } from 'shared/assemblies'
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
 * A constant, because `<ToolDrawing>` is told its padding before it has
 * measured anything. The drawing this replaces gave the material whatever the
 * panel had spare, which it could do only because it did its own framing; the
 * package clamps an over-large request back to a fraction of the panel, so a
 * constant is safe on a small panel and generous on a wide one.
 */
export const MATERIAL_ROOM = 240

export interface CatalogDrawingProps {
  readonly tool: CatalogTool
  /** The stack around the tool, or null to draw the tool alone. */
  readonly assembly?: Assembly | null
  readonly unit: Unit
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
  const padding: Partial<Padding> = overlaid ? { plus: MATERIAL_ROOM } : {}

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
      verdict={
        verdict === null
          ? null
          : {
              clears: verdict.clears,
              note: gaps === null ? null : describeGaps(gaps, margins, format),
            }
      }
      className="size-full"
    >
      {overlaid && profile !== null && gaps !== null && outline !== null ? (
        <ClearanceOverlay
          profile={profile}
          cuttingRadius={cuttingRadius}
          gaps={gaps}
          margins={margins}
          formatLength={format}
        />
      ) : null}
    </ToolDrawing>
  )
}
