import { shankOf, type CatalogTool } from '@toolpath/catalog-data'
import { typeLabel } from './tool-type'

/**
 * A selection, and the only thing that decides which tools are on screen.
 *
 * It is a plain value rather than component state so that the URL can hold it:
 * a filtered view somebody found is a view they can send to a colleague, and
 * that only works if the selection round-trips through the query string
 * without loss. {@link queryFromSearch} and {@link searchFromQuery} are that
 * round trip, and they are tested as one.
 */
export interface ToolQuery {
  /** Free text over the identifiers a shop actually types. */
  readonly text: string
  /** Discrete axes: a value list per facet key. Empty means unconstrained. */
  readonly terms: Readonly<Record<string, ReadonlyArray<string>>>
  /** Continuous axes, in millimetres — the basis the dataset is stored in. */
  readonly ranges: Readonly<Record<string, { readonly min?: number; readonly max?: number }>>
}

export const EMPTY_QUERY: ToolQuery = { text: '', terms: {}, ranges: {} }

/** What free text is matched against: identity, never geometry. */
const haystack = (tool: CatalogTool): string =>
  [
    tool.catalogNumber,
    tool.materialNumber ?? '',
    tool.brand,
    tool.familyId,
    // The name a machinist types. `GOdrill`, `KenCut FF` and `Viper` are what
    // a shop calls a tool, and none of them is anywhere else in this list.
    tool.productLine ?? '',
  ]
    .join(' ')
    .toLowerCase()

/**
 * The axes where a tool carries several values, and matching means "any of".
 *
 * A tool indexed for steel and stainless answers a question about either, so
 * an intersection here would be wrong: nobody is asking for a tool that is
 * *only* for steel.
 */
const listValues = (tool: CatalogTool, key: string): ReadonlyArray<string> | null =>
  // `null` — nobody rated the tool — carries no values, so it answers no
  // material question and drops out of a filtered view. That is the same
  // outcome as `[]` and a different reason for it, which is why the two are
  // still distinguishable on the tool itself.
  key === 'materialGroups' ? (tool.materialGroups ?? []) : null

const termValue = (tool: CatalogTool, key: string): string | null => {
  switch (key) {
    case 'form':
      return tool.form
    case 'toolType':
      return tool.toolType
    case 'brand':
      return tool.brand
    case 'unitSystem':
      return tool.unitSystem
    case 'familyId':
      return tool.familyId
    case 'productLine':
      return tool.productLine
    /**
     * **One question where there were two** (Paul, 2026-09-08: "product line
     * and family are the same and need to be rolled into one Family field").
     * A vendor's line spans its families and a family belongs to a line; a
     * shop reading either was reading the same grouping under two headings.
     * The line is the answer where a vendor names one, and the family id
     * where it does not — the id being what the Family column then reads out
     * under the vendor's own title.
     */
    case 'family':
      return tool.productLine ?? tool.familyId
    /**
     * **The type, with the shank rolled into it** (Paul, 2026-09-08). The
     * value is the phrase the Type column shows, built by `typeLabel`, so a
     * row and the filter that names it cannot disagree. `form` and `shank`
     * still stand behind it: the rules and the suggestions write those.
     */
    case 'type':
      return typeLabel(tool)
    /**
     * **Not a geometry code.** The shank is the catalog's own reading of the
     * shoulder — `shankOf` — and without this case it fell through to
     * `tool.geometry.shank`, which no tool carries: every tool then failed the
     * filter and picking Full or Reduced emptied the list (Paul, 2026-08-31:
     * "our reduced shank filter is not working correctly").
     */
    case 'shank':
      return shankOf(tool)
    default: {
      const geometry = tool.geometry[key]
      return geometry === undefined ? null : String(geometry)
    }
  }
}

const matchesTerms = (tool: CatalogTool, terms: ToolQuery['terms']): boolean =>
  Object.entries(terms).every(([key, values]) => {
    if (values.length === 0) {
      return true
    }
    const list = listValues(tool, key)
    if (list !== null) {
      return list.some((each) => values.includes(each))
    }
    const value = termValue(tool, key)
    return value !== null && values.includes(value)
  })

/**
 * A tool that does not state the dimension is out, not in.
 *
 * Asking for a corner radius under 1 mm and being shown tools whose radius
 * nobody knows is the answer a machinist cannot use — a missing field is not a
 * small one.
 */
