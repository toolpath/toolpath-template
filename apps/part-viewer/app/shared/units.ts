/**
 * Every number the Engine reports is in millimetres.
 *
 * The kernel normalises on import: whatever unit a STEP file declares, the
 * report comes back in millimetres — depths, areas, cutter diameters, corner
 * radii, all of it. Angles are the exception and arrive in degrees.
 *
 * So measurements are stored as the Engine gives them and converted only when
 * shown, which is what lets an inch shop and a metric shop read the same
 * report.
 */
export type Unit = 'in' | 'mm'

export const UNITS: readonly Unit[] = ['mm', 'in']

/** The unit the report itself is in, whatever the file was drawn in. */
export const MODEL_UNIT: Unit = 'mm'

const PER_INCH = 25.4

export const convertLength = (value: number, from: Unit, to: Unit): number => {
  if (from === to) return value
  return from === 'in' ? value * PER_INCH : value / PER_INCH
}

/** Areas scale with the square of the length conversion. */
export const convertArea = (value: number, from: Unit, to: Unit): number => {
  if (from === to) return value
  return from === 'in' ? value * PER_INCH ** 2 : value / PER_INCH ** 2
}

/**
 * Decimals worth showing at a given size.
 *
 * A thousandth of an inch and a hundredth of a millimetre are about the same
 * distance, and both are near the limit of what a mill holds — so each unit
 * gets the precision a machinist actually reads, rather than a fixed number of
 * decimals that is either noise in one unit or useless in the other.
 */
export const decimalsFor = (unit: Unit): number => (unit === 'in' ? 3 : 2)

export const formatLength = (value: number, to: Unit): string =>
  `${convertLength(value, MODEL_UNIT, to).toFixed(decimalsFor(to))} ${to}`

export const formatArea = (value: number, to: Unit): string =>
  `${convertArea(value, MODEL_UNIT, to).toFixed(decimalsFor(to))} ${to}²`

const STORAGE_KEY = 'part-viewer.unit'

/**
 * The unit persists, because it belongs to the person rather than to the part:
 * a machinist works in one of them all day and should not set it again after
 * opening a report.
 */
export function loadUnit(storage: Pick<Storage, 'getItem'> | null): Unit {
  return storage?.getItem(STORAGE_KEY) === 'in' ? 'in' : 'mm'
}

export function saveUnit(storage: Pick<Storage, 'setItem'> | null, unit: Unit): void {
  storage?.setItem(STORAGE_KEY, unit)
}
