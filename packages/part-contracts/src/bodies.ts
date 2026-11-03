import {
  convertLength,
  decimalsFor,
  UNIT_ABBREVIATION,
  type UnitSystem,
} from '@toolpath/tool-support'
import type { PartBody } from './contracts.js'

/**
 * What a body of a multi-body file is called on screen: its own name, or its
 * place in the file counted from one where the CAD gave it none.
 */
export const bodyLabel = (body: PartBody): string => body.name ?? `Body ${body.index + 1}`

/** A body's bounding box as its three extents, in millimetres. */
export const bodySize = ({ boundingBox: { lower, upper } }: PartBody) => ({
  width: upper.x - lower.x,
  depth: upper.y - lower.y,
  height: upper.z - lower.z,
})

/**
 * The line under a body's name — `24 faces · 40.00 × 15.00 × 8.00 mm` — which
 * tells two bodies apart, in whichever unit is being read.
 */
export const bodyDescription = (body: PartBody, unit: UnitSystem): string => {
  const faces = body.faceCount === 1 ? '1 face' : `${body.faceCount} faces`
  const sides = Object.values(bodySize(body)).map((side) =>
    convertLength(side, 'millimeters', unit).toFixed(decimalsFor(unit)),
  )
  return `${faces} · ${sides.join(' × ')} ${UNIT_ABBREVIATION[unit]}`
}
