import type { ReachCurve } from '@toolpath/part-contracts'
import { hasNeck } from './forms.js'
import type { Assembly, Holder } from './toolholding.js'
import type { CatalogTool, Provenance } from './types.js'

/**
 * An assembly as a drawing: its outline in the plane of its own axis.
 *
 * A tool, a collet and a holder are all bodies of revolution, so the whole
 * stack is one polyline of (radius, height) pairs, from the tip up. That is
 * what a catalog draws, what a lathe would turn, and everything a picture needs
 * — a renderer mirrors it about the axis and it is a silhouette.
 *
 * **Drawn from stated dimensions, and marked where they are not.** Every
 * segment says which part it is and where its numbers came from, so a renderer
 * can dash what was derived or assumed. What nobody states is not drawn: a
 * holder the catalog knows only as a nose diameter and a gauge length is a
 * cylinder of that size and nothing above it, rather than a body invented to
 * look like one.
 */

export type OutlinePart =
  | 'tip'
  | 'flutes'
  | 'neck'
  | 'shank'
  | 'collet'
  | 'nose'
  | 'body'
  | 'flange'

/** Radius out from the axis and height above the tip, both in millimetres. */
export interface OutlinePoint {
  readonly r: number
  readonly z: number
}

export interface OutlineSegment {
  readonly part: OutlinePart
  /** From the lower end up; the last point of one segment is the first of the next. */
  readonly points: ReadonlyArray<OutlinePoint>
  /** Where the dimensions came from — `chosen` for the stickout, which is nobody's but the shop's. */
  readonly provenance: Provenance | 'chosen'
}

export interface Outline {
  readonly segments: ReadonlyArray<OutlineSegment>
  /** The tallest point drawn, above the tip. */
  readonly height: number
  /** The widest radius drawn. */
  readonly radius: number
}

const stated = (tool: CatalogTool, code: string): Provenance =>
  tool.provenance[code] ?? 'vendor-stated'

/** Points along a quarter arc from (r0, z0) to (r1, z1) bulging outward, for a ball or a corner. */
const arc = (
  centre: OutlinePoint,
  radius: number,
  fromDeg: number,
  toDeg: number,
  steps = 6,
): Array<OutlinePoint> =>
  Array.from({ length: steps + 1 }, (_, index) => {
    const angle = ((fromDeg + ((toDeg - fromDeg) * index) / steps) * Math.PI) / 180
    // Rounded so a quarter turn lands exactly on the axis rather than 1e-16 off
    // it: a drawing is compared, and a polygon point is written out.
    const exact = (value: number) => Math.round(value * 1e9) / 1e9
    return {
      r: exact(centre.r + radius * Math.cos(angle)),
      z: exact(centre.z + radius * Math.sin(angle)),
    }
  })

/**
 * The tip, by what the tool is.
 *
 * A ball is a half circle, a bull nose a corner radius on a flat, a drill a
 * cone at its point angle, a chamfer mill a right-angle cone. Anything else is
 * flat. The tip is the one place the form changes the outline, and the one
 * place an angle nobody stated is assumed — a drill with no point angle is
 * drawn at 118° and says so.
 */
const tip = (
  tool: CatalogTool,
): { points: Array<OutlinePoint>; provenance: Provenance; top: number } => {
  const DC = tool.geometry.DC ?? 0
  const r = DC / 2
  const RE = tool.geometry.RE ?? 0
  switch (tool.form) {
    case 'ball end mill':
      return { points: arc({ r: 0, z: r }, r, -90, 0), provenance: stated(tool, 'DC'), top: r }
    case 'bull nose end mill': {
      const corner = Math.min(RE, r)
      return {
        points: [
          { r: 0, z: 0 },
          { r: r - corner, z: 0 },
          ...arc({ r: r - corner, z: corner }, corner, -90, 0),
        ],
        provenance: stated(tool, 'RE'),
        top: corner,
      }
    }
    case 'drill':
    case 'spot drill':
    case 'center drill': {
      const angle = tool.geometry.SIG
      const half = ((angle ?? 118) / 2) * (Math.PI / 180)
      const top = r / Math.tan(half)
      return {
        points: [
          { r: 0, z: 0 },
          { r, z: top },
        ],
        provenance: angle === undefined ? 'assumed' : stated(tool, 'SIG'),
        top,
      }
    }
    case 'chamfer mill':
    case 'counter sink':
      return {
        points: [
          { r: 0, z: 0 },
          { r, z: r },
        ],
        provenance: stated(tool, 'DC'),
        top: r,
      }
    default:
      return {
        points: [
          { r: 0, z: 0 },
          { r, z: 0 },
        ],
        provenance: stated(tool, 'DC'),
        top: 0,
      }
  }
}

