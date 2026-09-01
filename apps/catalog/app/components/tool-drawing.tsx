import type { CatalogTool, Holder } from '@toolpath/catalog-data'
import { formatLength, type Unit } from '@toolpath/domain/units'
import { stackProfile, toolProfile } from 'shared/tool-profile'

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
 * above the cutter so the two read apart.
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

  // Millimetres, with room at the sides for the dimensions.
  const margin = Math.max(widest * 2.5, 6)
  const view = {
    left: -widest - margin,
    width: (widest + margin) * 2,
    height: profile.top * 1.06,
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

  const say = (value: number) => formatLength(value, unit)
  const line = 'stroke-zinc-600'
  const text = 'fill-zinc-400 text-[3px]'

  return (
    <svg
      viewBox={`${String(view.left)} ${String(-view.height * 0.03)} ${String(view.width)} ${String(view.height)}`}
      // Tip at the bottom, as a tool stands in a holder.
      transform="scale(1,-1)"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`${tool.catalogNumber}, drawn to scale`}
      className="h-56 w-full"
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
        {[
          /*
           * With a holder on it the long dimension is the **stickout**, not
           * the tool's overall length: the drawing is the stack, and a mark
           * that measured the whole silhouette and called it "overall" would
           * be a wrong number under a right word (Paul, 2026-08-31).
           */
          meets === null
            ? {
                at: -widest - 1.5,
                from: 0,
                to: profile.top,
                label: say(profile.top),
                name: 'overall',
              }
            : { at: -widest - 1.5, from: 0, to: meets, label: say(meets), name: 'stickout' },
          ...(flutes > 0
            ? [{ at: widest + 1.5, from: 0, to: flutes, label: say(flutes), name: 'flute' }]
            : []),
        ].map((mark) => (
          <g key={mark.name}>
            <line
              x1={mark.at}
              y1={-mark.from}
              x2={mark.at}
              y2={-mark.to}
              strokeWidth={0.15}
              className={line}
            />
            <text
              x={mark.at}
              y={-(mark.from + mark.to) / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              transform={`rotate(-90 ${String(mark.at)} ${String(-(mark.from + mark.to) / 2)})`}
              className={text}
            >
              {mark.label} {mark.name}
            </text>
          </g>
        ))}
        {/* The cutting diameter, across the tip. */}
        <text x={0} y={2.5} textAnchor="middle" className={text}>
          ⌀{say((profile.steps[0]?.radius ?? 0) * 2)}
        </text>
      </g>
    </svg>
  )
}
