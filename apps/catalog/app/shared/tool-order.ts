import type { CatalogTool } from '@toolpath/catalog-data'

/**
 * The tools already kept for a feature, first.
 *
 * Reading a feature from its card on the part is somebody returning to a
 * decision, and what they decided should be the first thing on the list rather
 * than somewhere down it (Paul, 2026-08-31). Everything else keeps the order
 * it arrived in — the sheet's ranking, or whatever column the list is sorted
 * by — so this is a partition, not a sort.
 */
export const keptFirst = (
  tools: ReadonlyArray<CatalogTool>,
  kept: ReadonlySet<string>,
): ReadonlyArray<CatalogTool> => {
  if (kept.size === 0 || !tools.some((each) => kept.has(each.guid))) {
    return tools
  }
  return [
    ...tools.filter((each) => kept.has(each.guid)),
    ...tools.filter((each) => !kept.has(each.guid)),
  ]
}
