import type { ReachCurve } from '@toolpath/part-contracts'
import { heightAt, type Margins } from './clearance.js'
import { assemblyOutline, type OutlinePart, type OutlineSegment } from './outline.js'
import type { Assembly } from './toolholding.js'

/**
 * How much room an assembly actually has, at its two tightest points.
 *
 * `clearance` answers whether the stack clears; this answers **by how much**,
 * which is a different question and the one somebody choosing between two
 * assemblies is asking. It lived inside the drawing, where nothing else could
 * read it — so the list could not say "most clearance" and mean the same
 * number the drawing dimensions (2026-08-31).
 *
 * The two are measured **at their own points**, because they need not be the
 * same one (Paul, 2026-08-30: "the measurements don't need to originate from
 * the same face"): the least room above the material, and the least room
 * sideways to a wall standing taller than the part beside it.
 */

/** A hair, as the sweep's own tolerance: a gap a femtometre under the room wanted is the room wanted. */
const GAP_TOLERANCE = 1e-6

/** The parts of the stack the sweep checks: everything above the flutes. */
const SWEPT: ReadonlySet<OutlinePart> = new Set<OutlinePart>([
  'neck',
  'shank',
  'collet',
  'nose',
  'body',
  'flange',
])

export interface Gap {
  readonly part: OutlinePart
  /** Where on the stack it was measured: radius from the axis, height above the tip, mm. */
  readonly r: number
  readonly z: number
  /** The room measured, mm — negative is into the material. */
  readonly gap: number
  /** Whether that much meets the room the shop asked for. */
  readonly clears: boolean
}

/** The axial gap also carries the wall it was measured from. */
export interface AxialGap extends Gap {
  /** How high the material stands at this part's offset, mm. */
  readonly wall: number
}

export interface Gaps {
  /** Up from the material to the part above it. Null with nothing swept. */
  readonly axial: AxialGap | null
  /** Sideways to a wall taller than the part. Null where nothing stands taller. */
  readonly radial: Gap | null
}

/**
 * The point of the stack with the least room over the material.
 *
 * What is measured is the gap between the wall and the part; what decides is
 * whether that gap is at least the axial room wanted. A gap exactly the room
 * is a pass, not "0.000 short" (Paul, 2026-08-30).
 */
const axialGap = (
  segments: ReadonlyArray<OutlineSegment>,
  curve: ReachCurve,
  cuttingRadius: number,
  margins: Margins,
): AxialGap | null => {
  let best: AxialGap | null = null
  for (const segment of segments) {
    if (!SWEPT.has(segment.part)) {
      continue
    }
    for (const point of segment.points) {
      const offset = point.r + margins.radial - cuttingRadius
      if (offset <= 0) {
        continue
      }
      const wall = heightAt(curve, offset)
      const gap = point.z - wall
      if (best === null || gap < best.gap) {
        best = {
          part: segment.part,
          r: point.r,
          z: point.z,
          wall,
          gap,
          clears: gap + GAP_TOLERANCE >= margins.axial,
        }
      }
    }
  }
  return best
}

/**
 * Where the wall face stands at a given height, as an offset from the cut:
 * the start of the first run of the staircase that rises above that height.
 * Null where nothing stands that tall — no wall to measure to.
 */
export const wallFaceAt = (curve: ReachCurve, z: number): number | null => {
  let from = 0
  for (let index = 0; index < curve.horizontalOffset.length; index += 1) {
    if ((curve.verticalOffset[index] ?? 0) > z + GAP_TOLERANCE) {
      return from
    }
    from = curve.horizontalOffset[index] ?? from
  }
  return null
}

/**
 * The point of the stack nearest, sideways, to a wall taller than it — found
 * on its own, because it need not be the point with the least room above the
 * wall. Null where nothing stands taller than any part.
 */
const radialGap = (
  segments: ReadonlyArray<OutlineSegment>,
  curve: ReachCurve,
  cuttingRadius: number,
  margins: Margins,
): Gap | null => {
  let best: Gap | null = null
  for (const segment of segments) {
    if (!SWEPT.has(segment.part)) {
      continue
    }
    for (const point of segment.points) {
      const face = wallFaceAt(curve, point.z)
      if (face === null) {
        continue
      }
      const gap = cuttingRadius + face - point.r
      if (best === null || gap < best.gap) {
        best = {
          part: segment.part,
          r: point.r,
          z: point.z,
          gap,
          clears: gap + GAP_TOLERANCE >= margins.radial,
        }
      }
    }
  }
  return best
}

/** Both gaps, each at its own tightest point. */
export const tightestGaps = (assembly: Assembly, curve: ReachCurve, margins: Margins): Gaps => {
  const cuttingRadius = (assembly.tool.geometry.DC ?? 0) / 2
  const { segments } = assemblyOutline(assembly)
  const radial = radialGap(segments, curve, cuttingRadius, margins)
  return {
    axial: axialGap(segments, curve, cuttingRadius, margins),
    // Nothing standing beside it is not "no room": it is nothing to measure.
    radial: radial && radial.gap > GAP_TOLERANCE ? radial : null,
  }
}
