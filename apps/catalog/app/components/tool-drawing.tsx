import type { Assembly, CatalogTool, Holder } from '@toolpath/catalog-data'
import type { Unit } from '@toolpath/domain/units'
import { stackProfile, toolProfile } from 'shared/tool-profile'
import { dimensionsFor } from 'shared/tool-dimensions'
import { DimensionLines } from './dimension-lines'

/**
 * The cutter, drawn on its own.
 *
 * **The tool and nothing else** (Paul, 2026-08-31). The stack against the part
 * is the drawing on the part panel; this is the thing being read — its
 * silhouette, tip down, with the diameters and lengths that decide it called
 * out on the shape rather than listed away from it.
 *
 * The profile is `shared/tool-profile`, the same one the STEP file revolves,
 * so what is drawn and what is exported cannot disagree — which is the answer
 * to "could we draw the holder from the STEP we generate?" (Paul,
 * 2026-08-31): the STEP is drawn from the profile, and so is this. Parsing the
 * file back would be the same numbers by a longer road.
 *
 * **With a holder chosen it is the stack**, cut off at the stickout — a
 * cross-section of what actually goes in the spindle, drawn a shade darker
 * above the cutter so the two read apart. The panel says which of the two it
 * wants; this draws what it is given (Paul, 2026-09-01).
 *
 * **Dimensioned the way a drawing is dimensioned** — extension lines,
 * arrowheads, the figure standing on the line, lengths nested so none of them
 * cross. Which dimensions apply is `shared/tool-dimensions.ts`; drawing them
 * is `DimensionLines`, shared with the assembly drawing on the tool's own
 * page so the two cannot drift apart.
 */
export const ToolDrawing = ({
  tool,
  unit,
  holder,
  stickout = null,
}: {
  tool: CatalogTool
  unit: Unit
  /** What holds it, where one has been chosen. */
  holder?: Holder | undefined
  /** How far it stands out, mm; absent is the shortest it can be set at. */
  stickout?: number | null
}) => {
  const cutter = toolProfile(tool)
  const profile = holder === undefined ? cutter : stackProfile(tool, holder, stickout)
  if (profile === null) {
    return null
  }
  const widest = Math.max(...profile.steps.map((step) => step.radius))
  const flutes = tool.geometry.LCF ?? 0
  /** Where the tool ends and the holder begins, for the shading above it. */
  const meets = holder === undefined ? null : (stickout ?? tool.geometry.LBH ?? cutter?.top ?? 0)

  /**
   * The dimensions, and the room they need at the sides.
   *
   * Worked out before the frame, because the frame is sized to hold them: a
   * margin that ignored the lanes clipped the outermost line on every tool
   * narrower than its own dimension strip.
   */
  const model = dimensionsFor(
    tool,
    holder === undefined || holder.noseDiameter === null
      ? {}
      : {
          assembly: {
            tool,
            holder,
            collet: null,
            stickout: meets,
            maxStickout: null,
          } as Assembly,
        },
  )
  const type = Math.max(2, profile.top * 0.026)
  const lane = type * 2.6
  const margin = Math.max(model.lengths.length * lane + type * 2, widest * 0.8, 6)
  /**
   * Millimetres, with the room the dimensions need and no more.
   *
   * Asymmetric on purpose: the lanes are all on the left, so matching that
   * margin on the right would push the tool into the left half of a panel
   * that is already narrow. Below the tip there is room for the diameter,
   * which is dimensioned under it.
   */
  const under = type * 3.4
  const view = {
    left: -widest - margin,
    width: widest * 2 + margin + type * 2,
    height: profile.top * 1.06 + under,
  }
  /** The silhouette as one closed path: up the right side, down the left. */
  const right = profile.steps.flatMap((step, at) => {
    const previous = profile.steps[at - 1]
    return previous === undefined
      ? [`M ${String(step.radius)} 0`]
      : [
          `L ${String(previous.radius)} ${String(step.fromHeight)}`,
          `L ${String(step.radius)} ${String(step.fromHeight)}`,
        ]
  })
  const last = profile.steps[profile.steps.length - 1]!
  const path = [
    ...right,
    `L ${String(last.radius)} ${String(profile.top)}`,
    `L ${String(-last.radius)} ${String(profile.top)}`,
    ...[...profile.steps].reverse().flatMap((step, at, all) => {
      const next = all[at + 1]
      return next === undefined
        ? [`L ${String(-step.radius)} 0`]
        : [
            `L ${String(-step.radius)} ${String(step.fromHeight)}`,
            `L ${String(-next.radius)} ${String(step.fromHeight)}`,
          ]
    }),
    'Z',
  ].join(' ')

  const line = 'stroke-zinc-600'

  return (
    <svg
      viewBox={`${String(view.left)} ${String(-under)} ${String(view.width)} ${String(view.height)}`}
      // Tip at the bottom, as a tool stands in a holder.
      transform="scale(1,-1)"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`${tool.catalogNumber}, drawn to scale`}
      className="h-64 w-full"
    >
      {/* The flutes, shaded, so where the cutting stops is visible at a glance. */}
      {flutes > 0 ? (
        <rect
          x={-(profile.steps[0]?.radius ?? 0)}
          y={0}
          width={(profile.steps[0]?.radius ?? 0) * 2}
          height={flutes}
          className="fill-info/20"
        />
      ) : null}
      <path d={path} className="fill-zinc-700/70 stroke-zinc-400" strokeWidth={0.3} />
      {/* The holder's half of the stack, a shade darker: one silhouette, two
          things to buy. */}
      {meets === null ? null : (
        <rect
          x={-widest}
          y={meets}
          width={widest * 2}
          height={Math.max(0, profile.top - meets)}
          className="fill-zinc-500/25"
        />
      )}
      {/* The axis. */}
      <line
        x1={0}
        y1={0}
        x2={0}
        y2={profile.top}
        strokeWidth={0.15}
        strokeDasharray="2 1.5"
        className={line}
      />
      <g transform="scale(1,-1)">
        <DimensionLines
          model={model}
          unit={unit}
          frame={{
            x: (r) => r,
            y: (z) => -z,
            fontSize: type,
            laneAt: (index) => -widest - (index + 1) * lane,
            edge: -widest,
          }}
        />
      </g>
    </svg>
  )
}
