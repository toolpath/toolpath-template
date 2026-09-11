import type { Collet, Holder } from '@toolpath/catalog-data'
import {
  colletTypeLabel,
  familyLabel,
  holderTypeLabel,
  valueOf,
  type ComponentKind,
} from './component-columns'
import { withinRange } from './filter'

/**
 * Narrowing a holder or collet list the way the tool list is narrowed.
 *
 * **Filtering for a brand or a type of holder was not a thing this page could
 * do** (Paul, 2026-09-07: "allow users to filter for specific brands and/or
 * types of holders"). The four holder filters that existed — taper, contact,
 * clamping, series — were a rail beside the tool table and applied to the
 * dropdown behind a tool; a brand was not among them, and neither was a family.
 *
 * Two kinds of narrowing, and they are different questions:
 *
 * - **Terms**, on words: brand, taper, clamping, series, family. Several values
 *   on an axis are an *or* — Kennametal *or* REGO-FIX — and several axes are an
 *   *and*, which is the same rule the tool filters follow.
 * - **Bounds**, on numbers: a gauge length at most 80 mm. Millimetres here,
 *   whatever the box was typed in — every length in this repository is.
 *
 * Pure, and separate from the columns, because a filter outlives the column it
 * was set from: hiding Gauge length must not quietly widen the list.
 */

/**
 * A number narrowed from one or both ends, in millimetres.
 *
 * The same shape `components/column-filter` draws, declared here rather than
 * imported from it: `app/shared` imports only `app/shared` and packages, and
 * `pnpm lint` is what says so.
 */
export interface Bound {
  readonly min?: number
  readonly max?: number
}

/** The axes a holder can be picked out by, in the order the questions get asked. */
export const HOLDER_TERM_AXES: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'brand', label: 'Brand' },
  { code: 'taper', label: 'Taper' },
  // The heading over it says Type, and the button that clears filters names an
  // axis by its column — `narrowingNames` — so the two have to agree.
  { code: 'clamping', label: 'Type' },
  { code: 'colletSeries', label: 'Collet series' },
  { code: 'contact', label: 'Contact' },
  { code: 'familyId', label: 'Family' },
]

export const COLLET_TERM_AXES: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'brand', label: 'Brand' },
  { code: 'series', label: 'Series' },
  { code: 'familyId', label: 'Family' },
]

export const termAxesFor = (kind: ComponentKind): ReadonlyArray<{ code: string; label: string }> =>
  kind === 'holder' ? HOLDER_TERM_AXES : COLLET_TERM_AXES

export interface ComponentQuery {
  /**
   * Free text over the catalog number and the vendor, together.
   *
   * **A rack is a list somebody arrives at already knowing the answer to**
   * (Paul, 2026-09-08: "catalog number needs a text search in holders and
   * collets as well"). The tool table has had one on its Catalog number column
   * since the filters moved onto the headings; a holder had to be found by
   * narrowing, which is no way to check whether the number on a chuck sitting
   * on the bench is in the crib. The rule is the tool list's, to the letter:
   * substring, case-insensitive, on the number and the brand at once, because
   * typing `REGO` means the maker and typing `2600` means the chuck.
   */
  readonly text: string
  readonly terms: Readonly<Record<string, ReadonlyArray<string>>>
  readonly bounds: Readonly<Record<string, Bound>>
}

export const NO_QUERY: ComponentQuery = { text: '', terms: {}, bounds: {} }

export const isEmptyQuery = (query: ComponentQuery): boolean =>
  query.text.trim() === '' &&
  Object.values(query.terms).every((values) => values.length === 0) &&
  Object.values(query.bounds).every((bound) => bound.min === undefined && bound.max === undefined)

/** How many narrowings are set, for the button that clears them. */
export const countTerms = (query: ComponentQuery): number =>
  (query.text.trim() === '' ? 0 : 1) +
  Object.values(query.terms).reduce((total, values) => total + values.length, 0) +
  Object.values(query.bounds).filter((bound) => bound.min !== undefined || bound.max !== undefined)
    .length

/** What somebody typed into the catalog-number column. */
export const setText = (query: ComponentQuery, text: string): ComponentQuery => ({
  ...query,
  text,
})

export const toggleTerm = (query: ComponentQuery, code: string, value: string): ComponentQuery => {
  const had = query.terms[code] ?? []
  const next = had.includes(value) ? had.filter((each) => each !== value) : [...had, value]
  return { ...query, terms: { ...query.terms, [code]: next } }
}

