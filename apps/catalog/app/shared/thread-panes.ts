import type { CatalogTool } from '@toolpath/catalog-data'

/**
 * The two tools a threaded hole takes, for the panel that reads them.
 *
 * **A threaded hole is a drill and a tap** (Paul, 2026-09-01: "it should open
 * drill and tap tabs in the right hand panel when working with a threaded
 * feature"). They are chosen on different numbers, listed separately, and kept
 * separately — so the panel is two tabs rather than whichever list was clicked
 * last, and each tab shows the tool somebody picked in that list or the best
 * one it offers.
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

/**
 * Which tab a tool belongs to, for a click in either list.
 *
 * A tap is a tap by its form; everything else in these two lists is what makes
 * the hole. The space in `'tap '` is deliberate — `tapered mill` is a milling
 * cutter, and `startsWith('tap')` took it for a tap (2026-09-02).
 */
export const paneOf = (tool: CatalogTool): 'drill' | 'tap' =>
  tool.form.startsWith('tap ') ? 'tap' : 'drill'
