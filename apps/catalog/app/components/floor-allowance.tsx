import { formatLength, type Unit } from '@toolpath/domain/units'
import { FloorRadiusIcon } from './tool-icons'
import { RailBubble } from './filter-rail'
import { LengthBox } from './length-box'

/**
 * How much radius a floor the model draws sharp will take.
 *
 * A bull nose standing in for a flat end leaves its own radius in the corner
 * of the floor, and the sheet's `finishing radius limit` is how much of that
 * a shop will accept — 0.001 in out of the engine. It was a number only
 * somebody editing the sheet could change; Paul (2026-08-31) wants it on the
 * rail: *allow bull nose tools up to this floor radius*.
 *
 * It is not a filter. It is the knob the rule reads, so raising it stops the
 * caution on those tools rather than hiding or showing any.
 */
export interface FloorAllowanceProps {
  /** The radius allowed, in millimetres. */
  readonly value: number
  readonly onChange: (millimetres: number) => void
  /** The sheet's own number, to say what raising it is a departure from. */
  readonly sheetValue: number
  readonly unit: Unit
}

export const FloorAllowance = ({ value, onChange, sheetValue, unit }: FloorAllowanceProps) => (
  <RailBubble
    icon={<FloorRadiusIcon />}
    label="Floor radius allowed"
    value={value > sheetValue ? [formatLength(value, unit)] : []}
    onClear={value > sheetValue ? () => onChange(sheetValue) : undefined}
  >
    <p className="text-2xs mb-2 text-zinc-400">
      A bull nose leaves its own radius on a floor the model draws sharp. Tools up to this radius
      are offered without a caution.
    </p>
    <LengthBox
      id="floor-allowance"
      label="Floor radius allowed"
      value={value}
      unit={unit}
      min={0}
      onChange={onChange}
    />
    <p className="text-2xs mt-2 text-zinc-600">The sheet says {formatLength(sheetValue, unit)}.</p>
  </RailBubble>
)