/**
 * How close to a bound still counts as on it.
 *
 * **`at most` means at most, in whichever unit it was typed in** (Paul,
 * 2026-09-08: "the At Most, At Least, etc. filters are not working as 'or equal
 * to', which they should be"). The dataset is millimetres and a shop reading in
 * inches types inches, so the bound is converted before it is compared — and
 * `0.75 × 25.4` is `19.049999999999997`, a hair under the `19.05` the catalog
 * stores for that very tool. 966 values in a scraped catalog sit on the wrong
 * side of their own nominal size that way, so a ⌀0.750 in cutter was missing
 * from `at most 0.750 in`.
 *
 * A nanometre, which is four orders of magnitude finer than the tightest step
 * between two sizes in any catalog here — so it can forgive a float's last
 * digit without ever admitting a tool a shop would call a different size.
 */
export const BOUND_SLACK = 1e-6

/** Whether a millimetre value is inside a bound, `at most` meaning at most. */
export const withinRange = (
  value: number,
  bound: { readonly min?: number; readonly max?: number },
): boolean =>
  !(bound.min !== undefined && value < bound.min - BOUND_SLACK) &&
  !(bound.max !== undefined && value > bound.max + BOUND_SLACK)

const matchesRanges = (tool: CatalogTool, ranges: ToolQuery['ranges']): boolean =>
  Object.entries(ranges).every(([key, bound]) => {
    if (bound.min === undefined && bound.max === undefined) {
      return true
    }
    const value = tool.geometry[key]
    return value === undefined ? false : withinRange(value, bound)
  })

/** Pure, and the whole of the search: the same function the tests run on literals. */
export const filterTools = (
  tools: ReadonlyArray<CatalogTool>,
  query: ToolQuery,
): Array<CatalogTool> => {
  const text = query.text.trim().toLowerCase()
  return tools.filter(
    (tool) =>
      (text === '' || haystack(tool).includes(text)) &&
      matchesTerms(tool, query.terms) &&
      matchesRanges(tool, query.ranges),
  )
}

/** How many tools of a result set carry each value of one axis. */
export const countBy = (
  tools: ReadonlyArray<CatalogTool>,
  key: string,
): ReadonlyMap<string, number> => {
  const counts = new Map<string, number>()
  for (const tool of tools) {
    const list = listValues(tool, key)
    for (const value of list ?? [termValue(tool, key)]) {
      if (value === null) {
        continue
      }
      counts.set(value, (counts.get(value) ?? 0) + 1)
    }
  }
  return counts
}

/**
 * How many narrowings are set, for the button that clears them.
 *
 * One per axis rather than one per value: a vendor filter holding three brands
 * is one question somebody asked, and the button beside the table says how many
 * questions are narrowing the list — including the ones asked in a column
 * header, which is where a filter on a hidden column would otherwise be
 * invisible.
 */
export const countQuery = (query: ToolQuery): number =>
  (query.text.trim() === '' ? 0 : 1) +
  Object.values(query.terms).filter((values) => values.length > 0).length +
  Object.values(query.ranges).filter((bound) => bound.min !== undefined || bound.max !== undefined)
    .length

const RANGE_PARAM = /^(min|max)\.(.+)$/

/**
 * Read a selection out of a URL. Anything unparseable is dropped, not guessed at.
 *
 * `axes` is the set of filter keys this page actually has. **Pass it whenever
 * the URL carries anything else**: the part page's own `?job=` is not a filter,
 * and reading it as one asks for tools whose `job` equals a job id — which no
 * tool states, so every tool is excluded and the list goes silently empty.
 * Without `axes` every parameter is taken as a filter, which is right for a URL
 * that holds nothing else.
 */
export const queryFromSearch = (search: URLSearchParams, axes?: Iterable<string>): ToolQuery => {
  const known = axes === undefined ? null : new Set(axes)
  const terms: Record<string, Array<string>> = {}
  const ranges: Record<string, { min?: number; max?: number }> = {}

  for (const [name, value] of search) {
    if (name === 'q') {
      continue
    }
    const bound = RANGE_PARAM.exec(name)
    if (bound) {
      const key = bound[2] as string
      if (known && !known.has(key)) {
        continue
      }
      const parsed = Number(value)
      if (!Number.isFinite(parsed)) {
        continue
      }
      ranges[key] = { ...ranges[key], [bound[1] as 'max' | 'min']: parsed }
      continue
    }
    if (value === '' || (known && !known.has(name))) {
      continue
    }
    ;(terms[name] ??= []).push(value)
  }

  return { text: search.get('q') ?? '', terms, ranges }
}

