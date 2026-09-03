import { useState } from 'react'
import { Card, cn } from '@toolpath/ui'
import {
  clearance,
  colletsFor,
  holdBand,
  stickoutLimits,
  withBuildStickout,
  type Assembly,
  type BuildSelection,
  type CatalogTool,
  type Margins,
} from '@toolpath/catalog-data'
import type { ReachCurve } from '@toolpath/part-contracts'
import { formatLength, type UnitSystem } from '@toolpath/tool-support'
import { collets as allCollets, holders as allHolders } from 'shared/catalog'
import { thresholdsFrom } from 'shared/holder-choice'
import { drawnAssembly } from 'shared/drawn-assembly'
import { CatalogDrawing } from './catalog-drawing'
import { LengthBox } from './length-box'

/**
 * What set the ceiling, in the words of the knob it came from.
 *
 * Three rules cap a stickout and the tightest wins — `stickoutRange` in
 * `@toolpath/catalog-data` is where they are compared. Before 2026-09-03 two of
 * them capped different numbers in different files, so there was nothing to
 * name.
 */
const CEILING_SAYS: Record<'clamp' | 'hold' | 'collet' | 'none', string> = {
  clamp: ' — held here by the shank the shop keeps clamped',
  hold: ' — held here by the share of the tool that stays in the holder',
  collet: ' — held here by the collet’s published grip length',
  none: '',
}

/**
 * The drawing, as a card, wherever the page decides to put it.
 *
 * The picker picks; the page places. Both read one `BuildSelection`, so they
 * cannot disagree about what is on screen. With nothing picked this draws the
 * tool by itself — a drawing, not a broken assembly.
 *
 * **The stickout control travels with the drawing**, because it is about the
 * picture. Its default is Paul's rule — the flutes plus whatever this holder
 * needs to clear this feature by the room the knobs ask for — and its bounds
 * are the tool's: the flutes at least, a third of the tool held at most. The
 * card says whose numbers they are, because no vendor publishes a stickout:
 * it is a property of the setup, not of the parts. The hold is graded good /
 * medium / bad by the sheet's thresholds.
 */
export interface DrawingCardProps {
  readonly tool: CatalogTool
  readonly unit: UnitSystem
  readonly selection: BuildSelection
  readonly onChange: (next: BuildSelection) => void
  /** The material around the selected feature, for the sweep — never drawn. */
  readonly curve?: ReachCurve | null
  /** Room the shop wants kept between the stack and the part; entered on the card. */
  readonly margins: Margins
  readonly onMargins: (next: Margins) => void
}

export const DrawingCard = ({
  tool,
  unit,
  selection,
  onChange,
  curve = null,
  margins,
  onMargins,
}: DrawingCardProps) => {
  /**
   * Which of the two is drawn. Kept while the panel is up, so a shop reading
   * cutters does not have to say so again on every tool it clicks.
   */
  const [view, setView] = useState<'tool' | 'assembly'>('assembly')
  const thresholds = thresholdsFrom()
  const { holder, required, limits, least, overLimit, stickout, band, assembly } = drawnAssembly(
    tool,
    selection,
    curve,
    margins,
    thresholds,
  )

  return (
    <Card className="flex size-full min-h-0 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-zinc-900 px-3 py-2">
        <h3 className="text-2xs font-semibold tracking-wide text-zinc-400 uppercase">Drawing</h3>
        {holder === null ? null : (
          <span className="flex gap-1">
            {(
              [
                ['tool', 'Tool'],
                ['assembly', 'Tool + holder'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                onClick={() => setView(value)}
                className={cn(
                  'text-2xs focus-visible:ring-info/60 rounded border px-2 py-0.5 transition focus-visible:ring-1 focus-visible:outline-none',
                  view === value
                    ? 'border-info/60 bg-info/15 text-info'
                    : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200',
                )}
              >
                {label}
              </button>
            ))}
          </span>
        )}
        {holder === null ? (
          <span className="text-2xs text-zinc-500">
            the tool alone — pick a holder to draw the assembly
          </span>
        ) : view === 'tool' ? null : limits === null ? (
          <span className="text-2xs text-zinc-500">
            this tool states no flute length, so there is no stickout to set
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <LengthBox
              id="stickout"
              label="stickout"
              value={stickout ?? limits.setup}
              unit={unit}
              min={overLimit ? limits.min : (least ?? limits.min)}
              max={limits.max ?? undefined}
              onChange={(millimetres) => onChange(withBuildStickout(selection, millimetres))}
            />
            <span
              className="text-2xs text-zinc-600"
              /*
                **Which rule set the ceiling**, because a bound nobody can trace
                is a number to argue with. `limitedBy` is the one place the
                sheet's two knobs are compared — `minimum clamping length`
                against `good hold` — and saying which won is what stops the
                next reader assuming the other one is broken (2026-09-03).
              */
              title={`This application's bounds, not a vendor's${CEILING_SAYS[limits.limitedBy ?? 'none']}`}
            >
              {limits.gripShort
                ? `only ${formatLength(limits.grip ?? 0, unit)} of shank behind the flutes, so it is drawn pushed all the way in`
                : overLimit
                  ? `needs ${formatLength(least ?? 0, unit)} to clear the part by ${formatLength(margins.radial, unit)} — over the ${formatLength(limits.max ?? 0, unit)} the tool allows`
                  : required !== null
                    ? `${formatLength(least ?? limits.min, unit)} – ${limits.max === null ? 'no stated limit' : formatLength(limits.max, unit)} clears the part by ${formatLength(margins.radial, unit)}`
                    : `${formatLength(limits.min, unit)} – ${limits.max === null ? 'no stated limit' : formatLength(limits.max, unit)}`}
            </span>
            {band === 'bad' ? (
              <span data-hold={band} className="text-2xs text-red-400">
                too little of the tool in the holder
              </span>
            ) : null}
          </span>
        )}
      </div>
      {holder !== null && curve !== null && view === 'assembly' ? (
        <div className="text-2xs flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-zinc-900 px-3 py-1.5 text-zinc-500">
          <span>holder clearance</span>
          <LengthBox
            id="radial-clearance"
            label="radial clearance"
            value={margins.radial}
            unit={unit}
            min={0}
            onChange={(millimetres) => onMargins({ ...margins, radial: millimetres })}
          />
          <LengthBox
            id="axial-clearance"
            label="axial clearance"
            value={margins.axial}
            unit={unit}
            min={0}
            onChange={(millimetres) => onMargins({ ...margins, axial: millimetres })}
          />
          <span title="Sideways from the walls, and above the part top. Yours, not a vendor's.">
            radial · axial
          </span>
        </div>
      ) : null}
      <div className="min-h-0 flex-1">
        <CatalogDrawing
          tool={tool}
          assembly={view === 'assembly' ? assembly : null}
          unit={unit}
          curve={view === 'assembly' ? curve : null}
          margins={margins}
          dimensions
        />
      </div>
    </Card>
  )
}
