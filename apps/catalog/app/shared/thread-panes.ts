import type { CatalogTool } from '@toolpath/catalog-data'

/**
 * The two tools a threaded hole takes, for the panel that reads them.
 *
 * **A threaded hole is a drill and a tap.** They are chosen on different
 * numbers and listed separately — the list has a tab for each (Paul,
 * 2026-09-02, taps first) — and this is what each tab leads with: the tool
 * somebody picked in it, or the best one it offers. The panel on the right
 * then reads whichever of the two is selected.
 *
 * Pure, and here rather than in the route, because "which tool is on which tab"
 * is the whole of the rule and the rest is layout.
 */
export interface ThreadPanes {
  readonly drill: CatalogTool | null
  readonly tap: CatalogTool | null
}

export const threadPanes = (
  drills: ReadonlyArray<CatalogTool>,
  taps: ReadonlyArray<CatalogTool>,
  chosenGuid: string | null,
): ThreadPanes => ({
  drill: drills.find((each) => each.guid === chosenGuid) ?? drills[0] ?? null,
  tap: taps.find((each) => each.guid === chosenGuid) ?? taps[0] ?? null,
})
