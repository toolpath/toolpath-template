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

/**
 * The row cap, applied so that neither kind of row can crowd the other out.
 *
 * **A cap over a list two sources fill silently empties the shorter one**
 * (Paul, 2026-09-09: a ⌀0.125 in pocket widened to ⌀0.5 in "doesn't obey my new
 * entry and show the tools … sometimes it stays at 0.125"). What a forgiven
 * column offers goes *under* what the rules kept — `part.tsx` § `listed` says
 * why — and on the scraped catalog that day the rules kept 2,197 tools against
 * a cap of 2,000. Every override row was past the end of the slice, so widening
 * the filter changed nothing on screen at all.
 *
 * So the reserved rows get a share of the cap rather than the leftovers: up to
 * half of it, or all of them where there are fewer than that. Order is
 * untouched — this only decides which rows the cap drops — and where the whole
 * list fits, or nothing is reserved, it is the plain slice it always was.
 *
 * A share rather than the whole cap because both halves are answers: the tools
 * that fit are still the ones to reach for first, and a widened bound is meant
 * to widen the list rather than replace it.
 */
export const capRows = (
  tools: ReadonlyArray<CatalogTool>,
  reserved: ReadonlySet<string>,
  cap: number,
): ReadonlyArray<CatalogTool> => {
  if (tools.length <= cap || reserved.size === 0) {
    return tools.slice(0, Math.max(0, cap))
  }
  let held = Math.min(
    tools.filter((each) => reserved.has(each.guid)).length,
    Math.floor(Math.max(0, cap) / 2),
  )
  let room = Math.max(0, cap) - held
  return tools.filter((each) => {
    if (reserved.has(each.guid)) {
      if (held === 0) {
        return false
      }
      held -= 1
      return true
    }
    if (room === 0) {
      return false
    }
    room -= 1
    return true
  })
}