/** Write a selection back into a URL, leaving out everything unconstrained. */
export const searchFromQuery = (query: ToolQuery): URLSearchParams => {
  const search = new URLSearchParams()
  if (query.text.trim() !== '') {
    search.set('q', query.text.trim())
  }
  for (const [key, values] of Object.entries(query.terms)) {
    // **In the order they are held, never sorted.** The order of a term's
    // values is its priority — `cycleTerm` is how somebody sets it and
    // `prioritise` is what reads it — so sorting here quietly threw away a
    // promotion on the next render. Worse, it made a suggestion come back
    // from the URL unequal to the one that was written, so `applySuggestions`
    // read the last feature's own filters as somebody's answer and kept them
    // forever (Paul, 2026-08-30: "filters from previously selected features
    // are maintained").
    for (const value of values) {
      search.append(key, value)
    }
  }
  for (const [key, bound] of Object.entries(query.ranges)) {
    if (bound.min !== undefined) {
      search.set(`min.${key}`, String(bound.min))
    }
    if (bound.max !== undefined) {
      search.set(`max.${key}`, String(bound.max))
    }
  }
  return search
}

/** Add or remove one value of a discrete axis, leaving the rest of the selection alone. */
export const toggleTerm = (query: ToolQuery, key: string, value: string): ToolQuery => {
  const current = query.terms[key] ?? []
  const next = current.includes(value)
    ? current.filter((each) => each !== value)
    : [...current, value]
  const terms = { ...query.terms }
  if (next.length === 0) {
    delete terms[key]
  } else {
    terms[key] = next
  }
  return { ...query, terms }
}

/**
 * The filters written back into a URL that carries other things.
 *
 * **A page's URL is not only its filters.** The part page's own `?job=` lives
 * there too, and replacing the whole query string with `searchFromQuery` threw
 * it away — the next render had a part id and no job, and said so. So the
 * filter keys are replaced and everything else is left exactly as it was.
 *
 * `axes` names what counts as a filter here, the same list `queryFromSearch`
 * reads with, so the two cannot disagree about which half is which.
 */
export const searchWithQuery = (
  current: URLSearchParams,
  query: ToolQuery,
  axes: Iterable<string>,
): URLSearchParams => {
  const filters = new Set(axes)
  const next = new URLSearchParams()

  for (const [name, value] of current) {
    const bound = RANGE_PARAM.exec(name)
    const key = bound ? bound[2] : name
    if (name === 'q' || (key !== undefined && filters.has(key))) {
      continue
    }
    next.append(name, value)
  }

  for (const [name, value] of searchFromQuery(query)) {
    next.append(name, value)
  }

  return next
}

/**
 * A press on a tile walks its priority: off → first free rank → one later → … → off.
 *
 * The list *is* the priority — position one is what the tool list is sorted to
 * first — so a value not in the list is appended, one in the middle moves one
 * place later, and the last one is taken out. Pressing the same tile again
 * and again reads 1, 2, 3, off, 1, 2, …, which is what a badge on the tile
 * shows.
 */
export const cycleTerm = (query: ToolQuery, key: string, value: string): ToolQuery => {
  const current = query.terms[key] ?? []
  const at = current.indexOf(value)
  let next: Array<string>
  if (at === -1) {
    next = [...current, value]
  } else if (at === current.length - 1) {
    next = current.filter((each) => each !== value)
  } else {
    next = [...current]
    next[at] = current[at + 1]!
    next[at + 1] = value
  }
  const terms = { ...query.terms }
  if (next.length === 0) {
    delete terms[key]
  } else {
    terms[key] = next
  }
  return { ...query, terms }
}

const rankIn = (list: ReadonlyArray<string>, value: string): number => {
  const at = list.indexOf(value)
  return at === -1 ? Number.MAX_SAFE_INTEGER : at
}

/**
 * The list in the order the chosen tool types and brands ask for.
 *
 * Tool type first, brand within it, and the order the tools already had
 * within that — a stable sort, so what the preferences ranked stays ranked
 * inside each group. With nothing to order by, the list is left as it was.
 */
export const prioritise = (
  tools: ReadonlyArray<CatalogTool>,
  query: ToolQuery,
): Array<CatalogTool> => {
  const forms = query.terms.form ?? []
  const brands = query.terms.brand ?? []
  if (forms.length < 2 && brands.length < 2) {
    return [...tools]
  }
  return [...tools].sort(
    (a, b) =>
      rankIn(forms, a.form) - rankIn(forms, b.form) ||
      rankIn(brands, a.brand) - rankIn(brands, b.brand),
  )
}

