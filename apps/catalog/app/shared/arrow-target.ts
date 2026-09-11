/**
 * Where an arrow press goes while a box is open over the part.
 *
 * **Nowhere near the features.** This application's readings are chosen by
 * clicking an arrow on the part or by naming one in the list, and never walked
 * with the keyboard (Paul, 2026-09-11: "we should disable the arrow navigation
 * for features in this app — it only happens by clicking the arrow or through
 * the drop down list, never browsed through the keyboard arrows"). The page
 * used to spend every press on that walk, so choosing a feature and reaching
 * for the arrows moved the reading behind the open box rather than the tools
 * inside it.
 *
 * So the arrows belong to the **list** — the tools, or the rack of holders or
 * drawer of collets where a slot has one open — and the page's whole job is to
 * put the list in a state where `@toolpath/ui`'s table will take the press
 * itself. The focus goes there the moment something is selected
 * (`routes/part.tsx`), which leaves this as what a press has to repair when it
 * did not.
 *
 * It is a rule of its own rather than a condition inline in the handler for the
 * reason `use-escape.ts` and `part-chrome.ts` are: which layer a press reaches
 * is the kind of sentence somebody is wrong about, and it is worth a test.
 */

/** The list the press is for, or nothing where the page keeps its hands off. */
export type ArrowTarget = 'list' | null

export interface ArrowState {
  /** A feature, a group or a tool assembly is open, so there is a list under it. */
  readonly boxOpen: boolean
  /**
   * The press landed inside a list already.
   *
   * The kit's table runs its own navigation off the focus inside it, so the
   * page standing down *is* the handoff — but only once that table has a row to
   * move from, which is the other half below.
   */
  readonly inList: boolean
  /**
   * The list is reading a row.
   *
   * The kit moves a cursor it only has once a row is selected, so a list
   * reading nothing takes the focus and then ignores every press after it. A
   * press in that state is the page's to answer, focus or no focus.
   */
  readonly readingARow: boolean
}

export const arrowTarget = ({ boxOpen, inList, readingARow }: ArrowState): ArrowTarget =>
  !boxOpen || (inList && readingARow) ? null : 'list'

/** The tool list, by the attribute `PartToolTable` marks itself with. */
export const TOOL_LIST = '[data-part-tool-table]'

/** A rack of holders or a drawer of collets, the same way. */
export const COMPONENT_LIST = '[data-component-table]'

/** Whether a press landed inside either of them. */
export const insideList = (target: EventTarget | null): boolean =>
  (target as HTMLElement | null)?.closest?.(`${TOOL_LIST}, ${COMPONENT_LIST}`) != null

/**
 * Puts the focus in the list on screen, and says whether there was one.
 *
 * The kit's own scroll container is what holds it; the wrapper around that is
 * this application's and takes none. Without `preventScroll` the panel jumps
 * to wherever the list was last left, which is not what selecting a feature
 * asked for.
 */
export const focusList = (selector: string): boolean => {
  const container = document
    .querySelector<HTMLElement>(selector)
    ?.querySelector<HTMLElement>('[tabindex="0"]')
  if (container === null || container === undefined) {
    return false
  }
  container.focus({ preventScroll: true })
  return true
}

/**
 * Lands on the list's first row, so there is a cursor to move from.
 *
 * Clicked rather than chosen out of the data the page handed over, because the
 * order on screen is the table's own once somebody has sorted it.
 */
export const readFirstRow = (selector: string): void => {
  document.querySelector<HTMLElement>(`${selector} [data-row-index]`)?.click()
}

/** Hands one press to the list: the focus, and a row to move from. */
export const handToList = (selector: string, readingARow: boolean): boolean => {
  if (!focusList(selector)) {
    return false
  }
  if (!readingARow) {
    readFirstRow(selector)
  }
  return true
}
