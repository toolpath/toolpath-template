import {
  NO_MARGINS,
  assemblyOutline,
  clearance,
  heightAt,
  materialProfile,
  type Assembly,
  type CatalogTool,
  type Margins,
  type OutlinePart,
  type OutlinePoint,
  type OutlineSegment,
} from '@toolpath/catalog-data'
import type { ReachCurve } from '@toolpath/part-contracts'
import { formatLength, type Unit } from '@toolpath/domain/units'
import { classNames } from '@toolpath/domain/class-names'
import { assemblyLabel } from 'shared/assemblies'

/**
 * The assembly, drawn.
 *
 * A side elevation from stated dimensions, fitted to the stack alone so the
 * assembly fills the panel — Paul's call (2026-08-30): the part in section
 * and the dimensions on the tool were a mess, and the numbers are listed
 * under the drawing instead. What the drawing still says: what collides,
 * painted, from the sweep over the feature's reach curve — and, on the right
 * of the stack, **the wall it was swept against** (Paul, 2026-08-30: "show me
 * why this is red"): the part wall at the cut, the worst-case staircase the
 * reach curve describes, the room wanted as a dashed line outside it, and a
 * dimension at the one point that decides the verdict, with the number the
 * check used. The stack's scale is untouched; the wall is clipped at the edge.
 *
 * **Every line is solid**: flutes pale yellow, shank one light grey whatever
 * its provenance, the holder grey up to the spindle connection, which is
 * darker. What was derived or assumed is on the element as
 * `data-provenance`, and named in the caption.
 */

const FILL: Record<OutlinePart, string> = {
  tip: 'fill-yellow-100',
  flutes: 'fill-yellow-100',
  // The reduced section, a shade apart from the shank so the relief reads.
  neck: 'fill-zinc-400',
  shank: 'fill-zinc-300',
  collet: 'fill-zinc-500',
  nose: 'fill-zinc-500',
  body: 'fill-zinc-500',
  flange: 'fill-zinc-700',
}

/** The spindle connection: the flange, and the cone nobody states that leads up to it. */
const isConnection = (segment: OutlineSegment): boolean =>
  segment.part === 'flange' || (segment.part === 'body' && segment.provenance === 'assumed')

/** The parts of the stack the sweep checks: everything above the flutes. */
const SWEPT: ReadonlySet<OutlinePart> = new Set<OutlinePart>([
  'neck',
  'shank',
  'collet',
  'nose',
  'body',
  'flange',
])

/** A hair, as the sweep's own tolerance: a gap a femtometre under the room wanted is the room wanted. */
const GAP_TOLERANCE = 1e-6

interface Deciding {
  readonly part: OutlinePart
  readonly r: number
  readonly z: number
  /** How high the material stands at this part's offset, mm. */
  readonly wall: number
  /** The measured gap from the wall up to the part, mm — negative is into the material. */
  readonly gap: number
  /** Whether the gap meets the room wanted, as the sweep reads it. */
  readonly clears: boolean
}

/**
 * The point of the stack with the least room over the material — the one the
 * verdict turns on. What is measured is the gap between the wall and the
 * part; what decides is whether that gap is at least the axial room wanted.
 * A gap exactly the room is a pass, not "0.000 short" (Paul, 2026-08-30).
 */
