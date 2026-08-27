/**
 * The one place that knows how a list marks its rows for the keyboard.
 *
 * Three data attributes carry state between components that never see each
 * other: a list marks its rows, the page reads the marked row back out of the
 * document to decide what a keystroke acts on, and one row can stand for
 * sixteen readings by writing their tags into an attribute for the page to
 * split apart again.
 *
 * That contract had no type, no single definition and no test. Seven components
 * wrote the attributes by hand and three places read them by hand, so renaming
 * one, or changing how a grouped row says what it stands for, broke keyboard
 * navigation silently — and only a browser test would have noticed.
 *
 * It is still the DOM, and deliberately: what is on screen in document order is
 * what the keyboard should walk, and a list that grows a nested group under one
 * of its rows needs nothing here to keep working. What changes is that the
 * encoding lives in one module with one test, and everything else asks it.
 */

/** Marks one row of a list. Its value is what the row stands for. */
export const ROW = 'data-row'

/**
 * Marks a list the keyboard walks, so a row can find the list it belongs to.
 *
 * Its value names the list — `faces`, `unmapped`, `offer` — which is what lets
 * one page hold several and have each walk on its own.
 */
export const KEYNAV = 'data-keynav'

/**
 * What a row stands for, where that is not one reading.
 *
 * A row for sixteen identical holes **is** sixteen, so a key pressed on it has
 * to be sixteen. The row says so here rather than leaving it to be worked out
 * from the row's own value: the lists group by different rules, and two of them
 * working out the same answer differently is how they came apart before.
 */
export const HOLDS = 'data-holes'

export const ROW_SELECTOR = `[${ROW}]`
export const KEYNAV_SELECTOR = `[${KEYNAV}]`

/** The attributes a row wears. Spread onto the element rather than hand-written. */
export const rowAttributes = (
  /** What this row stands for — a feature tag, a face index, a direction. */
  value: string,
  /**
   * Every reading the row stands for, where it stands for more than one.
   *
   * Left off for an ordinary row: absent and "just this one" are the same
   * answer, and writing a single-entry list would make every reader handle a
   * case that never differs.
   */
  holds?: ReadonlyArray<string>,
): Record<string, string | undefined> => ({
  [ROW]: value,
  [HOLDS]: holds && holds.length > 1 ? holds.join(' ') : undefined,
})

/** The attribute a list the keyboard walks wears. */
export const keynavAttributes = (name: string): Record<string, string> => ({ [KEYNAV]: name })

/** What a marked row stands for, read back off the element. */
export interface RowMeaning {
  /** The row's own value. */
  value: string
  /**
   * Everything it stands for, always at least one entry.
   *
   * A row with no `HOLDS` stands for itself, so this is `[value]` — callers
   * never have to ask which kind of row they have.
   */
  holds: ReadonlyArray<string>
}

export const meaningOf = (row: HTMLElement | null | undefined): RowMeaning | null => {
  const value = row?.getAttribute(ROW)
  if (value === null || value === undefined) return null

  const holds = row?.getAttribute(HOLDS)
  return {
    value,
    holds: holds ? holds.split(' ').filter((tag) => tag.length > 0) : [value],
  }
}

/** The marked row an element sits inside, if any. */
export const rowAt = (element: Element | null | undefined): HTMLElement | null =>
  element?.closest<HTMLElement>(ROW_SELECTOR) ?? null

/** The list the keyboard walks that an element sits inside, if any. */
export const listAt = (element: Element | null | undefined): HTMLElement | null =>
  element?.closest<HTMLElement>(KEYNAV_SELECTOR) ?? null

/** Every marked row of a list, in the order they are on screen. */
export const rowsIn = (container: Element | null | undefined): Array<HTMLElement> =>
  container ? [...container.querySelectorAll<HTMLElement>(ROW_SELECTOR)] : []

/**
 * Where focus is, said as what it is on rather than as an element.
 *
 * `null` where nothing is focused or focus is not on a row — which is a real
 * answer: in by-direction mode a list can hold focus without any row being
 * current.
 */
export const focusedRow = (
  root: Document | null = globalThis.document ?? null,
): RowMeaning | null => meaningOf(rowAt(root?.activeElement))
