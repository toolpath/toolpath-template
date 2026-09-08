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
 * The term axes first — brand and family are fixed columns rather than
 * `columnsFor` entries, and both are narrowed on the words the cell shows —
 * then every length, which is the same rule the filter panel used when it
 * built a range control per length column. A word column nobody filters on,
 * like the type a holder reads as, asks nothing.
 */
export const askOfComponentColumn = (kind: ComponentKind, code: string): ColumnAsk | null => {
  if (termAxesFor(kind).some((axis) => axis.code === code)) {
    return { shape: 'terms', axis: code }
  }
  const column = columnsFor(kind).find((each) => each.code === code)
  return column?.kind === 'length' ? { shape: 'range', kind: 'length' } : null
}
