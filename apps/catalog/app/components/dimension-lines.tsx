import type { Unit } from '@toolpath/domain/units'
import {
  dimensionLayout,
  figureType,
  stackLabels,
  type DimensionFigure,
  type ToolDimensions,
} from 'shared/tool-dimensions'

/**
 * Dimensions, drawn the way a drawing draws them.
 *
 * **Every figure lives in a margin, never inside the drawing** (Paul,
 * 2026-09-01, after three goes at placing them among the lines). Anywhere
 * inside there is something to land on — the tool, a leader, a lane line,
 * another figure — and a rule of the form "beside its own line, unless"
 * produced exactly the smudge it was written to avoid.
 *
 * **But beside its own line.** The margin is a series of bands rather than one
 * column: the widths stand in the first, just past their arrows, and each
 * length's figure stands in the band outboard of its own lane, so the number
 * for the flute length is at the flute length rather than out beside the
 * overall length (Paul, 2026-09-01). `shared/tool-dimensions` works out the
 * bands; this draws them, and keeps a figure off the extension lines that
 * cross its band by stacking it clear of them.
 *
 * **A width is dimensioned from outside.** A line drawn across a ⌀6 shank at
 * this scale is a line drawn *over the tool*, so the two arrows stand outside
 * the silhouette and point inward at the faces they measure, which is what a
 * drawing does with a dimension too narrow to hold them.
 *
 * **Shared because there are two drawings of the same tool** — the one in the
 * panel and the assembly on the tool's own page. They have different
 * silhouettes and different coordinate systems, and that is all the difference
 * between them: the dimensions are the same dimensions. The frame is what each
 * one passes in.
 */

/** How a drawing maps millimetres onto its own SVG space. */
export interface DimensionFrame {
  /** A radius from the axis, in millimetres, to an x. */
  readonly x: (r: number) => number
  /** A height above the tip, in millimetres, to a y. */
  readonly y: (z: number) => number
  /** The type size the drawing is using, in its own units. */
  readonly fontSize: number
  /** Where the lane numbered `lane` on that side runs, as an x. */
  readonly laneAt: (lane: number, side: 'left' | 'right') => number
  /** The x a figure in that band reads outward from. */
  readonly labelAt: (band: number, side: 'left' | 'right') => number
  /** The x an extension line runs back to on each side: the edge of what is drawn. */
  readonly edge: (side: 'left' | 'right') => number
  /**
   * Which sides the dimensions may use.
   *
   * **Both, wherever both are free** (Paul, 2026-09-01): four lengths stacked
   * down one side push the tool into the other half of the panel and read as a
   * ladder. Where the drawing has the part beside it — the assembly on the
   * part page — the right belongs to the part and the lanes stay left.
   */
  readonly sides?: 'left' | 'both'
  /** The ink a dimension is drawn in, and the ground its figure sits on. */
  readonly ink?: string
  readonly ground?: string
}

