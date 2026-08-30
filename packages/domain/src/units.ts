/**
 * Every length Toolpath states is in millimetres.
 *
 * The kernel normalises on import: whatever unit a STEP file declares, the
 * report comes back in millimetres — depths, areas, cutter diameters, corner
 * radii, all of it. Angles are the exception and arrive in degrees. Vendor
 * tool data is converted to the same millimetre basis on ingest, so an inch
 * catalog and a metric catalog compare.
 *
 * So measurements are stored as Toolpath gives them and converted only when
 * shown, which is what lets an inch shop and a metric shop read the same
 * numbers.
 */
export type Unit = 'in' | 'mm'

export const UNITS: ReadonlyArray<Unit> = ['mm', 'in']

/** The unit the report itself is in, whatever the file was drawn in. */
export const MODEL_UNIT: Unit = 'mm'

const PER_INCH = 25.4

export const convertLength = (value: number, from: Unit, to: Unit): number => {
  if (from === to) {
    return value
  }
  return from === 'in' ? value * PER_INCH : value / PER_INCH
}

/** Areas scale with the square of the length conversion. */
export const convertArea = (value: number, from: Unit, to: Unit): number => {
  if (from === to) {
    return value
  }
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

/**
 * The unit persists, because it belongs to the person rather than to the thing
 * being looked at: a machinist works in one of them all day and should not set
 * it again after opening a report or a catalog.
 *
 * The key is the caller's, not this module's. Two applications on one origin
 * would otherwise silently share the preference — which is defensible, but it
 * is a decision each application should make rather than inherit from a
 * constant it cannot see.
 */
export const loadUnit = (storage: Pick<Storage, 'getItem'> | null, key: string): Unit => {
  return storage?.getItem(key) === 'in' ? 'in' : 'mm'
}

export const saveUnit = (
  storage: Pick<Storage, 'setItem'> | null,
  key: string,
  unit: Unit,
): void => {
  storage?.setItem(key, unit)
}