/**
 * The axes whose options are narrowed by the rest of the query.
 *
 * The term axes that are properties of a tool, which is what a facet count can
 * be measured over. The holding axes — a spindle taper, a collet series — are
 * properties of the crib and are counted elsewhere (Paul, 2026-09-01).
 *
 * Here rather than beside the panel that draws them because the **matcher**
 * has to know them too: a facet count with a feature on screen is measured
 * over a pool judged without these terms, and `shared/` may not import
 * `components/`.
 */
export const FACET_AXES: ReadonlyArray<string> = [
  'brand',
  // The two phrases this catalog builds rather than facets a vendor publishes:
  // the type with its shank in it, and the family with its product line.
  'type',
  'family',
  'materialGroups',
  'NOF',
]

/** Whether any facet axis is narrowing, which is when a count needs widening. */
export const facetsNarrowing = (query: ToolQuery): boolean =>
  FACET_AXES.some((axis) => (query.terms[axis]?.length ?? 0) > 0)

/** The same query with every facet axis taken out — the pool a count is measured over. */
export const withoutFacets = (query: ToolQuery): ToolQuery => {
  const terms = { ...query.terms }
  for (const axis of FACET_AXES) {
    delete terms[axis]
  }
  return { ...query, terms }
}

/**
 * The same query with one axis taken out.
 *
 * What a facet count has to be measured against: "how many Harvey tools are
 * there" is a question about every filter **except** the vendor, or choosing
 * one vendor would report every other as zero and there would be no way to add
 * a second.
 */
export const withoutTerm = (query: ToolQuery, key: string): ToolQuery => {
  const terms = { ...query.terms }
  delete terms[key]
  return { ...query, terms }
}

/**
 * What each axis would leave, counted against every filter but its own.
 *
 * **This is what makes the panel narrow itself** (Paul, 2026-09-01): with a
 * vendor chosen, the family axis counts only that vendor's families and the
 * ones at zero are not offered; with a type chosen, only the families that
 * hold it. The vendor axis itself still counts every vendor, so a second one
 * can still be added.
 */
/**
 * What an axis offers while it is the axis being narrowed.
 *
 * **A second vendor has to stay reachable** (Paul, 2026-09-08: "all options
 * other than the one that was enabled are hidden. I should be able to
 * multi-select options while creating an assembly for a feature").
 *
 * With no feature on the screen the counts are measured over the whole catalog
 * minus the axis's own term, so every vendor is still on the list and
 * `countsByAxis` is the whole answer. With a feature they are measured over the
 * tools the matcher answered with — and the matcher only judges what the terms
 * already admit (`shared/catalog-matcher.ts` says why: judging the whole
 * catalog per demand cost 340 ms against 65). So the moment one vendor is
 * ticked, no other vendor's tools have been judged for that feature and the
 * axis can only report itself.
 *
 * The way out is memory rather than more work. An axis with nothing chosen is
 * counted fresh; while it *is* chosen it keeps offering the list it last had —
 * this feature's own values, from the last moment the question could be
 * answered — with a fresh count wherever one can still be measured. Clearing
 * the axis asks the question again.
 *
 * **And a chosen value is always offered**, whatever the memory holds. It is
 * the filter panel's own third rule — a value narrowing the list with no
 * control to lift it is a filter nobody can find their way out of — and it
 * became reachable when the `…` row started offering values the list had never
 * held: one ticked from behind it was in no memory of this axis, so the tick
 * disappeared the moment it was made.
 */
export const stillOffered = (
  counts: ReadonlyMap<string, number>,
  chosen: ReadonlyArray<string>,
  before: ReadonlyMap<string, number> | undefined,
): ReadonlyMap<string, number> => {
  if (chosen.length === 0 || (before === undefined && chosen.every((value) => counts.has(value)))) {
    return counts
  }
  const offered = new Map(
    before === undefined
      ? counts
      : [...before].map(([value, count]) => [value, counts.get(value) ?? count]),
  )
  for (const value of chosen) {
    if (!offered.has(value)) {
      offered.set(value, counts.get(value) ?? 0)
    }
  }
  return offered
}

export const countsByAxis = (
  tools: ReadonlyArray<CatalogTool>,
  query: ToolQuery,
  keys: ReadonlyArray<string>,
): Map<string, ReadonlyMap<string, number>> => {
  const counts = new Map<string, ReadonlyMap<string, number>>()
  for (const key of keys) {
    counts.set(key, countBy(filterTools(tools, withoutTerm(query, key)), key))
  }
  return counts
}
