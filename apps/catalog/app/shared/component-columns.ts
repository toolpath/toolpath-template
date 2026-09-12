import { formatLength, type UnitSystem } from '@toolpath/tool-support'
import type { Collet, Holder } from '@toolpath/catalog-data'

/**
 * What a holder and a collet are read on, as columns.
 *
 * **A holder is a thing with dimensions, not a line in a dropdown** (Paul,
 * 2026-09-07: "show holder information clearly, not a long drop down list").
 * Every holder decision on this page was made from a combobox showing a catalog
 * number and, at best, one reason it might not work — so "which of my BT30
 * chucks has the shortest gauge length" was a question the page could not be
 * asked at all.
 *
 * These are the same shape as `PartToolColumn` on purpose: the holder table and
 * the collet table are the tool table with different columns, so the column
 * picker, the ordering and the sorting are one behaviour rather than three.
 *
 * A column reads its value off the record itself rather than out of a geometry
 * bag, because a holder has no geometry bag — `noseDiameter` is a field, and
 * naming it `D1` here would put a translation table between this catalog and
 * `@toolpath/tool-support`'s vocabulary, which is where a nose becomes a bore.
 */

export type ComponentKind = 'holder' | 'collet'

/** How a value is drawn: a length converts with the unit, a word never does. */
export type ValueKind = 'length' | 'text'

export interface ComponentColumn {
  readonly code: string
  readonly label: string
  readonly kind: ValueKind
  readonly default: boolean
}

/**
 * What every component row says about which one it is.
 *
 * **In the picker with the rest of them** (Paul, 2026-09-08: "I should also see
 * ALL the columns in the list"). They were drawn outside the column set — four
 * headers the picker had never heard of — so a list could not be cut down to
 * the two things somebody was comparing, and the four columns this session
 * added or renamed were missing from the one place that lists columns.
 *
 * A *collet* still carries a derived Type — `ER20 collet` — because its series
 * and its type are the same fact said twice. A **holder does not** (Paul,
 * 2026-09-11: the holder Type field is incorrect): `BT30 ER16 collet chuck` was
 * three other columns glued together, so it repeated Taper and Collet series
 * and disagreed with them wherever one of the three was read differently. How a
 * holder grips is the honest answer to "what type is it", and that is the
 * Clamping column, which is called **Type** now.
 */
const IDENTITY: ReadonlyArray<ComponentColumn> = [
  { code: 'catalogNumber', label: 'Catalog number', kind: 'text', default: true },
  { code: 'brand', label: 'Vendor', kind: 'text', default: true },
]

const FAMILY: ComponentColumn = {
  code: 'familyId',
  label: 'Family',
  kind: 'text',
  default: true,
}

/**
 * What a holder is, then the nine numbers a vendor publishes.
 *
 * Gauge length, taper, series and clamping lead, because those are what a
 * holder is chosen on; the silhouette dimensions follow, off by default, since
 * they are read when something does not clear rather than when it does.
 */
export const HOLDER_COLUMNS: ReadonlyArray<ComponentColumn> = [
  ...IDENTITY,
  FAMILY,
  { code: 'taper', label: 'Taper', kind: 'text', default: true },
  { code: 'clamping', label: 'Type', kind: 'text', default: true },
  { code: 'colletSeries', label: 'Collet series', kind: 'text', default: true },
  { code: 'gaugeLength', label: 'Gauge length', kind: 'length', default: true },
  { code: 'projection', label: 'Projection', kind: 'length', default: true },
  { code: 'noseDiameter', label: 'Nose Ø', kind: 'length', default: true },
  { code: 'contact', label: 'Contact', kind: 'text', default: false },
  { code: 'noseLength', label: 'Nose length', kind: 'length', default: false },
  { code: 'bodyDiameter', label: 'Body Ø', kind: 'length', default: false },
  { code: 'bodyLength', label: 'Body length', kind: 'length', default: false },
  { code: 'flangeDiameter', label: 'Flange Ø', kind: 'length', default: false },
  { code: 'boreDiameter', label: 'Bore Ø', kind: 'length', default: false },
  { code: 'colletProtrusion', label: 'Collet protrusion', kind: 'length', default: false },
]

export const COLLET_COLUMNS: ReadonlyArray<ComponentColumn> = [
  ...IDENTITY,
  { code: 'type', label: 'Type', kind: 'text', default: true },
  FAMILY,
  { code: 'series', label: 'Series', kind: 'text', default: true },
  { code: 'clampMin', label: 'Grips from', kind: 'length', default: true },
  { code: 'clampMax', label: 'Grips to', kind: 'length', default: true },
  { code: 'clampLength', label: 'Grip length', kind: 'length', default: true },
]

export const columnsFor = (kind: ComponentKind): ReadonlyArray<ComponentColumn> =>
  kind === 'holder' ? HOLDER_COLUMNS : COLLET_COLUMNS

export const hiddenByDefault = (columns: ReadonlyArray<ComponentColumn>): Array<string> =>
  columns.filter((column) => !column.default).map((column) => column.code)

