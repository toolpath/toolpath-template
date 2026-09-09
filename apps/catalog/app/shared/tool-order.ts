import type { CatalogTool } from '@toolpath/catalog-data'

/**
 * The rows already decided on, first.
 *
 * Reading a feature from its card on the part is somebody returning to a
 * decision, and what they decided should be the first thing on the list rather
 * than somewhere down it (Paul, 2026-08-31). Everything else keeps the order it
 * arrived in — the sheet's ranking, or whatever column the list is sorted by —
 * so this is a partition, not a sort.
 *
 * **It is the same rule for a holder and a collet** (Paul, 2026-09-07: "can we
 * float confirmed tool assembly components to the top of the table lists?").
 * The tool list had it and the two racks did not, so the holder a feature is
 * already ordered with sat wherever the crib's own order put it, wearing a badge
 * nobody scrolled to.
 *
 * The array itself comes back when nothing matches: a partition that copies a
 * list of two hundred to change nothing is work every keystroke in the search
 * box pays for.
 */
export const firstBy = <Row>(
  rows: ReadonlyArray<Row>,
  isFirst: (row: Row) => boolean,
): ReadonlyArray<Row> => {
  if (!rows.some(isFirst)) {
    return rows
  }
  return [...rows.filter(isFirst), ...rows.filter((each) => !isFirst(each))]
}

/** {@link firstBy} for the tools a feature already keeps, by guid. */
export const keptFirst = (
  tools: ReadonlyArray<CatalogTool>,
  kept: ReadonlySet<string>,
): ReadonlyArray<CatalogTool> =>
  kept.size === 0 ? tools : firstBy(tools, (each) => kept.has(each.guid))

/**
 * One row per tool, in the order the rows arrived.
 *
 * **Three sources fill the list and two of them come from the same set.** The
 * rows that fit are disjoint from the ones the rules removed, so the near-miss
 * fill was safe beside them — but what a forgiven column offers is drawn from
 * the removed set as well, and a tool that is both the nearest miss and inside
 * the widened bound was drawn twice (2026-09-09, a duplicated `TDMX0500`).
 *
 * First wins, so the earlier source keeps its place: what fits leads the fill,
 * and the fill is what stands in for it.
 */
export const oneEach = (tools: ReadonlyArray<CatalogTool>): Array<CatalogTool> => {
  const seen = new Set<string>()
  return tools.filter((tool) => {
    if (seen.has(tool.guid)) {
      return false
    }
    seen.add(tool.guid)
    return true
  })
}
