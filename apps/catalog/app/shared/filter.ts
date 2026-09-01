import { shankOf, type CatalogTool } from '@toolpath/catalog-data'

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
  [tool.catalogNumber, tool.materialNumber ?? '', tool.brand, tool.familyId].join(' ').toLowerCase()

/**
 * The axes where a tool carries several values, and matching means "any of".
 *
 * A tool indexed for steel and stainless answers a question about either, so
 * an intersection here would be wrong: nobody is asking for a tool that is
 * *only* for steel.
 */
const listValues = (tool: CatalogTool, key: string): ReadonlyArray<string> | null =>
  key === 'materialGroups' ? tool.materialGroups : null

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
const matchesRanges = (tool: CatalogTool, ranges: ToolQuery['ranges']): boolean =>
  Object.entries(ranges).every(([key, bound]) => {
    if (bound.min === undefined && bound.max === undefined) {
      return true
    }
    const value = tool.geometry[key]
    if (value === undefined) {
      return false
    }
    if (bound.min !== undefined && value < bound.min) {
      return false
    }
    if (bound.max !== undefined && value > bound.max) {
      return false
    }
    return true
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

export const isEmptyQuery = (query: ToolQuery): boolean =>
  query.text.trim() === '' &&
  Object.values(query.terms).every((values) => values.length === 0) &&
  Object.values(query.ranges).every((bound) => bound.min === undefined && bound.max === undefined)

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
