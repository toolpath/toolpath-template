import { formatLength, type UnitSystem } from '@toolpath/tool-support'
import { columnsFor, type ComponentKind } from './component-columns'
import { termAxesFor } from './component-query'

/**
 * Which question a column header asks, for the three lists.
 *
 * **A filter behind a button, over a table whose headers say the same words,
 * is the same question asked twice** (Paul, 2026-09-08). Vendor was a tile
 * picker in a popover *and* a column called Vendor; Diameter was a range in
 * that popover *and* a column called Diameter. So a column that names a value
 * is where that value is narrowed, and the popover keeps only what no column
 * shows — a part material, a family, a product line, a shank.
 *
 * The rule is here rather than in either table because both tables and the
 * button row have to agree about it: a filter asked in a header *and* on a
 * button is the defect, and it can only be prevented by one list saying which
 * is which.
 */

/** How a number is read, which is what decides whether it converts with the unit. */
export type RangeKind = 'length' | 'count' | 'deg' | 'ratio'

export type ColumnAsk =
  | { readonly shape: 'text' }
  | { readonly shape: 'terms'; readonly axis: string }
  | { readonly shape: 'range'; readonly kind: RangeKind }

/** The tool columns holding words rather than numbers, and the axis each is. */
const TOOL_TERM_COLUMNS: Readonly<Record<string, string>> = {
  brand: 'brand',
  // Not `form`: the Type column says `Reduced shank bull nose end mill`, and
  // the filter on it offers exactly the phrases the column shows.
  type: 'type',
  // Not `familyId`: one grouping, the vendor's line where it names one.
  family: 'family',
}

/**
 * The axes a tool column narrows on with words rather than numbers.
 *
 * What a `…` row has to be measured against: only an axis of values can have
 * values it is not showing, and the list of them is this file's to say for the
 * same reason `AXES_IN_TOOL_COLUMNS` is.
 */
export const TOOL_TERM_AXES: ReadonlyArray<string> = Object.values(TOOL_TERM_COLUMNS)

/**
 * The three tool numbers that are not lengths.
 *
 * A flute count converts to nothing, a point angle is degrees in either unit,
 * and an L/D is a ratio. Reading one as a length would offer to convert it and
 * turn `4` flutes into `0.157`.
 */
const TOOL_RANGE_KINDS: Readonly<Record<string, RangeKind>> = {
  NOF: 'count',
  SIG: 'deg',
  LD: 'ratio',
}

/**
 * The two tool columns that are a control rather than a value.
 *
 * A holder cell is a dropdown that *sets* the holding on that row, so a funnel
 * beside it would read as narrowing by a choice the row does not have yet.
 */
const NOT_ASKED = ['holder', 'collet']

/** What the header over a tool column asks, or nothing where it asks nothing. */
export const askOfToolColumn = (code: string): ColumnAsk | null => {
  if (code === 'catalogNumber') {
    return { shape: 'text' }
  }
  const axis = TOOL_TERM_COLUMNS[code]
  if (axis !== undefined) {
    return { shape: 'terms', axis }
  }
  if (NOT_ASKED.includes(code)) {
    return null
  }
  return { shape: 'range', kind: TOOL_RANGE_KINDS[code] ?? 'length' }
}

/**
 * The tool filter axes a column header now asks, so the button row does not.
 *
 * Stated rather than derived because the columns are the table's and the
 * buttons are the panel's, and neither may import the other;
 * `components/tool-columns.test.ts` is the sensor that keeps this list and
 * `TOOL_COLUMNS` from drifting apart.
 */
export const AXES_IN_TOOL_COLUMNS: ReadonlyArray<string> = [
  'brand',
  'type',
  'family',
  'DC',
  'LCF',
  'NOF',
]

/**
 * The axes with a rule behind them and no control on the page (Paul,
 * 2026-09-08: "keep the rule on the back end but hide them for now").
 *
 * Every one of them still narrows if it is set — a URL carrying one is read,
 * and the app writes two of them itself — so nothing behind them was removed:
 *
 * - `taper` and `colletSeries` are the crib's, and the crib is what the
 *   assembly tree picks a holder out of anyway.
 * - `shank` is now said in the Type column instead, as a phrase.
 * - `form` is what a feature's suggestions and the predrill buttons write, and
 *   the Type column asks it in the trade's words.
 * - `familyId` and `productLine` are one Family column now.
 */
export const AXES_PARKED: ReadonlyArray<string> = [
  'taper',
  'colletSeries',
  'shank',
  'form',
  'familyId',
  'productLine',
]

/**
 * What the header over a holder or collet column asks.
 *
 * The type and the term axes first — type, brand and family are fixed columns
 * rather than `columnsFor` entries, and each is narrowed on the words its cell
 * shows — then every length, which is the same rule the filter panel used when
 * it built a range control per length column.
 */
export const askOfComponentColumn = (kind: ComponentKind, code: string): ColumnAsk | null => {
  // The one column a shop arrives at already knowing the answer to — the same
  // search the tool table's Catalog number column carries.
  if (code === 'catalogNumber') {
    return { shape: 'text' }
  }
  /**
   * The type is a column of its own before it is an axis: it is three of a
   * holder's columns said as one phrase — `BT30 ER11 collet chuck` — and that
   * phrase is what a shop calls the thing (Paul, 2026-09-08). `termOn` builds
   * it, so the list a header offers is the words the column shows.
   */
  if (code === 'type' || termAxesFor(kind).some((axis) => axis.code === code)) {
    return { shape: 'terms', axis: code }
  }
  const column = columnsFor(kind).find((each) => each.code === code)
  return column?.kind === 'length' ? { shape: 'range', kind: 'length' } : null
}

/**
 * A bound in the words the boxes under it are using.
 *
 * **A warning about a number has to say the number** (Paul, 2026-09-08: "when I
 * override a geometry-set filter, it should warn me there"). The filter dialog
 * says what the geometry asked for before it offers to set it aside, and it has
 * to say it in the unit the person is reading in and in the shape the operator
 * they chose is written in — `≤ 8.00 mm`, not `{"max":8}`.
 *
 * Here rather than in the dialog because {@link RangeKind} is what decides
 * whether a number converts at all, and that rule already lives in this file: a
 * flute count read as a length would offer `4` flutes as `0.157`.
 */
export const sayBound = (
  kind: RangeKind,
  bound: { readonly min?: number; readonly max?: number },
  unit: UnitSystem,
): string => {
  const word = (value: number): string => {
    switch (kind) {
      case 'length':
        return formatLength(value, unit)
      case 'deg':
        return `${value.toFixed(1)}°`
      case 'ratio':
        return value.toFixed(1)
      default:
        return String(value)
    }
  }
  const { min, max } = bound
  if (min !== undefined && max !== undefined) {
    return min === max ? word(min) : `${word(min)} to ${word(max)}`
  }
  if (max !== undefined) {
    return `at most ${word(max)}`
  }
  return min === undefined ? 'anything' : `at least ${word(min)}`
}