/**
 * A family read as words, from the id the scrape minted.
 *
 * Toolholding carries no family record — a `ToolFamily` is a cutting tool's, and
 * a holder states only the id it was scraped under. So the id is shown as
 * words, which is the vendor's own grouping said plainly, rather than a name
 * this repository invented for it.
 */
export const familyLabel = (familyId: string): string =>
  familyId
    .split(/[-_]/)
    .filter((word) => word.length > 0)
    .map((word) => (word.length <= 3 ? word.toUpperCase() : word[0]?.toUpperCase() + word.slice(1)))
    .join(' ')

/** How a holder grips, in the words a shop uses rather than the field's. */
const CLAMPING_NOUN: Readonly<Record<string, string>> = {
  collet: 'collet chuck',
  bore: 'end mill holder',
  shrink: 'shrink fit',
  hydraulic: 'hydraulic chuck',
}

/**
 * The same kinds as a noun a sentence can take.
 *
 * `shrink fit` is the whole answer in a cell headed Type and an adjective in a
 * sentence — "no collet required for a shrink fit" names nothing — so it is the
 * one kind that needs the word attaching. Derived from {@link CLAMPING_NOUN}
 * rather than written out again, so a clamping mode added to one is never
 * missing from the other.
 */
const CLAMPING_PHRASE: Readonly<Record<string, string>> = {
  ...CLAMPING_NOUN,
  shrink: 'shrink fit holder',
}

/** How a holder grips, as something a sentence can name: `a shrink fit holder`. */
export const clampingPhrase = (holder: Pick<Holder, 'clamping'>): string =>
  CLAMPING_PHRASE[holder.clamping] ?? 'holder'

/** What a holder is, in the words a shop uses for it: `BT30 collet chuck`. */
export const holderTypeLabel = (holder: Holder): string =>
  [
    holder.taper,
    holder.clamping === 'collet' ? holder.colletSeries : null,
    CLAMPING_NOUN[holder.clamping],
  ]
    .filter((word): word is string => Boolean(word))
    .join(' ')

export const colletTypeLabel = (collet: Collet): string => `${collet.series} collet`

/** The raw value behind a column, for sorting — a number, a word, or nothing. */
export const holderValue = (holder: Holder, code: string): number | string | null => {
  switch (code) {
    case 'catalogNumber':
      return holder.catalogNumber
    case 'brand':
      return holder.brand
    case 'familyId':
      return familyLabel(holder.familyId)
    case 'taper':
      return holder.taper
    case 'clamping':
      return CLAMPING_NOUN[holder.clamping] ?? holder.clamping
    case 'contact':
      return holder.contact
    case 'colletSeries':
      return holder.colletSeries
    case 'gaugeLength':
      return holder.gaugeLength
    case 'projection':
      return holder.projection
    case 'noseDiameter':
      return holder.noseDiameter
    case 'noseLength':
      return holder.noseLength
    case 'bodyDiameter':
      return holder.bodyDiameter
    case 'bodyLength':
      return holder.bodyLength
    case 'flangeDiameter':
      return holder.flangeDiameter
    case 'boreDiameter':
      return holder.boreDiameter ?? null
    case 'colletProtrusion':
      return holder.colletProtrusion
    default:
      return null
  }
}

export const colletValue = (collet: Collet, code: string): number | string | null => {
  switch (code) {
    case 'catalogNumber':
      return collet.catalogNumber
    case 'brand':
      return collet.brand
    case 'type':
      return colletTypeLabel(collet)
    case 'familyId':
      return familyLabel(collet.familyId)
    case 'series':
      return collet.series
    case 'clampMin':
      return collet.clampMin
    case 'clampMax':
      return collet.clampMax
    case 'clampLength':
      return collet.clampLength
    default:
      return null
  }
}

export const valueOf = (
  kind: ComponentKind,
  record: Holder | Collet,
  code: string,
): number | string | null =>
  kind === 'holder' ? holderValue(record as Holder, code) : colletValue(record as Collet, code)

/**
 * A value as it is read: a length in the unit being worked in, a word as it is,
 * and an em dash where the vendor stated nothing.
 *
 * An absent number is not a zero — a holder with no stated body diameter is not
 * a holder with no body — so nothing is invented to fill the cell.
 */
export const formatValue = (
  value: number | string | null,
  kind: ValueKind,
  unit: UnitSystem,
): string => {
  if (value === null) {
    return '—'
  }
  if (typeof value === 'string') {
    return value
  }
  return kind === 'length' ? formatLength(value, unit) : String(value)
}

/**
 * The values on an axis, for the filter that offers them.
 *
 * Sorted and deduplicated, and a record stating nothing on the axis is simply
 * absent rather than a blank choice — `matchesFilters` already refuses a holder
 * with no value on a constrained axis, so offering "none" would be an option
 * that empties the list.
 */
export const valuesOn = (
  kind: ComponentKind,
  records: ReadonlyArray<Holder | Collet>,
  code: string,
): Array<string> => {
  const seen = new Set<string>()
  for (const record of records) {
    const value = valueOf(kind, record, code)
    if (typeof value === 'string' && value.length > 0) {
      seen.add(value)
    }
  }
  return [...seen].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
}
