import type { ReachCurve } from '@toolpath/part-contracts'
import type { CatalogTool, Holder, Margins } from '@toolpath/catalog-data'
import type { ViewerAssembly } from '@toolpath/tool-drawing/geometry'
import { assemblyOutline } from '@toolpath/tool-drawing/geometry'
import { tightestGaps, type Gaps } from '@toolpath/tool-drawing/clearance'
import { getProfile } from './catalog'
import { toViewerAssembly, type DrawableAssembly } from './tool-drawing-input'

/**
 * The room a stack actually leaves around a feature, measured once.
 *
 * Two things ask it now — the sentence under the drawing, and the three boxes
 * beside it that let a shop set any one of the numbers and read the other two
 * — and a gap worked out twice is the defect `stickout.ts` was written to end,
 * one package over. So the outline and `tightestGaps` are called here and
 * nowhere else: `catalog-drawing.tsx` reads this for its caption and its
 * overlay, and `clearance-entry.tsx` for its boxes, so the number in a box is
 * the number in the sentence by construction rather than by agreement.
 *
 * **This is a measurement, not a verdict.** `Gap.gap` is the room found, in
 * millimetres and negative into the material, whatever the shop asked for;
 * only `Gap.clears` reads the margins. The verdict — whether a stack clears,
 * and the least stickout at which it would — stays `clearance()` in
 * `@toolpath/tool-support`, which has a dozen callers that draw nothing.
 *
 * ## The two are measured off different holders, on purpose
 *
 * `clearance()` sweeps the parametric holder: a nose, a body and a flange off
 * the vendor's published numbers. This measures the holder the drawing draws,
 * which is the measured silhouette wherever one exists. They can disagree, and
 * `CatalogDrawingProps.measured` already says that noticing the disagreement is
 * the reason both are kept. The boxes take the same side as the picture — a
 * shop reads the number against the holder it can see — and mark a gap that
 * comes up short of what was asked rather than quietly restating the ask.
 */

/** The stack a measurement is taken on, with the holder it is drawn from. */
export type MeasuredStack = DrawableAssembly

/**
 * The stack as the drawing package sees it, measured where it has been.
 *
 * The one construction of a `ViewerAssembly` for a stack on the part page, so
 * the gaps are measured off exactly the silhouette that gets drawn.
 */
export const viewerFor = (stack: MeasuredStack, measured = true): ViewerAssembly => {
  const profile = measured && stack.holder !== null ? getProfile(stack.holder.guid) : null
  return toViewerAssembly(stack, profile)
}

/** How wide the cut itself is, which is what every gap is measured past. */
export const cuttingRadiusOf = (tool: Pick<CatalogTool, 'geometry'>): number =>
  (tool.geometry.DC ?? 0) / 2

/**
 * Both tightest gaps for one stack against one feature, or null with nothing
 * to measure — no feature, or a form the package draws no outline for.
 */
export const gapsFor = (
  viewer: ViewerAssembly,
  curve: ReachCurve | null,
  cuttingRadius: number,
  margins: Margins,
): Gaps | null => {
  if (curve === null) {
    return null
  }
  const outline = assemblyOutline(viewer)
  if (outline === null) {
    return null
  }
  return tightestGaps(outline.segments, curve, cuttingRadius, margins)
}

/** What the three boxes read: the room found, in millimetres, either way. */
export interface MeasuredRoom {
  /** Up from the material to the part standing over it, mm. */
  readonly axial: number | null
  /** Sideways to a wall taller than the part, mm. Null where none stands taller. */
  readonly radial: number | null
}

export const NOTHING_MEASURED: MeasuredRoom = { axial: null, radial: null }

/** The two gaps as bare numbers, which is all a box can show. */
export const roomIn = (gaps: Gaps | null): MeasuredRoom =>
  gaps === null
    ? NOTHING_MEASURED
    : { axial: gaps.axial?.gap ?? null, radial: gaps.radial?.gap ?? null }

/**
 * The room this stack leaves at one stickout, measured off the drawn holder.
 *
 * The whole of what the boxes need from the geometry: hand it a length below
 * the holder and it says what clearance that length buys.
 */
export const roomAt = (
  stack: { readonly tool: CatalogTool; readonly holder: Holder | null },
  stickout: number | null,
  curve: ReachCurve | null,
  margins: Margins,
): MeasuredRoom =>
  roomIn(
    gapsFor(
      viewerFor({ tool: stack.tool, holder: stack.holder, stickout }),
      curve,
      cuttingRadiusOf(stack.tool),
      margins,
    ),
  )