/**
 * One axis set to a list of values at once, which is what a column header hands
 * back: the checkboxes in it are one control over the whole axis, and toggling
 * them one at a time would write a query per tick.
 */
export const setTerm = (
  query: ComponentQuery,
  code: string,
  values: ReadonlyArray<string>,
): ComponentQuery => {
  const terms = { ...query.terms }
  if (values.length === 0) {
    delete terms[code]
  } else {
    terms[code] = [...values]
  }
  return { ...query, terms }
}

export const setBound = (
  query: ComponentQuery,
  code: string,
  bound: Bound | undefined,
): ComponentQuery => {
  const bounds = { ...query.bounds }
  if (bound === undefined || (bound.min === undefined && bound.max === undefined)) {
    delete bounds[code]
  } else {
    bounds[code] = bound
  }
  return { ...query, bounds }
}

/**
 * The word a record answers an axis with — the brand and the family off the
 * record itself, everything else through the column reader.
 *
 * A family answers with its **label** rather than its id, because the label is
 * what the filter offered and a filter that stores what it did not show is one
 * nobody can read back off a URL or a saved list.
 */
export const termOn = (
  kind: ComponentKind,
  record: Holder | Collet,
  code: string,
): string | null => {
  if (code === 'brand') {
    return record.brand
  }
  if (code === 'familyId') {
    return familyLabel(record.familyId)
  }
  /**
   * **What a collet *is*, as one line of a list** (Paul, 2026-09-08: "I should
   * be able to filter by holder type as a list. Let's add that … same with
   * collet type"). `ER20 collet` is how a shop says it out loud, and it is the
   * phrase the Type column shows.
   *
   * A holder answered here too until 2026-09-11, with `BT30 ER11 collet chuck`
   * — three of its columns glued into one phrase, and wrong for it. Its Type
   * column is `clamping` now, which answers through `valueOf` like any other
   * word, so nothing asks a holder this.
   */
  if (code === 'type') {
    return kind === 'holder' ? holderTypeLabel(record as Holder) : colletTypeLabel(record as Collet)
  }
  const value = valueOf(kind, record, code)
  return typeof value === 'string' ? value : null
}

const withinBound = (value: number | string | null, bound: Bound): boolean => {
  if (typeof value !== 'number') {
    // A record that states nothing cannot satisfy a constraint on the number —
    // the same rule `matchesFilters` applies to a word.
    return false
  }
  // The same inclusive comparison the tool list uses — `filter.ts`
  // § `BOUND_SLACK` says why `at most` needs a nanometre of room to mean it.
  return withinRange(value, bound)
}

export const matchesQuery = (
  kind: ComponentKind,
  record: Holder | Collet,
  query: ComponentQuery,
): boolean => {
  const wanted = query.text.trim().toLowerCase()
  if (wanted !== '' && !`${record.catalogNumber} ${record.brand}`.toLowerCase().includes(wanted)) {
    return false
  }
  for (const [code, values] of Object.entries(query.terms)) {
    if (values.length === 0) {
      continue
    }
    const value = termOn(kind, record, code)
    if (value === null || !values.includes(value)) {
      return false
    }
  }
  for (const [code, bound] of Object.entries(query.bounds)) {
    if (!withinBound(valueOf(kind, record, code), bound)) {
      return false
    }
  }
  return true
}

export const filterComponents = <T extends Holder | Collet>(
  kind: ComponentKind,
  records: ReadonlyArray<T>,
  query: ComponentQuery,
): ReadonlyArray<T> =>
  isEmptyQuery(query) ? records : records.filter((record) => matchesQuery(kind, record, query))

/**
 * The values an axis has among the records on show, with how many wear each.
 *
 * **What is offered is what is there**, the rule the tool filter panel already
 * follows: a taper no holder in the narrowed list carries is a choice that
 * empties the list, and a count beside each is what tells "rare" from "absent"
 * before the click.
 */
export const optionsOn = (
  kind: ComponentKind,
  records: ReadonlyArray<Holder | Collet>,
  code: string,
): Array<{ readonly value: string; readonly count: number }> => {
  const counts = new Map<string, number>()
  for (const record of records) {
    const value = termOn(kind, record, code)
    if (value !== null && value.length > 0) {
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }
  }
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value.localeCompare(b.value, 'en', { numeric: true }))
}
