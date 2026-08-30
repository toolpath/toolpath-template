import { GEOMETRY_FIELDS, type CatalogTool, type GeometryField } from '@toolpath/catalog-data'
import { convertLength, decimalsFor, MODEL_UNIT, type Unit } from '@toolpath/domain/units'

/** One geometry value, ready to read: its label, its number, and where it came from. */
export interface GeometryRow {
  readonly code: string
  readonly label: string
  readonly value: string
  readonly description: string | null
  /** Absent where the dataset does not say — which is not the same as vendor-stated. */
  readonly provenance: string | null
}

/**
 * A single value, in the unit somebody is reading in.
 *
 * Counts and angles are not lengths and are never converted: a four-flute
 * endmill has four flutes in every unit system, and a 140° point angle is 140°
 * in both.
 */
export const formatGeometry = (code: string, value: number, unit: Unit): string => {
  const field: GeometryField | undefined = GEOMETRY_FIELDS[code]
  if (field?.unit === 'count') {
    return String(value)
  }
  if (field?.unit === 'deg') {
    return `${value.toFixed(1)}°`
  }
  // A ratio is the same number in every unit system, and it is read as "2.6
  // diameters", so it is shown as a bare figure rather than dressed as a length.
  if (field?.unit === 'ratio') {
    return value.toFixed(1)
  }
  return `${convertLength(value, MODEL_UNIT, unit).toFixed(decimalsFor(unit))} ${unit}`
}

/**
 * Every geometry field a tool states, the defined ones first.
 *
 * A code the dictionary cannot explain is still shown — under the vendor's own
 * code, with no invented label. Hiding it would lose data the vendor published;
 * labelling it would assert a meaning nobody in this repository has checked.
 */
export const geometryRows = (tool: CatalogTool, unit: Unit): Array<GeometryRow> => {
  const entries = Object.entries(tool.geometry)
  const known = entries.filter(([code]) => code in GEOMETRY_FIELDS)
  const unknown = entries.filter(([code]) => !(code in GEOMETRY_FIELDS))

  return [...known, ...unknown].map(([code, value]) => {
    const field = GEOMETRY_FIELDS[code]
    return {
      code,
      label: field?.label ?? code,
      value: formatGeometry(code, value, unit),
      description: field?.description ?? null,
      provenance: tool.provenance[code] ?? null,
    }
  })
}

/** What a tool is called in a list: the number a shop orders by, and its size. */
export const toolHeadline = (tool: CatalogTool, unit: Unit): string => {
  const diameter = tool.geometry.DC
  if (diameter === undefined) {
    return tool.catalogNumber
  }
  return `${tool.catalogNumber} · ⌀${formatGeometry('DC', diameter, unit)}`
}