const decidingPoint = (
  segments: ReadonlyArray<OutlineSegment>,
  curve: ReachCurve,
  cuttingRadius: number,
  margins: Margins,
): Deciding | null => {
  let best: Deciding | null = null
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
const wallFaceAt = (curve: ReachCurve, z: number): number | null => {
  let from = 0
  for (let index = 0; index < curve.horizontalOffset.length; index += 1) {
    if ((curve.verticalOffset[index] ?? 0) > z + GAP_TOLERANCE) {
      return from
    }
    from = curve.horizontalOffset[index] ?? from
  }
  return null
}

/** An arrowhead as a polygon: at (x, y), pointing `dir` (up, down, left, right). */
const arrow = (
  x: number,
  y: number,
  dir: 'up' | 'down' | 'left' | 'right',
  size: number,
): string => {
  const w = size * 0.45
  switch (dir) {
    case 'up':
      return `${x},${y} ${x - w},${y + size} ${x + w},${y + size}`
    case 'down':
      return `${x},${y} ${x - w},${y - size} ${x + w},${y - size}`
    case 'left':
      return `${x},${y} ${x + size},${y - w} ${x + size},${y + w}`
    default:
      return `${x},${y} ${x - size},${y - w} ${x - size},${y + w}`
  }
}

interface Sideways {
  readonly part: OutlinePart
  readonly r: number
  readonly z: number
  /** From the part's edge to the face of the wall standing taller than it, mm. */
  readonly gap: number
  readonly clears: boolean
}

/**
 * The point of the stack nearest, sideways, to a wall taller than it — found
 * on its own, because it need not be the point with the least room above
 * the wall (Paul, 2026-08-30: "the measurements don't need to originate from
 * the same face"). Null where nothing stands taller than any part.
 */
const sidewaysPoint = (
  segments: ReadonlyArray<OutlineSegment>,
  curve: ReachCurve,
  cuttingRadius: number,
  margins: Margins,
): Sideways | null => {
  let best: Sideways | null = null
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

/** The caption's sentence for the tightest points, in the page's unit. */
const describeDeciding = (
  deciding: Deciding,
  sideways: Sideways | null,
  margins: Margins,
  unit: Unit,
): string => {
  const up =
    deciding.gap < 0
      ? `${formatLength(-deciding.gap, unit)} into the wall at the ${deciding.part}`
      : `${formatLength(deciding.gap, unit)} above the wall at the ${deciding.part}`
  const side =
    sideways === null || sideways.gap <= GAP_TOLERANCE
      ? ''
      : ` · ${formatLength(sideways.gap, unit)} from the wall at the ${sideways.part}`
  return `tightest: ${up}${side} — ${formatLength(margins.axial, unit)} up and ${formatLength(margins.radial, unit)} sideways wanted`
}

/**
 * The wall's corners: where the height changes, the point at the start of
 * the new height (the rise comes at the start of a run, so the corner is on
 * or outside the material). A rise smaller than `noise` is float noise and
 * makes no corner; nothing else is dropped — a
 * sampled fillet keeps every corner, which is what lets `wallPath` draw it
 * as the arc it is (Paul, 2026-08-30: thinning to chords had turned a
 * fillet into a chamfer).
 */
export const wallCorners = (
  profile: ReadonlyArray<OutlinePoint>,
  noise: number,
): Array<OutlinePoint> => {
  const corners: Array<OutlinePoint> = []
  for (const point of profile) {
    const last = corners[corners.length - 1]
    if (!last) {
      corners.push(point)
      continue
    }
    // A corner is a change of height; a change under the noise is no corner.
    if (Math.abs(point.z - last.z) < noise) {
      continue
    }
    corners.push({ r: point.r, z: point.z })
  }
  const last = profile[profile.length - 1]
  const kept = corners[corners.length - 1]
  if (last && kept && (last.r !== kept.r || last.z !== kept.z)) {
    corners.push(last)
  }
  return corners
}

/**
 * The wall as an SVG path that looks like the geometry it came from.
 *
 * The reach curve samples a curved surface — a fillet, a draft — as a run of
 * closely spaced rises; a vertical wall or a step is one big rise. A corner
 * whose neighbours on both sides are within `smooth.run` across and
 * `smooth.rise` up belongs to a curve and is passed through with a
 * Catmull-Rom spline; any other corner stays a sharp line join. So a fillet
 * reads as the arc it is and a wall as the wall it is (Paul, 2026-08-30:
 * "more closely resemble the actual geometry", after chords made a fillet
 * read as a chamfer).
 */
export const wallPath = (
  points: ReadonlyArray<OutlinePoint>,
  smooth: { readonly run: number; readonly rise: number },
  x: (r: number) => number,
  y: (z: number) => number,
): string => {
  if (points.length === 0) {
    return ''
  }
  const close = (a: OutlinePoint, b: OutlinePoint) =>
    Math.abs(a.r - b.r) < smooth.run && Math.abs(a.z - b.z) < smooth.rise
  const isSmooth = (index: number): boolean => {
    const previous = points[index - 1]
    const here = points[index]!
    const next = points[index + 1]
    return (
      previous !== undefined && next !== undefined && close(previous, here) && close(here, next)
    )
  }
  const at = (point: OutlinePoint) => `${x(point.r).toFixed(2)},${y(point.z).toFixed(2)}`
  let d = `M${at(points[0]!)}`
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]!
    const to = points[index]!
    // A spline segment only between two corners that both sit inside a curve.
    if (isSmooth(index - 1) && isSmooth(index)) {
      const before = points[index - 2] ?? from
      const after = points[index + 1] ?? to
      const c1 = { r: from.r + (to.r - before.r) / 6, z: from.z + (to.z - before.z) / 6 }
      const c2 = { r: to.r - (after.r - from.r) / 6, z: to.z - (after.z - from.z) / 6 }
      d += ` C${at(c1)} ${at(c2)} ${at(to)}`
    } else {
      d += ` L${at(to)}`
    }
  }
  return d
}

