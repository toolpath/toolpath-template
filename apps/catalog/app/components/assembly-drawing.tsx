import { useEffect, useId, useRef, useState } from 'react'
import {
  NO_MARGINS,
  assemblyOutline,
  clearance,
  materialProfile,
  tightestGaps,
  type AxialGap,
  type Gap,
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
import {
  bandOffset,
  bandRoom,
  dimensionLayout,
  dimensionsFor,
  laneOffset,
} from 'shared/tool-dimensions'
import { DimensionLines } from './dimension-lines'

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
 * check used.
 *
 * **The 2D part geometry is always secondary to the assembly** (Paul,
 * 2026-08-30). The stack alone sets the frame and the scale; the part is
 * drawn in the room the stack leaves beside it, out to the stack's own
 * half-width at the most, and cut off there at a **break** — the saw-tooth
 * edge of an interrupted view — rather than pushing the stack smaller to fit
 * a wall in. A dimension whose far face falls past the break is broken too,
 * and carries the true number. The part is **hatched**, because it is a
 * section through material and nothing on the stack is.
 *
 * **Every line is solid**: flutes pale yellow, shank one light grey whatever
 * its provenance, the holder grey up to the spindle connection, which is
 * darker. What was derived or assumed is on the element as
 * `data-provenance`, and named in the caption.
 */

/**
 * **Outlined, not blocked in** (Paul, 2026-09-01, against the drawings in the
 * geometry write-up): a drawing of a tool is a silhouette with its sections
 * shaded lightly, so the dimension lines that cross it stay readable. The
 * flutes are hatched — the one section that is not a plain body — and the
 * holder's own parts stay solid, because they are behind the tool rather than
 * part of it.
 */
/**
 * The sheet the tool is drawn on, and the ink it is drawn in.
 *
 * **Hard colours rather than the application's ramp** (Paul, 2026-09-01): a
 * drawing is a drawing in either theme, and the ramp flips under light mode —
 * a "light grey" written as a utility comes out dark on half the machines
 * that open it. These are the sheet, the linework and the two shades a tool
 * has: gold flutes and a steel body.
 */
const SHEET = {
  // White: the sheet is a sheet, and the wash belongs to the panel around it
  // (Paul, 2026-09-01).
  ground: '#ffffff',
  ink: '#3f4650',
  centre: '#15181c',
  dimension: '#606a76',
  body: '#c4c8ce',
  flutes: '#e6bf59',
  holder: '#9aa2ad',
  connection: '#78818d',
} as const

/** The spindle connection: the flange, and the cone nobody states that leads up to it. */
const isConnection = (segment: OutlineSegment): boolean =>
  segment.part === 'flange' || (segment.part === 'body' && segment.provenance === 'assumed')

/** A hair, as the sweep's own tolerance: a gap a femtometre under the room wanted is the room wanted. */
const GAP_TOLERANCE = 1e-6

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

/**
 * A break, as the ragged edge of an interrupted view: the saw-tooth along a
 * vertical edge that says the part carries on past where the drawing stops.
 * It is what lets the part be cut short at all.
 */
const zigzag = (
  atX: number,
  fromY: number,
  toY: number,
  amplitude: number,
): Array<{ readonly x: number; readonly y: number }> => {
  const steps = Math.max(2, Math.round(Math.abs(toY - fromY) / (amplitude * 4)))
  return Array.from({ length: steps + 1 }, (_, index) => {
    const end = index === 0 || index === steps
    return {
      x: atX + (end ? 0 : index % 2 === 1 ? amplitude : -amplitude),
      y: fromY + ((toY - fromY) * index) / steps,
    }
  })
}

/** A zigzag as an SVG points list. */
const points = (path: ReadonlyArray<{ readonly x: number; readonly y: number }>): string =>
  path.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')

/** The caption's sentence for the tightest points, in the page's unit. */
const describeDeciding = (
  deciding: AxialGap,
  sideways: Gap | null,
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
 * The wall's corners: **both ends of every run**, so a step draws as a step.
 *
 * A rise smaller than `noise` is float noise and makes no corner. Everything
 * else is kept, including the far end of the run the rise interrupts — and
 * that far end is the correction of 2026-08-30. Keeping only the point where
 * a new height begins left consecutive corners that spanned a whole run *and*
 * the rise after it, so the line drew a diagonal ramp across both: a square
 * step read as a chamfer, and the material over the run looked taller than
 * the sweep says it is. Paul's section view is the reference — a wall is
 * vertical, a ledge is horizontal, and only a fillet is round.
 *
 * A sampled fillet still keeps every corner, which is what lets `wallPath`
 * draw it as the arc it is (Paul, 2026-08-30: thinning to chords had turned a
 * fillet into a chamfer).
 */
export const wallCorners = (
  profile: ReadonlyArray<OutlinePoint>,
  noise: number,
): Array<OutlinePoint> => {
  const corners: Array<OutlinePoint> = []
  // How far the run at the current height has reached: a corner in waiting,
  // needed only when the height changes or the profile ends.
  let run: OutlinePoint | null = null
  for (const point of profile) {
    const last = corners[corners.length - 1]
    if (!last) {
      corners.push({ r: point.r, z: point.z })
      continue
    }
    // A corner is a change of height; a change under the noise is no corner.
    if (Math.abs(point.z - last.z) < noise) {
      run = point
      continue
    }
    if (run && run.r !== last.r) {
      corners.push({ r: run.r, z: last.z })
    }
    corners.push({ r: point.r, z: point.z })
    run = null
  }
  const kept = corners[corners.length - 1]
  if (run && kept && run.r !== kept.r) {
    corners.push({ r: run.r, z: kept.z })
  }
  return corners
}

/**
 * Where the wall stops changing: the radius of the outermost rise. Beyond it
 * the material is flat and drawing more of it says nothing.
 */
export const lastRise = (corners: ReadonlyArray<OutlinePoint>): number => {
  for (let index = corners.length - 1; index > 0; index -= 1) {
    if (corners[index]!.z !== corners[index - 1]!.z) {
      return corners[index]!.r
    }
  }
  return corners[0]?.r ?? 0
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
  tip: 'tip angle',
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
  /**
   * Draw the dimensions: every stated length and width, on the tool.
   *
   * Off by default, because the drawing is also used small — on a card beside
   * a list, where a dimension line is noise. The panel that has room turns it
   * on (Paul, 2026-09-01).
   */
  readonly dimensions?: boolean
  /**
   * Which sides the dimension lanes may use.
   *
   * `both` where the drawing has the panel to itself, which evens them out
   * and keeps the tool in the middle (Paul, 2026-09-01). Left only where the
   * part is drawn beside it.
   */
  readonly dimensionSides?: 'left' | 'both'
}

export const AssemblyDrawing = ({
  tool,
  assembly = null,
  unit,
  curve = null,
  margins = NO_MARGINS,
  dimensions = false,
  dimensionSides = 'left',
}: AssemblyDrawingProps) => {
  const hatch = `hatch-${useId().replace(/:/g, '')}`
  /**
   * The shape of the panel, measured.
   *
   * The stack settles the height, so on a panel taller than the stack is wide
   * the drawing is height-bound and the viewBox letterboxes — leaving real
   * room to the right of the tool empty while the part was broken off short
   * of it (Paul, 2026-08-30: "you can use the full area to the right of the
   * tool"). Knowing the panel's shape is what lets that room be spent. Null
   * until it is measured, and on a server, where the frame is the stack's own.
   */
  const frame = useRef<SVGSVGElement>(null)
  const [panel, setPanel] = useState<{ width: number; height: number } | null>(null)
  useEffect(() => {
    const element = frame.current
    if (!element || typeof ResizeObserver === 'undefined') {
      return
    }
    const watch = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect
      if (box && box.width > 0 && box.height > 0) {
        setPanel({ width: box.width, height: box.height })
      }
    })
    watch.observe(element)
    return () => watch.disconnect()
  }, [])
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
  // it is fitted to the stack, so the assembly fills whatever it is given.
  // Height is settled first: the wall's extent is worked out in the same
  // millimetres, and only then does the right edge follow from it.
  const top = outline.height + 3
  const bottom = -3
  const height = top - bottom
  const fontSize = Math.max(1.5, height * 0.018)

  // The wall the sweep read, to the right of the stack: the part's own wall
  // at the cut, the staircase, and the room wanted outside it.
  const cuttingRadius = (tool.geometry.DC ?? 0) / 2
  const profile =
    curve && tool.geometry.DC !== undefined ? materialProfile(curve, cuttingRadius) : null
  const corners = profile ? wallCorners(profile, height * 0.0005) : null
  // The two clearances, each at its own tightest point: up from the wall to
  // the part above it, and sideways from a part to the wall face beside it.
  // Measured by the package, so the number here is the number the list shows.
  const gaps = curve && assembly ? tightestGaps(assembly, curve, margins) : null
  const deciding = gaps?.axial ?? null
  const sideways = gaps?.radial ?? null

  /**
   * How far out the part would like to be drawn, in mm from the axis.
   *
   * Out to the last rise — past it the staircase is a flat block that says
   * nothing new — and far enough to show the face a dimension measures to.
   * What it actually gets is whatever room is left beside the stack.
   */
  const partWanted =
    corners === null || corners.length === 0
      ? 0
      : Math.max(lastRise(corners), sideways ? sideways.r + sideways.gap : 0, cuttingRadius) + 2

  /**
   * The frame: the stack's own width, and then whatever the panel has spare.
   *
   * **The part never takes room from the stack.** The stack settles the
   * height and needs its half-width either side, and that much the part
   * cannot touch. But a panel taller than that is wide leaves room over —
   * room the viewBox used to letterbox away while the part was broken off
   * short of it. That surplus goes to the part first, out to what it has to
   * show; what the part has no use for is split between the sides, so a stack
   * with nothing beside it still sits in the middle (Paul, 2026-08-30).
   */
  const stack = outline.radius + 3
  /**
   * The dimensions, and the strip on the left they are drawn in.
   *
   * They go on the left because the part goes on the right, and a dimension
   * line over a hatched section is unreadable. Each length runs in its own
   * lane, nested shortest-innermost — `shared/tool-dimensions.ts` decides
   * which, so the drawing only has to place them.
   */
  const drawn = dimensions ? dimensionsFor(tool, { assembly }) : null
  /**
   * Which figure stands in which band, and how wide each band has to be.
   *
   * **A band per lane rather than one column in the margin** (Paul,
   * 2026-09-01): the widths stand just past their own arrows, and each
   * length's figure stands outboard of its own lane. A band is only as wide as
   * the widest figure in it, because the room it takes comes out of the tool.
   */
  const layout = drawn === null ? null : dimensionLayout(drawn, unit, fontSize, dimensionSides)
  const bands = { arrow: fontSize * 0.9 * 2.4, gap: fontSize * 0.5 }
  const bandsOn = (side: 'left' | 'right') => layout?.bands[side] ?? []
  /**
   * What each side needs — and, on the left, the column the sweep's clearances
   * already read in, which the lanes must sit inboard of rather than under.
   */
  const marginOn = (side: 'left' | 'right') =>
    bandsOn(side).length === 0
      ? 0
      : // A gap of slack past the last band: fitted exactly, the outermost
        // figure sat on the edge of the sheet and lost its first character.
        bandRoom(bandsOn(side), bands) +
        bands.gap +
        (side === 'left' && curve !== null ? fontSize * 10 : 0)
  const roomLeft = marginOn('left')
  const roomRight = dimensionSides === 'both' ? marginOn('right') : 0
  // Unmeasured — a server, or the first paint — the frame is the stack's own
  // and the part makes do with what is beside it. It never widens the frame.
  const spare = panel
    ? Math.max(0, (height * panel.width) / panel.height - stack * 2 - roomLeft - roomRight)
    : 0
  const forPart = Math.max(0, Math.min(spare, partWanted + 2 - stack))
  // What the part has no use for is split, so a stack with nothing beside it
  // stays in the middle of the panel.
  const rest = (spare - forPart) / 2
  const left = -stack - roomLeft - rest
  const right = stack + forPart + rest + roomRight
  const width = right - left
  const x = (r: number) => r - left
  const y = (z: number) => top - z

  // The part runs to the edge of the room it was given and breaks there, a
  // hair inside it so the break reads as a break and not as a clipped edge.
  const wallEdge = Math.max(Math.min(partWanted, right - 2), cuttingRadius + 1)
  const wall = corners ? clipped(corners, wallEdge, top) : null
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
          wallEdge,
          top,
        )
      : null
  const wallAtCut = curve?.verticalOffset[0] ?? 0
  // The outer edge of the part is always a break: past the last knot the
  // material carries on at that height, and the drawing does not.
  const outerBreak = wall
    ? zigzag(x(wallEdge), y(wall[wall.length - 1]?.z ?? 0), y(0), fontSize * 0.3)
    : []
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
        ref={frame}
        role="img"
        aria-label={`${assembly ? assemblyLabel(assembly) : tool.catalogNumber}, drawn from its stated dimensions`}
        viewBox={`0 0 ${width} ${height}`}
        className="min-h-0 flex-1 rounded"
        /*
          **The sheet.** The drawing is its own thing on the page — a light
          ground, dark linework — rather than a silhouette floating on whatever
          panel holds it (Paul, 2026-09-01). On the element rather than as a
          rectangle inside it, so the ground fills what the drawing is given
          and not only the part the viewBox letterboxes into.
        */
        style={{ background: SHEET.ground }}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* The wall the sweep read, on the right of the stack only. */}
        {wall ? (
          <g data-wall>
            <defs>
              {/* Section hatching: the part is material in section, and nothing on the stack is. */}
              <pattern
                id={hatch}
                width={fontSize * 0.85}
                height={fontSize * 0.85}
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width={fontSize * 0.85} height={fontSize * 0.85} className="fill-zinc-900" />
                <line
                  x1={0}
                  y1={0}
                  x2={0}
                  y2={fontSize * 0.85}
                  className="stroke-zinc-600"
                  strokeWidth={0.22}
                />
              </pattern>
            </defs>
            <path
              data-part="material"
              d={`${wallPath(wall, smooth, x, y)} ${outerBreak.map((point) => `L${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')} L${x(cuttingRadius).toFixed(2)},${y(0).toFixed(2)} Z`}
              fill={`url(#${hatch})`}
              className="stroke-none"
            />
            {/* The surface the sweep read, solid: it is geometry. */}
            <path
              data-surface="material"
              d={wallPath(wall, smooth, x, y)}
              className="fill-none stroke-zinc-300"
              strokeWidth={0.35}
              strokeLinejoin="round"
            />
            <line
              x1={x(cuttingRadius)}
              y1={y(0)}
              x2={x(wallEdge)}
              y2={y(0)}
              className="stroke-zinc-500"
              strokeWidth={0.3}
            />
            {/* The break: the part carries on past here, the drawing does not. */}
            <polyline
              data-break="material"
              points={points(outerBreak)}
              className="fill-none stroke-zinc-500"
              strokeWidth={0.3}
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

        {/*
          Each segment mirrored about the axis: a body of revolution in
          elevation. The **fills** are per section, because a section that
          fouls the part is painted red on its own; the **outline** is one
          stroke around the whole silhouette, so a join between two sections of
          the same radius is not drawn as an edge.
        */}
        {outline.segments.map((segment, index) => {
          const rightSide = segment.points.map((each) => `${x(each.r)},${y(each.z)}`)
          const leftSide = [...segment.points].reverse().map((each) => `${x(-each.r)},${y(each.z)}`)
          return (
            <polygon
              key={`${segment.part}-${String(index)}`}
              data-part={segment.part}
              data-provenance={segment.provenance}
              points={[...rightSide, ...leftSide].join(' ')}
              {...(hit.has(segment.part)
                ? {}
                : {
                    fill:
                      segment.part === 'flutes' || segment.part === 'tip'
                        ? SHEET.flutes
                        : segment.part === 'shank' || segment.part === 'neck'
                          ? SHEET.body
                          : isConnection(segment)
                            ? SHEET.connection
                            : SHEET.holder,
                    stroke: 'none',
                  })}
              className={classNames(hit.has(segment.part) ? 'fill-danger/70' : '')}
            />
          )
        })}

        {/*
          **Where two sections meet at the same radius, the line is a light
          dashed one** (Paul, 2026-09-01: "don't show a solid line across the
          radius — use a dashed lighter line. For bull and ball nose end mills,
          and at the tip for drills"). A bull nose's corner radius runs into the
          flutes at exactly the flute diameter, and a drill's point into its
          body: there is no edge there, and a solid chord across the tool read
          as one. Where the radius does step — a neck under a shank — the line
          stays what it is: an edge.
        */}
        {outline.segments.slice(0, -1).map((segment, index) => {
          const next = outline.segments[index + 1]
          if (next === undefined) {
            return null
          }
          const below = Math.max(...segment.points.map((each) => each.r))
          const above = Math.max(...next.points.map((each) => each.r))
          const top = Math.max(...segment.points.map((each) => each.z))
          const radius = Math.min(below, above)
          const stepped = Math.abs(below - above) > 0.01
          return (
            <line
              key={`join-${segment.part}-${String(index)}`}
              data-join={segment.part}
              x1={x(-radius)}
              y1={y(top)}
              x2={x(radius)}
              y2={y(top)}
              stroke={SHEET.ink}
              strokeOpacity={stepped ? 1 : 0.35}
              strokeWidth={fontSize * (stepped ? 0.09 : 0.06)}
              {...(stepped
                ? {}
                : {
                    strokeDasharray: `${(fontSize * 0.5).toFixed(2)} ${(fontSize * 0.4).toFixed(2)}`,
                  })}
            />
          )
        })}

        {/* The silhouette, in one stroke: up the right side and down the left. */}
        <path
          data-silhouette
          d={`M${outline.segments
            .flatMap((segment) => segment.points)
            .map((each) => `${x(each.r).toFixed(2)},${y(each.z).toFixed(2)}`)
            .join(' L')} L${[...outline.segments]
            .reverse()
            .flatMap((segment) => [...segment.points].reverse())
            .map((each) => `${x(-each.r).toFixed(2)},${y(each.z).toFixed(2)}`)
            .join(' L')} Z`}
          fill="none"
          stroke={SHEET.ink}
          strokeWidth={fontSize * 0.09}
          strokeLinejoin="round"
        />

        {/*
          The two clearances, each dimensioned at its own tightest point, and
          each number in a column to the left of the stack at the height of
          its own dimension. Paul (2026-08-30): stacked together in a place of
          their own they were confusing, and beside their arrows they were in
          among the part — so they read across, at their own height, from the
          empty half of the panel.
        */}
        {deciding && curve
          ? (() => {
              const head = fontSize * 0.9
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
              // Sideways: a horizontal dimension at its own point's height, from the part's edge to the wall face.
              const sideTone = sideways?.clears ? 'stroke-emerald-300' : 'stroke-danger'
              const sideFill = sideways?.clears ? 'fill-emerald-300' : 'fill-danger'
              const sideY = sideways ? y(sideways.z) - fontSize * 0.9 : 0
              const edgeX = sideways ? x(sideways.r) : 0
              // A face past the break is not on the drawing: the dimension is
              // broken at the break and keeps the number the check used.
              const faceR = sideways ? sideways.r + sideways.gap : 0
              const cutOff = sideways !== null && faceR > wallEdge + GAP_TOLERANCE
              const faceX = sideways ? x(Math.min(faceR, wallEdge)) : 0
              const sideInside = sideways ? faceX - edgeX >= head * 2.6 : false
              // Both numbers to the left of the stack, each at the height of
              // the dimension it belongs to (Paul, 2026-08-30): the part is on
              // the right, so the left is the half with room, and reading
              // across from a number lands on its own arrows.
              const label = (text: string) => (text.length + 1) * fontSize * 0.6
              const column = 1
              const upText = `${deciding.gap < 0 ? '−' : ''}${formatLength(Math.abs(deciding.gap), unit)}`
              const upLabelY = (upperY + lowerY) / 2
              const sideText = sideways ? formatLength(sideways.gap, unit) : ''
              // One column, so only their heights can collide: the radial one
              // moves, away from the axial one it would have sat on.
              const sideLabelY =
                Math.abs(sideY - upLabelY) >= fontSize * 1.7
                  ? sideY
                  : upLabelY + fontSize * 1.7 * (sideY <= upLabelY ? -1 : 1)
              const Readout = ({
                at,
                baseline,
                value,
                word,
                tone,
                dim,
              }: {
                at: number
                baseline: number
                value: string
                word: string
                tone: string
                dim: string
              }) => (
                <>
                  <rect
                    x={at}
                    y={baseline - fontSize * 0.95}
                    width={label(`${value} ${word}`)}
                    height={fontSize * 1.45}
                    rx={0.4}
                    className="fill-zinc-950/85"
                  />
                  <text
                    x={at + fontSize * 0.3}
                    y={baseline + fontSize * 0.18}
                    fontSize={fontSize}
                    className="font-mono"
                    data-dim={dim}
                  >
                    <tspan className={tone}>{value}</tspan>
                    <tspan className="fill-zinc-500"> {word}</tspan>
                  </text>
                </>
              )
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
                  <Readout
                    at={column}
                    baseline={upLabelY}
                    value={upText}
                    word="axial"
                    tone={upFill}
                    dim="axial"
                  />
                  {sideways ? (
                    <>
                      <line
                        x1={edgeX}
                        y1={y(sideways.z)}
                        x2={edgeX}
                        y2={sideY - fontSize * 0.8}
                        className="stroke-zinc-400"
                        strokeWidth={0.25}
                      />
                      {cutOff ? null : (
                        <line
                          x1={faceX}
                          y1={y(sideways.z)}
                          x2={faceX}
                          y2={sideY - fontSize * 0.8}
                          className="stroke-zinc-400"
                          strokeWidth={0.25}
                        />
                      )}
                      <line
                        x1={sideInside ? edgeX : edgeX - head * 2.2}
                        y1={sideY}
                        x2={sideInside || cutOff ? faceX : faceX + head * 2.2}
                        y2={sideY}
                        className={sideTone}
                        strokeWidth={0.4}
                      />
                      <polygon
                        points={arrow(edgeX, sideY, sideInside ? 'left' : 'right', head)}
                        className={sideFill}
                      />
                      <Readout
                        at={column}
                        baseline={sideLabelY}
                        value={sideText}
                        word="radial"
                        tone={sideFill}
                        dim="radial"
                      />
                      {cutOff ? (
                        <polyline
                          data-break="dimension"
                          points={points(
                            zigzag(sideY, faceX - head * 1.2, faceX, head * 0.5).map((each) => ({
                              x: each.y,
                              y: each.x,
                            })),
                          )}
                          className="fill-none stroke-zinc-300"
                          strokeWidth={0.3}
                        />
                      ) : (
                        <polygon
                          points={arrow(faceX, sideY, sideInside ? 'right' : 'left', head)}
                          className={sideFill}
                        />
                      )}
                    </>
                  ) : null}
                </g>
              )
            })()
          : null}

        {/*
          **No section names** (Paul, 2026-09-01). "shank" and "flutes" beside
          a drawing that is plainly a shank and flutes is a legend for
          something nobody was going to misread, and the words sat where the
          dimensions want to be.
        */}

        {/*
          The dimensions, in the strip on the left of the stack — the part is
          on the right, and a dimension line over a hatched section cannot be
          read. `DimensionLines` draws them; this passes the frame.
        */}
        {drawn === null ? null : (
          <DimensionLines
            model={drawn}
            unit={unit}
            frame={{
              x,
              y,
              fontSize,
              laneAt: (lane, side) =>
                x((side === 'left' ? -1 : 1) * (stack + laneOffset(bandsOn(side), lane, bands))),
              edge: (side) => x((side === 'left' ? -1 : 1) * outline.radius),
              // The figures stand past every lane, in the margin the frame
              // reserved for them.
              labelAt: (band, side) =>
                x((side === 'left' ? -1 : 1) * (stack + bandOffset(bandsOn(side), band, bands))),
              sides: dimensionSides,
              ink: SHEET.dimension,
              ground: SHEET.ground,
            }}
          />
        )}

        {/*
          The centreline, as a drawing draws one: long, short, long — thin, and
          in the ink rather than in the tool's own grey (Paul, 2026-09-01).
        */}
        <line
          data-centreline
          x1={x(0)}
          y1={y(-4)}
          x2={x(0)}
          y2={y(outline.height + 4)}
          stroke={SHEET.centre}
          strokeWidth={fontSize * 0.05}
          strokeDasharray={`${(fontSize * 1.6).toFixed(2)} ${(fontSize * 0.5).toFixed(2)} ${(fontSize * 0.3).toFixed(2)} ${(fontSize * 0.5).toFixed(2)}`}
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