/** An arrowhead as a polygon: at (x, y), pointing `dir`. */
export const arrowhead = (
  x: number,
  y: number,
  dir: 'up' | 'down' | 'left' | 'right',
  size: number,
): string => {
  // Slim: a drawing's arrowhead is a barb, not a triangle.
  const w = size * 0.3
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

export interface DimensionLinesProps {
  readonly model: ToolDimensions
  readonly frame: DimensionFrame
  readonly unit: Unit
}

export const DimensionLines = ({ model, frame, unit }: DimensionLinesProps) => {
  const { x, y, fontSize, laneAt, edge, labelAt } = frame
  const ink = frame.ink ?? '#606a76'
  const ground = frame.ground ?? '#ffffff'
  const head = fontSize * 0.9
  const type = figureType(fontSize)
  const lineHeight = type * 1.15
  const padding = type * 0.45

  const layout = dimensionLayout(model, unit, fontSize, frame.sides ?? 'left')
  const placeOf = new Map(layout.figures.map((each) => [each.code, each]))

  /** Where a figure would like to stand, before anything is moved out of the way. */
  const wants = (figure: DimensionFigure): { x: number; y: number } => {
    if (figure.lane === null) {
      const angle = model.angles.find((each) => each.code === figure.code)
      if (angle) {
        // A leader onto the flank itself: the angle is between two faces, and
        // there is no room to draw it between them on a ⌀1 drill.
        return {
          x: x(angle.at.r * (figure.side === 'left' ? -1 : 1)),
          y: y(angle.at.z),
        }
      }
      const width = model.widths.find((each) => each.code === figure.code)
      const radius = width?.radius ?? 0
      return { x: x(radius * (figure.side === 'left' ? -1 : 1)), y: y(width?.at ?? 0) }
    }
    const length = model.lengths.find((each) => each.code === figure.code)
    return {
      x: laneAt(figure.lane, figure.side),
      /**
       * **At the top of its dimension, not the middle of it** (Paul,
       * 2026-09-01). A figure halfway down a 50 mm dimension is level with
       * nothing on the tool; at the top it is level with the arrow it belongs
       * to.
       */
      y: Math.min(y(length?.from ?? 0), y(length?.to ?? 0)),
    }
  }

  const boxOf = (figure: DimensionFigure) => {
    const at = labelAt(figure.band, figure.side)
    return {
      x: figure.side === 'left' ? at - figure.width : at,
      width: figure.width,
      height: padding * 2 + lineHeight * figure.lines.length,
    }
  }

  /**
   * The lines a figure must not sit on: every extension line, which runs from
   * the tool out to its own lane and so crosses the bands inboard of it.
   *
   * They are given to the stacker as boxes that cannot move, so a figure with
   * nowhere to sit rises until it is clear rather than landing on one.
   */
  const obstacles = model.lengths.flatMap((each) => {
    const place = placeOf.get(each.code)
    if (place === undefined || place.lane === null) {
      return []
    }
    const at = laneAt(place.lane, place.side)
    const from = edge(place.side)
    const thickness = type * 0.7
    return [y(each.from), y(each.to)].map((height, index) => ({
      key: `line-${each.code}-${String(index)}`,
      x: Math.min(at, from),
      width: Math.abs(at - from),
      y: height + thickness / 2,
      height: thickness,
    }))
  })

  /** Where each figure ends up, once none covers another or a line. */
  const placed = stackLabels(
    layout.figures.map((figure) => {
      const box = boxOf(figure)
      // `stackLabels` measures a box from its bottom edge upward.
      return {
        key: figure.code,
        x: box.x,
        width: box.width,
        y: wants(figure).y + box.height,
        height: box.height,
      }
    }),
    type * 0.5,
    obstacles,
  )

  return (
    <g data-dimensions>
      {model.lengths.map((each) => {
        const place = placeOf.get(each.code)
        if (place === undefined || place.lane === null) {
          return null
        }
        const side = place.side
        const at = laneAt(place.lane, side)
        const fromY = y(each.from)
        const toY = y(each.to)
        /**
         * Closer together than the arrows are long, they meet nose to nose —
         * so they go outside the line and point back in, which is what a
         * drawing does with a dimension too short to hold them.
         */
        const inside = Math.abs(fromY - toY) >= head * 2.6
        return (
          <g key={each.code} data-dimension={each.code}>
            <line
              x1={at}
              y1={fromY}
              x2={edge(side)}
              y2={fromY}
              stroke={ink}
              strokeOpacity={0.4}
              strokeWidth={fontSize * 0.05}
            />
            <line
              x1={at}
              y1={toY}
              x2={edge(side)}
              y2={toY}
              stroke={ink}
              strokeOpacity={0.4}
              strokeWidth={fontSize * 0.05}
            />
            <line
              x1={at}
              y1={inside ? fromY : fromY + head * 2.2}
              x2={at}
              y2={inside ? toY : toY - head * 2.2}
              stroke={ink}
              strokeWidth={fontSize * 0.07}
            />
            <polygon points={arrowhead(at, fromY, inside ? 'down' : 'up', head)} fill={ink} />
            <polygon points={arrowhead(at, toY, inside ? 'up' : 'down', head)} fill={ink} />
          </g>
        )
      })}

      {/*
        A width, dimensioned from outside: two barbs standing off the faces
        they measure, pointing in. Nothing is drawn across the tool.
      */}
      {model.widths.map((each) => {
        const atY = y(each.at)
        const leftX = x(-each.radius)
        const rightX = x(each.radius)
        return (
          <g key={each.code} data-dimension={each.code}>
            <line
              x1={leftX - head * 2.4}
              y1={atY}
              x2={leftX}
              y2={atY}
              stroke={ink}
              strokeWidth={fontSize * 0.07}
            />
            <polygon points={arrowhead(leftX, atY, 'right', head)} fill={ink} />
            <line
              x1={rightX}
              y1={atY}
              x2={rightX + head * 2.4}
              y2={atY}
              stroke={ink}
              strokeWidth={fontSize * 0.07}
            />
            <polygon points={arrowhead(rightX, atY, 'left', head)} fill={ink} />
          </g>
        )
      })}

      {/*
        The figures, each in its own band with a leader back to the line it
        belongs to. Drawn last, so nothing is drawn over them.
      */}
      {layout.figures.map((figure) => {
        const box = boxOf(figure)
        const from = wants(figure)
        const bottom = placed.get(figure.code) ?? from.y + box.height
        const top = bottom - box.height
        const anchor = labelAt(figure.band, figure.side)
        // The leader turns inboard of the band, where no figure stands.
        const turn = anchor + (figure.side === 'left' ? type * 0.5 : -type * 0.5)
        const middle = top + box.height / 2
        return (
          <g key={`figure-${figure.code}`} data-figure={figure.code}>
            <polyline
              points={`${from.x.toFixed(2)},${from.y.toFixed(2)} ${turn.toFixed(2)},${from.y.toFixed(
                2,
              )} ${turn.toFixed(2)},${middle.toFixed(2)}`}
              fill="none"
              stroke={ink}
              strokeOpacity={0.35}
              strokeWidth={fontSize * 0.05}
            />
            <rect
              x={box.x}
              y={top}
              width={box.width}
              height={box.height}
              fill={ground}
              rx={type * 0.2}
            />
            {figure.lines.map((line, index) => (
              <text
                key={line}
                x={anchor}
                y={top + padding + type * 0.85 + lineHeight * index}
                fontSize={type}
                textAnchor={figure.side === 'left' ? 'end' : 'start'}
                fill={ink}
                className="font-mono"
              >
                {line}
              </text>
            ))}
          </g>
        )
      })}
    </g>
  )
}
