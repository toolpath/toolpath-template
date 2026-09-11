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
 * What the header over a tool column asks.
 *
 * Every tool column is a value now, so every heading asks something: the two
 * that were a control rather than a value — the holder and the collet
 * dropdowns — came off the list on 2026-09-10. The `null` stays in the type
 * because `askOfTapColumn` shares it and a tap column can still ask nothing.
 */
export const askOfToolColumn = (code: string): ColumnAsk | null => {
  if (code === 'catalogNumber') {
    return { shape: 'text' }
  }
  const axis = TOOL_TERM_COLUMNS[code]
  if (axis !== undefined) {
    return { shape: 'terms', axis }
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
 * The type and the term axes first — type, brand and family are narrowed on the
 * words their cells show — then every length, which is the same rule the filter
 * panel used when it built a range control per length column.
 */
export const askOfComponentColumn = (kind: ComponentKind, code: string): ColumnAsk | null => {
  // The one column a shop arrives at already knowing the answer to — the same
  // search the tool table's Catalog number column carries.
  if (code === 'catalogNumber') {
    return { shape: 'text' }
  }
  /**
   * A collet's type is a column of its own before it is an axis: `ER20 collet`
   * is what a shop calls the thing (Paul, 2026-09-08), and `termOn` builds it,
   * so the list a header offers is the words the column shows.
   *
   * A **holder has no such column** — the phrase glued its Taper and Collet
   * series onto how it grips and was wrong for it (Paul, 2026-09-11). Its type
   * is the `clamping` axis, under the heading now called Type.
   */
  if (
    (code === 'type' && kind === 'collet') ||
    termAxesFor(kind).some((axis) => axis.code === code)
  ) {
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

/**
 * What the header over a tap column asks.
 *
 * **Two of them, and the rest sort** (Paul, 2026-09-09: "when I am in the TAPs
 * row or table, it should be filtering to taps"). A tap list is swept out of
 * the catalog by the thread — `makersFor` — rather than narrowed by the tool
 * query, so a funnel on its Vendor or Flute length heading would be a control
 * that changes nothing, which is why it carried none at all. The two that do
 * change something:
 *
 * - the catalog number, which every list of tools searches;
 * - the type, because a threaded hole's `form` filter is the drill **and** the
 *   taps and this list is the tap half of it — `hole-mode.ts` §
 *   `formsAskingTaps` is what a tick there writes;
 * - **the thread diameter and the thread length**, which the sweep already
 *   narrowed on and nothing said so (Paul, 2026-09-09: "shouldn't thread
 *   diameter and thread length be applied from the thread spec and model
 *   feature/group depth respectively?"). `hole-mode.ts` § `tapBounds` is the
 *   pair, and they are **stated** rather than asked: the list is swept on them
 *   rather than filtered by them, and the near misses a short list falls back
 *   to are the very rows that break them — so a box to type another number in
 *   would be a control with nothing behind it. A heading whose range has no
 *   `onBound` says the bound and offers no boxes; `column-heading.tsx` §
 *   `Asked` is that shape.
 */
const TAP_STATED = ['DC', 'LCF']

export const askOfTapColumn = (code: string): ColumnAsk | null =>
  code === 'catalogNumber' || code === 'type' || TAP_STATED.includes(code)
    ? askOfToolColumn(code)
    : null

/**
 * The name each axis wears where no column carries it.
 *
 * `form` reads out as **Type** because that is the column asking it — the tap
 * list's Type funnel and the tool list's are both the `form` filter under the
 * trade's own word. The rest are the parked axes and the two questions the
 * button row keeps.
 */
const OFF_COLUMN: Readonly<Record<string, string>> = {
  form: 'Type',
  materialGroups: 'Part material',
  taper: 'Taper',
  colletSeries: 'Collet series',
  shank: 'Shank',
  familyId: 'Family',
  productLine: 'Family',
  family: 'Family',
}

/**
 * What is narrowing a list, named the way the list names it.
 *
 * **A count nobody can decompose is not an answer** (Paul, 2026-09-09: "in Tap,
 * it shows 'Clear 4 filters' but I only see tool type. What are the 4 filters
 * active? It needs to be visible."). The button counted axes: `form` and `type`
 * are one question asked twice and counted twice, `familyId` and `productLine`
 * are one column and counted twice, and a range on a column somebody has since
 * hidden counted with nothing on screen pointing at it.
 *
 * Names rather than a number, so the button can say which — deduplicated on the
 * **name**, because two axes wearing one column's label are one filter as far
 * as anybody reading the table is concerned. `columns` is whichever list is
 * open, which is what makes the same axis read as `Diameter` over the tools and
 * `Thread diameter` over the taps.
 */
export const narrowingNames = (
  narrowing: {
    /** The catalog-number search, which every list of tools narrows on. */
    readonly text?: string
    readonly terms: Readonly<Record<string, ReadonlyArray<string>>>
    readonly bounds: Readonly<Record<string, { readonly min?: number; readonly max?: number }>>
  },
  columns: ReadonlyArray<{ readonly code: string; readonly label: string }>,
): Array<string> => {
  const nameOf = (code: string): string =>
    columns.find((column) => column.code === code)?.label ?? OFF_COLUMN[code] ?? code
  const names = new Set<string>()
  if ((narrowing.text ?? '').trim() !== '') {
    names.add(nameOf('catalogNumber'))
  }
  for (const [axis, values] of Object.entries(narrowing.terms)) {
    if (values.length > 0) {
      names.add(nameOf(axis))
    }
  }
  for (const [code, bound] of Object.entries(narrowing.bounds)) {
    if (bound.min !== undefined || bound.max !== undefined) {
      names.add(nameOf(code))
    }
  }
  return [...names]
}