/** The staircase as a polygon, clipped at the drawing's right edge and its top. */
const clipped = (
  profile: ReadonlyArray<OutlinePoint>,
  edge: number,
  ceiling: number,
): Array<OutlinePoint> => {
  const points: Array<OutlinePoint> = []
  for (const point of profile) {
    if (point.r >= edge) {
      points.push({ r: edge, z: Math.min(point.z, ceiling) })
      break
    }
    points.push({ r: point.r, z: Math.min(point.z, ceiling) })
  }
  const last = points[points.length - 1]
  if (last && last.r < edge) {
    points.push({ r: edge, z: last.z })
  }
  return points
}

const ASSUMED: Partial<Record<OutlinePart, string>> = {
  tip: 'point angle',
  nose: 'nose length',
  body: 'body cone',
  flange: 'flange thickness',
}

export interface AssemblyDrawingProps {
  readonly tool: CatalogTool
  /** The stack around the tool, or null to draw the tool alone. */
  readonly assembly?: Assembly | null
  readonly unit: Unit
  /** The material around the feature: swept to paint what collides, and drawn beside the stack as the wall it was swept against. */
  readonly curve?: ReachCurve | null
  /** Room the shop wants kept between the stack and the part. */
  readonly margins?: Margins
}

export const AssemblyDrawing = ({
  tool,
  assembly = null,
  unit,
  curve = null,
  margins = NO_MARGINS,
}: AssemblyDrawingProps) => {
  const outline = assemblyOutline(assembly ?? { tool, holder: null, stickout: null })
  if (outline.segments.length === 0) {
    return (
      <p className="p-4 text-sm text-zinc-400">
        {tool.catalogNumber} states no diameter or flute length, so there is nothing to draw.
      </p>
    )
  }

  const verdict = curve && assembly ? clearance(assembly, curve, margins) : null
  const hit = new Set<OutlinePart>((verdict?.collisions ?? []).map((each) => each.part))
  const assumed = [
    ...new Set(
      outline.segments
        .filter((segment) => segment.provenance === 'assumed')
        .map((segment) => ASSUMED[segment.part] ?? segment.part),
    ),
  ]

  // The drawing's own space is millimetres; the viewBox does the scaling, and
  // it is fitted to the stack alone, so the assembly fills whatever it is given.
  // The wall gets a few millimetres past the widest part, not a change of scale.
  const left = -outline.radius - 3
  const right = outline.radius + (curve ? 38 : 3)
  const top = outline.height + 3
  const bottom = -3
  const width = right - left
  const height = top - bottom
  const x = (r: number) => r - left
  const y = (z: number) => top - z
  const fontSize = Math.max(1.5, height * 0.018)

  // The wall the sweep read, to the right of the stack: the part's own wall
  // at the cut, the staircase, and the room wanted outside it.
  const cuttingRadius = (tool.geometry.DC ?? 0) / 2
  const profile =
    curve && tool.geometry.DC !== undefined ? materialProfile(curve, cuttingRadius) : null
  const wall = profile ? clipped(wallCorners(profile, height * 0.0005), right, top) : null
  // Closely spaced across, and no rise the size of a wall: a sampled curve.
  const smooth = { run: width * 0.03, rise: height * 0.06 }
  const room =
    profile && (margins.radial > 0 || margins.axial > 0)
      ? clipped(
          wallCorners(
            profile.map((point) => ({
              r: Math.max(cuttingRadius, point.r - margins.radial),
              z: point.z + margins.axial,
            })),
            height * 0.0005,
          ),
          right,
          top,
        )
      : null
  const wallAtCut = curve?.verticalOffset[0] ?? 0
  const deciding =
    curve && assembly ? decidingPoint(outline.segments, curve, cuttingRadius, margins) : null
  // The two clearances, each at its own tightest point: up from the wall to
  // the part above it, and sideways from a part to the wall face beside it.
  const sideways =
    curve && assembly
      ? (() => {
          const found = sidewaysPoint(outline.segments, curve, cuttingRadius, margins)
          return found && found.gap > GAP_TOLERANCE ? found : null
        })()
      : null
  // The readouts sit in a column at the right edge, clear of the stack and of
  // what they measure, each with a leader to its dimension.
  const columnX = right - 27
  return (
    <figure className="flex size-full min-h-0 flex-col">
      <figcaption className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 py-2 text-xs text-zinc-400">
        <span className="truncate font-mono text-zinc-200">
          {assembly ? assemblyLabel(assembly) : tool.catalogNumber}
        </span>
        {verdict ? (
          <span
            className={classNames(
              'ml-auto shrink-0',
              verdict.clears ? 'text-zinc-400' : 'text-danger',
            )}
          >
            {verdict.clears ? 'clears the part' : 'collides with the part'}
          </span>
        ) : null}
        {deciding ? (
          <span className="text-2xs basis-full text-zinc-500">
            {describeDeciding(deciding, sideways, margins, unit)}
          </span>
        ) : null}
      </figcaption>
      <svg
        role="img"
        aria-label={`${assembly ? assemblyLabel(assembly) : tool.catalogNumber}, drawn from its stated dimensions`}
        viewBox={`0 0 ${width} ${height}`}
        className="min-h-0 flex-1"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* The wall the sweep read, on the right of the stack only. */}
        {wall ? (
          <g data-wall>
            <path
              data-part="material"
              d={`${wallPath(wall, smooth, x, y)} L${x(right).toFixed(2)},${y(0).toFixed(2)} L${x(cuttingRadius).toFixed(2)},${y(0).toFixed(2)} Z`}
              className="fill-zinc-800/70 stroke-zinc-500"
              strokeWidth={0.3}
              strokeLinejoin="round"
            />
            {/* The part's own wall at the cut, where the flutes are. */}
            <line
              x1={x(cuttingRadius)}
              y1={y(0)}
              x2={x(cuttingRadius)}
              y2={y(Math.min(wallAtCut, top))}
              className="stroke-zinc-200"
              strokeWidth={0.5}
            />
            {room ? (
              <path
                data-part="room"
                d={wallPath(room, smooth, x, y)}
                className="fill-none stroke-info"
                strokeWidth={0.3}
                strokeLinejoin="round"
                strokeDasharray="1.2 0.8"
              />
            ) : null}
          </g>
        ) : null}

        {/* Each segment mirrored about the axis: a body of revolution in elevation. */}
        {outline.segments.map((segment, index) => {
          const rightSide = segment.points.map((each) => `${x(each.r)},${y(each.z)}`)
          const leftSide = [...segment.points].reverse().map((each) => `${x(-each.r)},${y(each.z)}`)
          const shade = isConnection(segment) ? FILL.flange : FILL[segment.part]
          return (
            <polygon
              key={`${segment.part}-${String(index)}`}
              data-part={segment.part}
              data-provenance={segment.provenance}
              points={[...rightSide, ...leftSide].join(' ')}
              className={classNames(
                hit.has(segment.part) ? 'fill-danger/70 stroke-danger' : shade,
                'stroke-zinc-950',
              )}
              strokeWidth={0.4}
            />
          )
        })}

        {/* The two clearances, each at its own tightest point, readouts in the column at the right (Paul, 2026-08-30). */}
        {deciding && curve
          ? (() => {
              const head = fontSize * 0.9
              const halo = (text: string) => (text.length + 1) * fontSize * 0.62
              // Up: a vertical dimension just right of the corner, from the wall under it to the part.
              const upTone = deciding.clears ? 'stroke-emerald-300' : 'stroke-danger'
              const upFill = deciding.clears ? 'fill-emerald-300' : 'fill-danger'
              const cornerX = x(deciding.r)
              const partY = y(deciding.z)
              const wallY = y(Math.min(deciding.wall, top))
              const dimX = cornerX + fontSize * 2.4
              const inside = Math.abs(wallY - partY) >= head * 2.6
              const upperY = Math.min(partY, wallY)
              const lowerY = Math.max(partY, wallY)
              const upText = `${deciding.gap < 0 ? '−' : ''}${formatLength(Math.abs(deciding.gap), unit)} up`
              // Sideways: a horizontal dimension at its own point's height, from the part's edge to the wall face.
              const sideTone = sideways?.clears ? 'stroke-emerald-300' : 'stroke-danger'
              const sideFill = sideways?.clears ? 'fill-emerald-300' : 'fill-danger'
              const sideY = sideways ? y(sideways.z) - fontSize * 0.9 : 0
              const edgeX = sideways ? x(sideways.r) : 0
              const faceX = sideways ? x(sideways.r + sideways.gap) : 0
              const sideInside = sideways ? faceX - edgeX >= head * 2.6 : false
              const sideText = sideways ? `${formatLength(sideways.gap, unit)} sideways` : ''
              // The column: one readout per dimension, pushed apart when they would overlap.
              const upLabelY = (upperY + lowerY) / 2
              let sideLabelY = sideways ? sideY : null
              if (sideLabelY !== null && Math.abs(sideLabelY - upLabelY) < fontSize * 2.2) {
                sideLabelY =
                  sideLabelY <= upLabelY ? upLabelY - fontSize * 2.2 : upLabelY + fontSize * 2.2
              }
              return (
                <g
                  data-tight={deciding.part}
                  data-clears={deciding.clears}
                  data-sideways={sideways?.part ?? ''}
                >
                  <line
                    x1={cornerX}
                    y1={partY}
                    x2={dimX + fontSize * 0.8}
                    y2={partY}
                    className="stroke-zinc-400"
                    strokeWidth={0.25}
                  />
                  <line
                    x1={cornerX}
                    y1={wallY}
                    x2={dimX + fontSize * 0.8}
                    y2={wallY}
                    className="stroke-zinc-400"
                    strokeWidth={0.25}
                  />
                  {inside ? (
                    <>
                      <line
                        x1={dimX}
                        y1={upperY}
                        x2={dimX}
                        y2={lowerY}
                        className={upTone}
                        strokeWidth={0.4}
                      />
                      <polygon points={arrow(dimX, upperY, 'up', head)} className={upFill} />
                      <polygon points={arrow(dimX, lowerY, 'down', head)} className={upFill} />
                    </>
                  ) : (
                    <>
                      <line
                        x1={dimX}
                        y1={upperY - head * 2.2}
                        x2={dimX}
                        y2={lowerY + head * 2.2}
                        className={upTone}
                        strokeWidth={0.4}
                      />
                      <polygon points={arrow(dimX, upperY, 'down', head)} className={upFill} />
                      <polygon points={arrow(dimX, lowerY, 'up', head)} className={upFill} />
                    </>
                  )}
                  <line
                    x1={dimX}
                    y1={upLabelY}
                    x2={x(columnX) - 1}
                    y2={upLabelY}
                    className="stroke-zinc-500"
                    strokeWidth={0.25}
                    strokeDasharray="0.8 0.6"
                  />
                  <rect
                    x={x(columnX)}
                    y={upLabelY - fontSize * 0.75}
                    width={halo(upText)}
                    height={fontSize * 1.45}
                    rx={0.4}
                    className="fill-zinc-950/85"
                  />
                  <text
                    x={x(columnX) + fontSize * 0.3}
                    y={upLabelY + fontSize * 0.38}
                    fontSize={fontSize}
                    className="font-mono"
                    data-dim="axial"
                  >
                    <tspan className={upFill}>{upText.replace(/ up$/, '')}</tspan>
                    <tspan className="fill-zinc-500"> up</tspan>
                  </text>
                  {sideways && sideLabelY !== null ? (
                    <>
                      <line
                        x1={edgeX}
                        y1={y(sideways.z)}
                        x2={edgeX}
                        y2={sideY - fontSize * 0.8}
                        className="stroke-zinc-400"
                        strokeWidth={0.25}
                      />
                      <line
                        x1={faceX}
                        y1={y(sideways.z)}
                        x2={faceX}
                        y2={sideY - fontSize * 0.8}
                        className="stroke-zinc-400"
                        strokeWidth={0.25}
                      />
                      {sideInside ? (
                        <>
                          <line
                            x1={edgeX}
                            y1={sideY}
                            x2={faceX}
                            y2={sideY}
                            className={sideTone}
                            strokeWidth={0.4}
                          />
                          <polygon
                            points={arrow(edgeX, sideY, 'left', head)}
                            className={sideFill}
                          />
                          <polygon
                            points={arrow(faceX, sideY, 'right', head)}
                            className={sideFill}
                          />
                        </>
                      ) : (
                        <>
                          <line
                            x1={edgeX - head * 2.2}
                            y1={sideY}
                            x2={faceX + head * 2.2}
                            y2={sideY}
                            className={sideTone}
                            strokeWidth={0.4}
                          />
                          <polygon
                            points={arrow(edgeX, sideY, 'right', head)}
                            className={sideFill}
                          />
                          <polygon
                            points={arrow(faceX, sideY, 'left', head)}
                            className={sideFill}
                          />
                        </>
                      )}
                      <line
                        x1={faceX + (sideInside ? 0 : head * 2.2)}
                        y1={sideY}
                        x2={x(columnX) - 1}
                        y2={sideLabelY}
                        className="stroke-zinc-500"
                        strokeWidth={0.25}
                        strokeDasharray="0.8 0.6"
                      />
                      <rect
                        x={x(columnX)}
                        y={sideLabelY - fontSize * 0.75}
                        width={halo(sideText)}
                        height={fontSize * 1.45}
                        rx={0.4}
                        className="fill-zinc-950/85"
                      />
                      <text
                        x={x(columnX) + fontSize * 0.3}
                        y={sideLabelY + fontSize * 0.38}
                        fontSize={fontSize}
                        className="font-mono"
                        data-dim="radial"
                      >
                        <tspan className={sideFill}>{formatLength(sideways.gap, unit)}</tspan>
                        <tspan className="fill-zinc-500"> sideways</tspan>
                      </text>
                    </>
                  ) : null}
                </g>
              )
            })()
          : null}

        {/* The axis. */}
        <line
          x1={x(0)}
          y1={y(-4)}
          x2={x(0)}
          y2={y(outline.height + 4)}
          className="stroke-zinc-700"
          strokeWidth={0.3}
        />
      </svg>
      <p className="text-2xs px-3 pb-2 text-zinc-600">
        Drawn from stated dimensions{assumed.length > 0 ? `; ${assumed.join(', ')} assumed` : ''}.
        {assembly && assembly.holder.gaugeLength === null
          ? ' The holder length is not stated.'
          : ''}
      </p>
    </figure>
  )
}
