import type { Margins, OutlinePoint } from '@toolpath/catalog-data'
import type { ReachCurve } from '@toolpath/part-contracts'
import type { Box, Extent, Padding } from '@toolpath/tool-drawing'
import { clipped, lastRise, wallCorners } from '@toolpath/tool-drawing/clearance'

/**
 * Everything the clearance wall was drawn from, in one paste-able case.
 *
 * **The overlay's inputs are four numbers apart and none of them is on the
 * screen.** A wall that collapses against the cut looks the same whether the
 * curve reached it in inches, whether the sheet reserved no room on the `+r`
 * flank, or whether the staircase itself has no rise in it — and the three have
 * nothing to do with each other. So this dumps the inputs rather than a
 * verdict: `case.json` for `scratchpad/reach-probe.mjs` in the drawing
 * package's own repository, which re-runs the whole clip arithmetic offline,
 * and a short report for the console under it.
 *
 * Pure, and reads nothing but its arguments. The frame and the panel box are
 * the caller's to measure — only `<ToolDrawing>` knows them, and it publishes
 * the frame through `useDrawingContext`.
 */

/** What the probe is told, and what the report is written from. */
export interface ClearanceDebugInput {
  /** What this drawing is of, in a phrase: the feature, the tool, the assembly. */
  readonly about: string
  readonly curve: ReachCurve
  readonly cuttingRadius: number
  /** The material as the overlay takes it — `materialProfile(curve, cuttingRadius)`. */
  readonly profile: ReadonlyArray<OutlinePoint>
  /** What the sheet was framed to, in millimetres: the stack's extent, or a zoom's. */
  readonly extent: Extent
  /** The panel as the package measured it, in CSS pixels. Zero before the observer fires. */
  readonly box: Box
  /** The `padding` prop handed to `<ToolDrawing>`, in pixels, as asked for. */
  readonly asked: Partial<Padding>
  /** The chrome and the reservation the frame actually granted, in pixels. */
  readonly granted: { readonly padding: Padding; readonly reserve: Padding | null }
  readonly scale: number
  readonly fontSize: number
  readonly viewBox: string
  readonly margins: Margins
  /** The length of tool below the holder the sheet was drawn at, or null on a tool alone. */
  readonly stickout: number | null
}

/** The case, as JSON: what the probe reads, and what a bug report should carry. */
export interface ClearanceCase extends Omit<ClearanceDebugInput, 'curve' | 'profile'> {
  /** Millimetres, stated so a case captured elsewhere cannot be read as inches. */
  readonly units: 'mm'
  readonly curve: {
    readonly horizontalOffset: ReadonlyArray<number>
    readonly verticalOffset: ReadonlyArray<number>
  }
  readonly profile: ReadonlyArray<OutlinePoint>
}

export const clearanceCase = (input: ClearanceDebugInput): ClearanceCase => ({
  ...input,
  units: 'mm',
  curve: {
    horizontalOffset: [...input.curve.horizontalOffset],
    verticalOffset: [...input.curve.verticalOffset],
  },
  profile: input.profile.map((point) => ({ r: point.r, z: point.z })),
})

const round = (value: number): number => Math.round(value * 1e4) / 1e4

const last = <T>(values: ReadonlyArray<T>): T | null => values[values.length - 1] ?? null

const point = (at: OutlinePoint | null): string =>
  at === null ? '—' : `r ${round(at.r)}, z ${round(at.z)}`

/**
 * The unit check, which costs nothing and is the first thing to rule out.
 *
 * **The whole pipeline is millimetres and a caption can be in inches.** A curve
 * that arrived in inches is 25.4× too small, which draws a wall standing hard
 * against the cut — the same picture a genuinely shallow feature draws, and the
 * same one a flank with no room left draws. So the maxima are stated with their
 * inch reading beside them, and the suspicion is raised rather than asserted: a
 * feature really can be a third of a millimetre deep.
 */
