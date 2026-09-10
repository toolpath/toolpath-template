import { describe, expect, it } from 'vitest'
import { facets } from 'shared/catalog'
import { DERIVED_AXES, HOLDING_AXES } from 'shared/holding'
import { QUICK_FILTERS } from './filter-panel'

/**
 * **Every filter the rail offers has to survive the URL.**
 *
 * The selection lives in the query string, and `queryFromSearch` reads it
 * against the axes a page declares — anything else in the URL is somebody
 * else's parameter and is dropped. So a filter whose key is on no axis list
 * is a control that does nothing: the chip never stays pressed and the list
 * never narrows, with no error anywhere. That is exactly what the shank
 * filter did, because `shank` is this catalog's own reading rather than a
 * vendor facet and nobody had declared it (Paul, 2026-08-31: "reduced shank
 * doesn't show when I click the filter and doesn't filter the list").
 *
 * This is the check that would have caught it, and catches the next one.
 */
const DECLARED = new Set<string>([
  ...facets.terms.map((axis) => axis.key),
  ...facets.ranges.map((axis) => axis.key),
  ...HOLDING_AXES,
  ...DERIVED_AXES,
  // The part material is the part's, not a filter over the catalog.
  'materialGroup',
])

describe('the axes the filters need', () => {
  it('declares every filter the rail offers', () => {
    const missing = QUICK_FILTERS.filter(
      (filter) => filter.mode !== 'single' && !DECLARED.has(filter.key),
    ).map((filter) => filter.key)

    expect(missing).toEqual([])
  })
})
