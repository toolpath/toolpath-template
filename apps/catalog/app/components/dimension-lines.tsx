import { formatLength, type Unit } from '@toolpath/domain/units'
import { dimensionLabel, type ToolDimensions } from 'shared/tool-dimensions'

/**
 * Dimensions, drawn the way a drawing draws them.
 *
 * An extension line off the face being measured, a dimension line between the
 * two with an arrowhead at each end, and the figure standing on it. Lengths
 * run in lanes, nested shortest-innermost so no two lines cross — which lane
 * each takes is `shared/tool-dimensions.ts`'s to decide; this only places
 * them.
 *
 * **Shared because there are two drawings of the same tool** — the cutter on
 * the panel beside the part, and the assembly on the tool's own page. They
 * have different silhouettes and different coordinate systems, and that is
 * all the difference between them: the dimensions are the same dimensions,
 * and a second copy of this would be a second set of arrowheads to keep in
 * step. The frame is what each one passes in.
 */

/** How a drawing maps millimetres onto its own SVG space. */
export interface DimensionFrame {
  /** A radius from the axis, in millimetres, to an x. */
  readonly x: (r: number) => number
  /** A height above the tip, in millimetres, to a y. */
  readonly y: (z: number) => number
  /** The type size the drawing is using, in its own units. */
  readonly fontSize: number
  /** Where the lane numbered `lane` runs, as an x. */
  readonly laneAt: (lane: number) => number
  /** The x an extension line runs back to: the left edge of what is drawn. */
  readonly edge: number
}

/** An arrowhead as a polygon: at (x, y), pointing `dir`. */
export const arrowhead = (
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

export interface DimensionLinesProps {
  readonly model: ToolDimensions
  readonly frame: DimensionFrame
  readonly unit: Unit
}

export const DimensionLines = ({ model, frame, unit }: DimensionLinesProps) => {
  const { x, y, fontSize, laneAt, edge } = frame
  const head = fontSize * 0.9

  return (
    <g data-dimensions>
      {model.lengths.map((each) => {
        const at = laneAt(each.lane)
        const fromY = y(each.from)
        const toY = y(each.to)
        /**
         * Closer together than the arrows are long, they meet nose to nose —
         * so they go outside the line and point back in, which is what a
         * drawing does with a dimension too short to hold them.
         */
        const inside = Math.abs(fromY - toY) >= head * 2.6
        const midY = (fromY + toY) / 2
        const textX = at - fontSize * 0.55
        return (
          <g key={each.code} data-dimension={each.code}>
            <line
              x1={at - fontSize * 0.5}
              y1={fromY}
              x2={edge}
              y2={fromY}
              className="stroke-zinc-600"
              strokeWidth={fontSize * 0.06}
            />
            <line
              x1={at - fontSize * 0.5}
              y1={toY}
              x2={edge}
              y2={toY}
              className="stroke-zinc-600"
              strokeWidth={fontSize * 0.06}
            />
            <line
              x1={at}
              y1={inside ? fromY : fromY + head * 2.2}
              x2={at}
              y2={inside ? toY : toY - head * 2.2}
              className="stroke-zinc-400"
              strokeWidth={fontSize * 0.09}
            />
            <polygon
              points={arrowhead(at, fromY, inside ? 'down' : 'up', head)}
              className="fill-zinc-400"
            />
            <polygon
              points={arrowhead(at, toY, inside ? 'up' : 'down', head)}
              className="fill-zinc-400"
            />
            <text
              x={textX}
              y={midY}
              fontSize={fontSize}
              textAnchor="middle"
              transform={`rotate(-90 ${textX.toFixed(2)} ${midY.toFixed(2)})`}
              className="fill-zinc-300 font-mono"
            >
              {`${dimensionLabel(each.code)} ${formatLength(each.to - each.from, unit)}`}
            </text>
          </g>
        )
      })}

      {model.widths.map((each) => {
        const atY = y(each.at)
        const leftX = x(-each.radius)
        const rightX = x(each.radius)
        const inside = rightX - leftX >= head * 2.6
        const text = `${dimensionLabel(each.code)} ⌀${formatLength(each.radius * 2, unit)}`
        // The cut is dimensioned below the tip, where there is nothing to read
        // it through. Every other width stands on its own line, over a chip of
        // ground so it is never read through the tool.
        const labelY = each.at === 0 ? y(0) + fontSize * 1.6 : atY + fontSize * 0.35
        const box = (text.length + 1) * fontSize * 0.56
        return (
          <g key={each.code} data-dimension={each.code}>
            <line
              x1={inside ? leftX : leftX - head * 2.2}
              y1={atY}
              x2={inside ? rightX : rightX + head * 2.2}
              y2={atY}
              className="stroke-zinc-400"
              strokeWidth={fontSize * 0.09}
            />
            <polygon
              points={arrowhead(leftX, atY, inside ? 'left' : 'right', head)}
              className="fill-zinc-400"
            />
            <polygon
              points={arrowhead(rightX, atY, inside ? 'right' : 'left', head)}
              className="fill-zinc-400"
            />
            <rect
              x={x(0) - box / 2}
              y={labelY - fontSize * 0.95}
              width={box}
              height={fontSize * 1.35}
              rx={fontSize * 0.12}
              className="fill-zinc-950/85"
            />
            <text
              x={x(0)}
              y={labelY}
              fontSize={fontSize}
              textAnchor="middle"
              className="fill-zinc-300 font-mono"
            >
              {text}
            </text>
          </g>
        )
      })}

      {/* The corner radius, on a leader off the corner it is about. */}
      {model.cornerRadius === null || model.widths.length === 0 ? null : (
        <g data-dimension="RE">
          <line
            x1={laneAt(0) - fontSize * 0.4}
            y1={y(0) - fontSize * 2}
            x2={x(-(model.widths[0]?.radius ?? 0))}
            y2={y(0)}
            className="stroke-zinc-600"
            strokeWidth={fontSize * 0.06}
          />
          <text
            x={laneAt(0) - fontSize * 0.6}
            y={y(0) - fontSize * 2.1}
            fontSize={fontSize}
            textAnchor="end"
            className="fill-zinc-300 font-mono"
          >
            {`RE ${formatLength(model.cornerRadius, unit)}`}
          </text>
        </g>
      )}
    </g>
  )
}