const unitCheck = (input: ClearanceDebugInput): string => {
  const deepest = Math.max(0, ...input.curve.verticalOffset)
  const widest = Math.max(0, ...input.curve.horizontalOffset)
  const suspect =
    deepest > 0 && deepest * 25.4 < input.extent.height && deepest < input.cuttingRadius
  return [
    `  curve reaches ${round(widest)} across and ${round(deepest)} up`,
    `  read as inches that would be ${round(widest * 25.4)} and ${round(deepest * 25.4)} mm`,
    `  the stack it is drawn beside is ${round(input.extent.radius)} across and ${round(input.extent.height)} tall`,
    suspect
      ? '  SUSPECT: the curve is small enough against the stack to be an inch curve in a millimetre drawing'
      : '  the curve is millimetre-sized against the stack',
  ].join('\n')
}

/**
 * The overlay's own clip arithmetic, restated.
 *
 * **A twin of the first dozen lines of `ClearanceOverlay`**, deliberately: the
 * question being asked is where the wall was cut, and the answer is three
 * numbers the overlay computes and draws without ever naming. It uses the
 * package's own `wallCorners`, `lastRise` and `clipped`, so only the formula
 * between them is copied here — if that formula changes upstream, this block
 * goes stale and the numbers it prints stop matching the picture. Check it
 * against `scratchpad/reach-probe.mjs`, which is the authority.
 */
const clipping = (input: ClearanceDebugInput): string => {
  const { extent, scale, fontSize, cuttingRadius } = input
  const granted = input.granted
  const noise = extent.height * 0.0005
  const corners = wallCorners(input.profile, noise)
  const sheetEdge = extent.radius + (granted.padding.plus + (granted.reserve?.plus ?? 0)) / scale
  const wanted = corners.length === 0 ? 0 : Math.max(lastRise(corners), cuttingRadius) + 2
  const wallEdge = Math.max(Math.min(wanted, sheetEdge - fontSize * 0.5), cuttingRadius + 1)
  const wall = clipped(corners, wallEdge, extent.height)
  const cutBy =
    wanted > sheetEdge - fontSize * 0.5
      ? 'the sheet — the flank granted less room than the wall wanted'
      : wallEdge <= cuttingRadius + 1
        ? 'the floor — the wall was pushed back to the cut itself'
        : 'nothing — the wall got the room it asked for'
  return [
    `  staircase:  ${corners.length} corners, last rise at r ${round(lastRise(corners))}, last corner ${point(last(corners))}`,
    `  sheet edge: ${round(sheetEdge)} mm  (extent radius ${round(extent.radius)} + (padding ${round(granted.padding.plus)} + reserve ${round(granted.reserve?.plus ?? 0)}) px / ${round(scale)} px per mm)`,
    `  wall wants: ${round(wanted)} mm   gets: ${round(wallEdge)} mm`,
    `  clipped by: ${cutBy}`,
    `  drawn wall: ${wall.length} knots, last ${point(last(wall))}`,
  ].join('\n')
}

/** The whole report, as one string to read in the console. */
export const clearanceReport = (input: ClearanceDebugInput): string =>
  [
    '=== clearance debug ===',
    `about:    ${input.about}`,
    `units:    millimetres throughout`,
    `curve:    ${input.curve.horizontalOffset.length} knots`,
    `  horizontalOffset ${JSON.stringify([...input.curve.horizontalOffset])}`,
    `  verticalOffset   ${JSON.stringify([...input.curve.verticalOffset])}`,
    `radius:   cutting ${round(input.cuttingRadius)} mm`,
    `extent:   height ${round(input.extent.height)} mm, radius ${round(input.extent.radius)} mm`,
    `box:      ${round(input.box.width)} × ${round(input.box.height)} px${input.box.width === 0 ? ' (not measured yet)' : ''}`,
    `padding:  asked ${JSON.stringify(input.asked)} px`,
    `          granted ${JSON.stringify(input.granted.padding)} px, reserve ${JSON.stringify(input.granted.reserve)} px`,
    `frame:    scale ${round(input.scale)} px/mm, type ${round(input.fontSize)} mm, viewBox "${input.viewBox}"`,
    `margins:  radial ${round(input.margins.radial)} mm, axial ${round(input.margins.axial)} mm`,
    `stickout: ${input.stickout === null ? '— (tool alone)' : `${round(input.stickout)} mm below the holder`}`,
    '',
    'unit check:',
    unitCheck(input),
    '',
    'where the wall is cut:',
    clipping(input),
    '=== end ===',
  ].join('\n')
