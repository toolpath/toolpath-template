import type { ReachCurve } from '@toolpath/part-contracts'
import { heightAt } from './clearance.js'

/**
 * The feature in section, with the tool in it.
 *
 * A cross-section through the feature at its **worst-case place** — the
 * tightest spot the tool has to reach — drawn the way a machinist sketches a
 * setup: the tool's tip on the feature's bottom, its cutting edge against the
 * wall, the wall up to the feature's top, and the part above and beyond it
 * standing as tall as the reach curve says it can. A drill sits on the hole's
 * axis instead, because a drill does not hug a wall.
 *
 * Everything is from the datasheet: the depth from `zMax − zMin`, the width
 * from the tightest clearance (`cd.ignore.min`) or a hole's diameter, the
 * fillet from `filletRadius`, a hole's bottom from `fullConeDeg`, the top of
 * the part from the highest feature cut the same way, and the material
 * beyond the wall from the reach curve — the same staircase the sweep walks,
 * so what the drawing shows the holder clearing is what the check cleared.
 *
 * Coordinates are millimetres in the drawing's own frame: `x` across from the
 * tool's axis, `z` up from the feature's bottom.
 */

export type SectionKind = 'pocket' | 'hole' | 'wall' | 'face'

export interface FeatureSection {
  readonly kind: SectionKind
  /** The feature's own height, `zMax − zMin`. */
  readonly depth: number
  /** False for a through feature: nothing is drawn under the bottom. */
  readonly hasFloor: boolean
  /** Across the tightest place, or a hole's diameter; null where the datasheet does not say. */
  readonly width: number | null
  /** The floor fillet, 0 for a sharp corner. */
  readonly filletRadius: number
  /** A hole's bottom cone, full angle; 180 or null is flat. */
  readonly coneDeg: number | null
  /** The top of the part above the feature's bottom, which is what the holder must clear. */
  readonly topAbove: number
  readonly curve: ReachCurve | null
}

export interface SectionPoint {
  readonly x: number
  readonly z: number
}

export interface Section {
  /** Closed polygons of material, to hatch. */
  readonly material: ReadonlyArray<ReadonlyArray<SectionPoint>>
  /** The surface the tip sits on, across, or null for a through feature. */
  readonly floor: { readonly from: number; readonly to: number } | null
  readonly leftWall: number | null
  readonly rightWall: number | null
  readonly extent: {
    readonly left: number
    readonly right: number
    readonly top: number
    readonly bottom: number
  }
}

/** Forms that sit on a hole's axis rather than against its wall. */
const ON_AXIS: ReadonlySet<string> = new Set([
  'drill',
  'spot drill',
  'center drill',
  'reamer',
  'counter sink',
  'counter bore',
  'boring bar',
  'tap right hand',
  'tap left hand',
  'thread mill',
])

/** Stock drawn under a floor, mm: enough to read as solid, not a claim about thickness. */
export const FLOOR_BAND = 6
/** Part drawn beyond the last thing the datasheet states, mm. */
export const REACH = 12

const exact = (value: number): number => Math.round(value * 1e6) / 1e6

/** A quarter arc of a floor fillet, from the floor tangent up to the wall tangent. */
const filletArc = (
  corner: SectionPoint,
  radius: number,
  side: 1 | -1,
  steps = 6,
): Array<SectionPoint> =>
  Array.from({ length: steps + 1 }, (_, index) => {
    // From straight down (on the floor, one radius in from the wall) round to
    // straight across (on the wall, one radius up).
    const angle = (-90 + (90 * index) / steps) * (Math.PI / 180)
    const centre = { x: corner.x + side * radius, z: corner.z + radius }
    return {
      x: exact(centre.x - side * radius * Math.cos(angle)),
      z: exact(centre.z + radius * Math.sin(angle)),
    }
  })

/**
 * The material beyond one wall, as a staircase from the tool's edge outward.
 *
 * `fromEdge` is how far the wall stands from the tool's cutting edge; the
 * curve's offsets are from that edge. Heights are the sweep's own reading —
 * every offset up to a knot is as tall as the knot says — so the staircase
 * rises at the start of each run, exactly as `materialProfile` draws it.
 * Returns (distance beyond the wall, height) pairs, ending `reach` past the
 * last knot.
 */
const staircase = (
  curve: ReachCurve | null,
  fromEdge: number,
  floorAt: number,
  topAbove: number,
  reach: number,
): Array<{ s: number; z: number }> => {
  if (!curve || curve.horizontalOffset.length === 0) {
    return [
      { s: 0, z: Math.max(floorAt, topAbove) },
      { s: reach, z: Math.max(floorAt, topAbove) },
    ]
  }
  const out: Array<{ s: number; z: number }> = []
  let from = fromEdge
  curve.horizontalOffset.forEach((offset, index) => {
    if (offset < fromEdge) {
      return
    }
    const height = Math.max(floorAt, curve.verticalOffset[index] ?? 0)
    out.push({ s: from - fromEdge, z: height }, { s: offset - fromEdge, z: height })
    from = offset
  })
  const last = out[out.length - 1]
  const height = last ? last.z : Math.max(floorAt, heightAt(curve, fromEdge))
  if (!last) {
    out.push({ s: 0, z: height })
  }
  out.push({ s: (last?.s ?? 0) + reach, z: height })
  return out
}

