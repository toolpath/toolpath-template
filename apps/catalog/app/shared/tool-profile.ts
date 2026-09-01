import { toolSilhouette, type CatalogTool, type Holder } from '@toolpath/catalog-data'
import type { ProfileStep } from './step-file'

/**
 * A cutter as a profile, bottom-up: the tip at zero, the shank at the top.
 *
 * One reading of the geometry, used by everything that needs the tool's shape
 * rather than its numbers — the drawing beside the part and the STEP file on
 * the bill. Two readings would be two silhouettes that disagree about where a
 * neck starts.
 *
 * `toolSilhouette` is the package's own answer to "what stands above the
 * flutes", so this adds only the flutes themselves and where the tool ends.
 */
export const toolProfile = (
  tool: CatalogTool,
): { readonly steps: Array<ProfileStep>; readonly top: number } | null => {
  const { DC, OAL } = tool.geometry
  if (DC === undefined || OAL === undefined || DC <= 0 || OAL <= 0) {
    return null
  }
  return {
    steps: [
      { fromHeight: 0, radius: DC / 2 },
      ...toolSilhouette(tool).map((step) => ({
        fromHeight: step.fromHeight,
        radius: step.radius,
      })),
    ],
    top: OAL,
  }
}

/**
 * The whole stack as one profile: the tool up to the stickout, the holder
 * above it.
 *
 * **One profile, three uses.** It is what the STEP file revolves, what the
 * cross-section beside the part draws, and what the order list exports — so
 * asking "could we draw the holder from the STEP we generate?" answers itself
 * the other way round (Paul, 2026-08-31): the STEP is drawn *from this*, and
 * so is the drawing, which is what keeps the two from disagreeing. Parsing the
 * file back would be the same numbers by a longer road.
 *
 * Where no stickout was chosen it is the tool's own length below the holder,
 * which is the shortest it can be set at.
 */
export const stackProfile = (
  tool: CatalogTool | undefined,
  holder: Holder | undefined,
  stickout: number | null,
): { readonly steps: Array<ProfileStep>; readonly top: number } | null => {
  const cutter = tool === undefined ? null : toolProfile(tool)
  if (cutter === null) {
    return null
  }
  if (holder === undefined || holder.noseDiameter === null) {
    return cutter
  }
  const out = stickout ?? tool?.geometry.LBH ?? cutter.top
  return {
    steps: [
      ...cutter.steps.filter((step) => step.fromHeight < out),
      { fromHeight: out, radius: holder.noseDiameter / 2 },
      ...(holder.bodyDiameter === null || holder.noseLength === null
        ? []
        : [{ fromHeight: out + holder.noseLength, radius: holder.bodyDiameter / 2 }]),
      ...(holder.flangeDiameter === null || holder.projection === null
        ? []
        : [{ fromHeight: out + holder.projection, radius: holder.flangeDiameter / 2 }]),
    ],
    /** A little past the flange, so the drawing does not end on a hard edge. */
    top: out + (holder.projection ?? (holder.noseLength ?? 0) + (holder.bodyLength ?? 0)) + 10,
  }
}
