import { canHold, gripRanges, type CatalogTool, type GripRanges } from '@toolpath/catalog-data'
import type { ToolQuery } from './filter'
import { collets, holders } from './catalog'

/**
 * Holding as a filter: *what can this crib actually put in a spindle?*
 *
 * A tool that clears every geometric rule is still the wrong answer if nothing
 * on the shelf grips its shank. That question is not a property of a tool, so
 * it cannot go through {@link filterTools} — which reads tool fields and
 * excludes anything it cannot find, the same way `?job=` once emptied the whole
 * list. It is asked here instead, against the same query object, and the two
 * results are intersected.
 *
 * The keys still live in `query.terms`, so a holding choice is in the URL, is
 * cleared by Clear, and is kept by a saved filter like every other filter.
 */

/** Filter keys this module owns, which {@link filterTools} must not see. */
export const HOLDING_AXES = ['taper', 'colletSeries'] as const

/**
 * Filters that are the **catalog's own reading**, not a vendor's facet.
 *
 * The dataset's facets are what vendors publish — form, brand, the geometry
 * codes. `shank` is this catalog's reading of a shoulder (`shankOf`), so it is
 * on no facet list, and a URL is read against the axes a page declares: an
 * axis nobody declared is dropped as somebody else's parameter. That is why
 * picking Reduced neither stuck to the chip nor narrowed the list — the term
 * never survived the round trip through the URL (Paul, 2026-08-31).
 */
export const DERIVED_AXES = ['shank'] as const

export interface Holding {
  readonly taper: string | null
  readonly colletSeries: string | null
}

/** The query split in two: what a tool answers, and what the crib answers. */
export const splitHolding = (query: ToolQuery): { tools: ToolQuery; holding: Holding } => {
  const terms = { ...query.terms }
  for (const axis of HOLDING_AXES) {
    delete terms[axis]
  }
  return {
    tools: { ...query, terms },
    holding: {
      taper: query.terms.taper?.[0] ?? null,
      colletSeries: query.terms.colletSeries?.[0] ?? null,
    },
  }
}

/**
 * The grip set, worked out once per question rather than once per tool.
 *
 * Small and bounded — one entry per combination somebody has actually asked —
 * and every entry is derived from the bundled toolholding, which does not
 * change while the page is open.
 */
const cache = new Map<string, GripRanges>()

const rangesFor = (holding: Holding): GripRanges => {
  const key = `${holding.taper ?? ''}|${holding.colletSeries ?? ''}`
  const known = cache.get(key)
  if (known) {
    return known
  }
  const ranges = gripRanges(holders, collets, holding)
  cache.set(key, ranges)
  return ranges
}

/**
 * Tools this crib can hold, given what was asked of it.
 *
 * Nothing asked means nothing filtered — **not** "every tool the crib happens
 * to hold". A dataset built before toolholding was ingested holds nothing at
 * all, and silently emptying the tool list because of that would say no tool
 * cuts the part.
 */
export const holdableTools = (
  tools: ReadonlyArray<CatalogTool>,
  holding: Holding,
): ReadonlyArray<CatalogTool> => {
  if (holding.taper === null && holding.colletSeries === null) {
    return tools
  }
  if (holders.length === 0) {
    return tools
  }

  const ranges = rangesFor(holding)
  return tools.filter((tool) => canHold(ranges, tool))
}

/** Every spindle interface this catalog holds a holder for. */
export const tapers: ReadonlyArray<string> = [...new Set(holders.map((each) => each.taper))].sort(
  (a, b) => a.localeCompare(b, 'en', { numeric: true }),
)

/** Every collet series this catalog holds collets for. */
export const colletSeries: ReadonlyArray<string> = [
  ...new Set(collets.map((each) => each.series)),
].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