/**
 * One wall and the material behind it, as a closed polygon.
 *
 * `side` is −1 for the wall on the tool's left, +1 on its right. From the
 * floor tangent of the fillet, round the fillet, up the wall to the feature's
 * top, then outward along the staircase, then down to the bottom of the
 * drawing and back under the fillet.
 */
const wallPolygon = (
  wallX: number,
  side: 1 | -1,
  section: FeatureSection,
  toolEdge: number,
  bottom: number,
  floorAt: number,
): Array<SectionPoint> => {
  const r = Math.max(0, Math.min(section.filletRadius, section.depth))
  const corner = { x: wallX, z: floorAt }
  const points: Array<SectionPoint> = []
  if (r > 0) {
    points.push(...filletArc(corner, r, side === -1 ? 1 : -1, 6))
  } else {
    points.push(corner)
  }
  points.push({ x: wallX, z: floorAt + section.depth })
  const fromEdge = Math.abs(wallX - toolEdge)
  for (const step of staircase(
    section.curve,
    fromEdge,
    floorAt + section.depth,
    section.topAbove,
    REACH,
  )) {
    points.push({ x: exact(wallX + side * step.s), z: exact(step.z) })
  }
  const far = points[points.length - 1]!.x
  points.push({ x: far, z: bottom })
  points.push({ x: exact(wallX + side * -1 * r), z: bottom })
  return points
}

export const sectionOutline = (
  section: FeatureSection,
  tool: { readonly diameter: number; readonly form: string },
): Section => {
  const R = tool.diameter / 2
  const bottom = section.hasFloor ? -FLOOR_BAND : 0
  const material: Array<Array<SectionPoint>> = []

  if (section.kind === 'face') {
    // The feature is the floor: stock under it across the whole drawing, and
    // whatever stands around it either side, from the reach curve.
    const walls = [-1, 1].map((side) => {
      const rise = staircase(section.curve, 0, 0, section.topAbove, REACH)
      const points = rise.map((step) => ({ x: exact(side * (R + step.s)), z: exact(step.z) }))
      return { side, points, far: points[points.length - 1]!.x }
    })
    const left = walls[0]!.far
    const right = walls[1]!.far
    material.push([
      { x: left, z: 0 },
      { x: right, z: 0 },
      { x: right, z: bottom },
      { x: left, z: bottom },
    ])
    for (const wall of walls) {
      if (wall.points.some((point) => point.z > 0)) {
        material.push([{ x: exact(wall.side * R), z: 0 }, ...wall.points, { x: wall.far, z: 0 }])
      }
    }
    return {
      material,
      floor: { from: left, to: right },
      leftWall: null,
      rightWall: null,
      extent: {
        left,
        right,
        top: Math.max(0, ...walls.flatMap((w) => w.points.map((p) => p.z))),
        bottom,
      },
    }
  }

  const onAxis = section.kind === 'hole' && ON_AXIS.has(tool.form) && section.width !== null
  const leftWall = onAxis ? -(section.width ?? tool.diameter) / 2 : -R
  const width = section.width === null ? null : Math.max(section.width, tool.diameter)
  const rightWall =
    section.kind === 'wall' || width === null ? null : onAxis ? width / 2 : leftWall + width

  // A drilled bottom: the walls stand on the cone's rim, the tip in its apex.
  const coneRise =
    section.kind === 'hole' &&
    section.hasFloor &&
    section.coneDeg !== null &&
    section.coneDeg < 180 &&
    section.filletRadius <= 0
      ? Math.abs(leftWall) / Math.tan(((section.coneDeg / 2) * Math.PI) / 180)
      : 0

  const left = wallPolygon(leftWall, -1, section, -R, bottom, coneRise)
  material.push(left)
  const leftFar = left.find((p) => p.z === bottom)!.x
  let rightFar = leftWall + Math.max(width ?? 0, tool.diameter) + REACH * 2

  if (rightWall !== null) {
    const right = wallPolygon(rightWall, 1, section, R, bottom, coneRise)
    material.push(right)
    rightFar = right.find((p) => p.z === bottom)!.x
  }

  let floor: Section['floor'] = null
  if (section.hasFloor) {
    const r = Math.max(0, Math.min(section.filletRadius, section.depth))
    const from = leftWall + r
    const to = rightWall === null ? rightFar : rightWall - r
    if (coneRise > 0 && rightWall !== null) {
      material.push([
        { x: leftWall, z: exact(coneRise) },
        { x: 0, z: 0 },
        { x: rightWall, z: exact(coneRise) },
        { x: rightWall, z: bottom },
        { x: leftWall, z: bottom },
      ])
    } else {
      material.push([
        { x: from, z: 0 },
        { x: to, z: 0 },
        { x: to, z: bottom },
        { x: from, z: bottom },
      ])
    }
    floor = { from, to }
  }

  const top = Math.max(...material.flatMap((polygon) => polygon.map((p) => p.z)))
  return {
    material,
    floor,
    leftWall,
    rightWall,
    extent: { left: leftFar, right: rightFar, top, bottom },
  }
}
