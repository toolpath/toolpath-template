import { TargetIcon } from '@phosphor-icons/react'
import { formatLength, type UnitSystem } from '@toolpath/tool-support'
import { RailBubble } from './filter-rail'
import { LengthBox } from './length-box'

/**
 * How far off the hole a drill may be.
 *
 * The sheet keeps it as two knobs — `drill oversize` and `drill undersize`,
 * 0.004 in each — because a shop may take more one way than the other, and
 * the rail asks it the same way: **plus and minus separately** (Paul,
 * 2026-08-31).
 *
 * Like the floor radius, it is not a filter: it is the knob the two drill
 * rules read, so raising it admits drills rather than hiding any.
 */
export interface DrillDeviationProps {
  /** How far over the hole a drill may be, in millimetres. */
  readonly over: number
  /** How far under it, in millimetres — a shop may take more one way. */
  readonly under: number
  readonly onChange: (change: { readonly over: number; readonly under: number }) => void
  /** The sheet's own numbers, to say what changing them is a departure from. */
  readonly sheet: { readonly over: number; readonly under: number }
  readonly unit: UnitSystem
}

export const DrillDeviationFields = ({
  over,
  under,
  onChange,
  sheet,
  unit,
}: DrillDeviationProps) => (
  <>
    <p className="text-2xs text-zinc-400">
      How far a drill's diameter may be from the hole. Over and under are asked separately, because
      a shop takes more one way than the other. The list says how far off each drill is.
    </p>
    <div className="flex flex-col gap-2">
      <LengthBox
        id="drill-oversize"
        label="Over the hole"
        value={over}
        unit={unit}
        min={0}
        onChange={(value) => onChange({ over: value, under })}
      />
      <LengthBox
        id="drill-undersize"
        label="Under the hole"
        value={under}
        unit={unit}
        min={0}
        onChange={(value) => onChange({ over, under: value })}
      />
    </div>
    <p className="text-2xs text-zinc-600">
      The sheet says +{formatLength(sheet.over, unit)} and −{formatLength(sheet.under, unit)}.
    </p>
  </>
)

export const DrillDeviation = ({ over, under, onChange, sheet, unit }: DrillDeviationProps) => {
  const changed = over !== sheet.over || under !== sheet.under
  return (
    <RailBubble
      icon={<TargetIcon />}
      label="Max drill deviation"
      value={changed ? [`+${formatLength(over, unit)}`, `−${formatLength(under, unit)}`] : []}
      onClear={changed ? () => onChange(sheet) : undefined}
    >
      <div className="flex flex-col gap-2">
        <DrillDeviationFields
          over={over}
          under={under}
          onChange={onChange}
          sheet={sheet}
          unit={unit}
        />
      </div>
    </RailBubble>
  )
}
