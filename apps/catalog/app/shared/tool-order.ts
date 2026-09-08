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
