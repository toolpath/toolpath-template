import type { ReachCurve } from '@toolpath/part-contracts'

/**
 * The material around a feature, as a drawing.
 *
 * **What is left of this module after the tool drawing moved out.** The
 * assembly outline, its tip generators and the outline segment types are now
 * `@toolpath/tool-drawing/geometry`; what stayed is the one function with two
 * drawing consumers rather than one — the clearance overlay draws the wall from
 * it, and `section.ts` draws the feature section from it — and moving it into a
 * rendering package would have put the second of those behind a dependency it
 * has no use for.
 */

/** Radius out from the axis and height above the tip, both in millimetres. */
export interface OutlinePoint {
  readonly r: number
  readonly z: number
}

/**
 * The material around the feature as a drawing beside the tool.
 *
 * The reach curve's offsets are from the wall of the cut, so each knot lands at
 * `cuttingRadius + offset` across. **The staircase is the sweep's, exactly**:
 * `heightAt` reads "material within h[i] rises to v[i]" as *every* offset up
 * to the knot being that tall, so the rise comes at the start of each run,
 * not at its end. Drawn the other way round — up at the knot, as this once
 * was — the picture showed a nose clearing material the sweep had already
 * failed it on, and a drawing that disagrees with its own verdict is worse
 * than none. Past the last knot the material stays at the last height, which
 * is the renderer's to extend to its edge.
 */
export const materialProfile = (curve: ReachCurve, cuttingRadius: number): Array<OutlinePoint> => {
  const points: Array<OutlinePoint> = [{ r: cuttingRadius, z: 0 }]
  const push = (point: OutlinePoint) => {
    const last = points[points.length - 1]
    if (!last || last.r !== point.r || last.z !== point.z) {
      points.push(point)
    }
  }
  let from = 0
  curve.horizontalOffset.forEach((offset, index) => {
    const height = curve.verticalOffset[index] ?? 0
    push({ r: cuttingRadius + from, z: height })
    push({ r: cuttingRadius + offset, z: height })
    from = offset
  })
  return points
}