/**
 * The outline of one assembly at its stickout.
 *
 * Flutes to the flute length, a neck where a shoulder is stated, the shank up
 * to the stickout, and the holder nose above that for its gauge length.
 */
/** What an outline needs: a tool, and a holder at a stickout if there is one. */
export type Outlined = Pick<Assembly, 'tool' | 'stickout'> & { readonly holder: Holder | null }

export const assemblyOutline = (assembly: Outlined): Outline => {
  const { tool, holder, stickout } = assembly
  const { DC, LCF, SFDM } = tool.geometry
  if (DC === undefined || LCF === undefined) {
    return { segments: [], height: 0, radius: 0 }
  }
  const r = DC / 2
  const segments: Array<OutlineSegment> = []

  const point = tip(tool)
  segments.push({ part: 'tip', points: point.points, provenance: point.provenance })

  segments.push({
    part: 'flutes',
    points: [
      { r, z: point.top },
      { r, z: LCF },
    ],
    provenance: stated(tool, 'LCF'),
  })

  const neckDiameter = tool.geometry['shoulder-diameter']
  const shoulder = tool.geometry['shoulder-length']
  let top = LCF
  if (neckDiameter !== undefined && shoulder !== undefined && shoulder > LCF) {
    const rn = neckDiameter / 2
    segments.push({
      // A shoulder as wide as the cut is plain shank; only a narrower one is a neck.
      part: hasNeck(tool) ? 'neck' : 'shank',
      points: [
        { r: rn, z: LCF },
        { r: rn, z: shoulder },
      ],
      provenance: stated(tool, 'shoulder-length'),
    })
    top = shoulder
  }

  const shankTop = stickout ?? tool.geometry.OAL ?? top
  if (SFDM !== undefined && shankTop > top) {
    const rs = SFDM / 2
    segments.push({
      part: 'shank',
      points: [
        { r: rs, z: top },
        { r: rs, z: shankTop },
      ],
      provenance: stickout === null ? stated(tool, 'SFDM') : 'chosen',
    })
    top = shankTop
  }

  if (stickout !== null && holder !== null && holder.noseDiameter !== null) {
    const rh = holder.noseDiameter / 2
    const stated = (code: string): Provenance => holder.provenance[code] ?? 'vendor-stated'

    // The seated collet, standing proud of the nose by its protrusion, at its
    // series diameter — a PG 6 collet is 6 mm across.
    const series = /(\d+(?:\.\d+)?)/.exec(holder.colletSeries ?? '')
    if (holder.colletProtrusion !== null && series) {
      const rc = Number(series[1]) / 2
      segments.push({
        part: 'collet',
        points: [
          { r: rc, z: stickout - holder.colletProtrusion },
          { r: rc, z: stickout },
        ],
        provenance: stated('colletProtrusion'),
      })
    }

    // The nose, for its stated length; with none stated, for the gauge length
    // as before, so an older dataset draws what it always did.
    const noseLength = holder.noseLength ?? holder.gaugeLength ?? Math.max(20, DC * 3)
    segments.push({
      part: 'nose',
      points: [
        { r: rh, z: stickout },
        { r: rh, z: stickout + noseLength },
      ],
      provenance:
        holder.noseLength !== null
          ? stated('noseLength')
          : holder.gaugeLength === null
            ? 'assumed'
            : stated('noseDiameter'),
    })
    top = stickout + noseLength
    let radius = rh

    if (holder.bodyDiameter !== null && holder.bodyLength !== null) {
      const rb = holder.bodyDiameter / 2
      segments.push({
        part: 'body',
        points: [
          { r: rb, z: top },
          { r: rb, z: top + holder.bodyLength },
        ],
        provenance: stated('bodyDiameter'),
      })
      top += holder.bodyLength
      radius = rb
    }

    if (holder.projection !== null && holder.flangeDiameter !== null) {
      const flangeAt = stickout + holder.projection
      const rf = holder.flangeDiameter / 2
      if (flangeAt > top) {
        // Nobody states the shape between the last stated diameter and the
        // flange: a cone, drawn dashed.
        segments.push({
          part: 'body',
          points: [
            { r: radius, z: top },
            { r: rf, z: flangeAt },
          ],
          provenance: 'assumed',
        })
      }
      // The flange itself: its diameter is the taper's, its thickness is not
      // stated here. Drawn as the 20 mm of a BT 30 V-flange, and dashed.
      segments.push({
        part: 'flange',
        points: [
          { r: rf, z: flangeAt },
          { r: rf, z: flangeAt + 20 },
        ],
        provenance: 'assumed',
      })
      top = flangeAt + 20
    }
  }

  const radius = Math.max(...segments.flatMap((each) => each.points.map((p) => p.r)))
  return { segments, height: top, radius }
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
