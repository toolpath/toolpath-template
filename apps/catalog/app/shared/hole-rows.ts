import type { GroupChoice, HolePlanRow } from './hole-plan'
import { threadAtReading, type HoleMode, type ThreadRead } from './threads'

/**
 * Sorting and filtering the all-holes table, as arithmetic rather than as
 * table code.
 *
 * **Every column, both ways** (Paul, 2026-09-01). A part with forty sizes of
 * hole is read by narrowing — the deep ones, the tapped ones, the ones nothing
 * fits — and a table that can only be read top to bottom makes somebody scroll
 * for the row they already know they want.
 *
 * The tool columns sort and filter on the **row's own best** drill and tap,
 * which is what the cell shows until somebody picks otherwise. Sorting on a
 * choice would reorder the table underneath the person making it.
 */

/**
 * A band on a number column.
 *
 * Declared here rather than imported from the filter control: `shared/` may
 * not reach into `components/`, and the shape is two optional numbers. The
 * control's own `Bound` is structurally this.
 */
export interface Band {
  readonly min?: number
  readonly max?: number
}

/** What a column sorts on, and which way. */
export interface HoleSort {
  readonly code: string
  readonly ascending: boolean
}

/** What each column is narrowed by: a number band, or a set of names. */
export interface HoleFilters {
  readonly count?: Band
  readonly diameter?: Band
  readonly depth?: Band
  /** Thread names, or `plain` for the holes nobody has threaded. */
  readonly thread?: ReadonlyArray<string>
  /** `drill`, `interpolated`, or `none`. */
  readonly drill?: ReadonlyArray<string>
  /** `tap`, `none`, or `plain` for a hole with no thread to tap. */
  readonly tap?: ReadonlyArray<string>
}

export const NO_HOLE_FILTERS: HoleFilters = {}

/** The state of a row's drill, as the column filters on it. */
export const drillState = (row: HolePlanRow): 'drill' | 'interpolated' | 'none' => {
  if (row.drills.length === 0) {
    return 'none'
  }
  return row.interpolated ? 'interpolated' : 'drill'
}

/** The state of a row's tap: a plain hole has none to want. */
export const tapState = (row: HolePlanRow): 'tap' | 'none' | 'plain' => {
  if (row.thread === null) {
    return 'plain'
  }
  return row.makers.length > 0 ? 'tap' : 'none'
}

/** What a row's thread column filters on. */
export const threadState = (row: HolePlanRow): string => row.thread?.name ?? 'plain'

const within = (value: number, bound: Band | undefined): boolean => {
  if (bound === undefined) {
    return true
  }
  if (bound.min !== undefined && value < bound.min) {
    return false
  }
  return !(bound.max !== undefined && value > bound.max)
}

const kept = (value: string, chosen: ReadonlyArray<string> | undefined): boolean =>
  chosen === undefined || chosen.length === 0 || chosen.includes(value)

export const filterHoleRows = (
  rows: ReadonlyArray<HolePlanRow>,
  filters: HoleFilters,
): Array<HolePlanRow> =>
  rows.filter(
    (row) =>
      within(row.group.features.length, filters.count) &&
      within(row.group.diameter, filters.diameter) &&
      within(row.group.depth, filters.depth) &&
      kept(threadState(row), filters.thread) &&
      kept(drillState(row), filters.drill) &&
      kept(tapState(row), filters.tap),
  )

/** What a column reads off a row, for the sort to compare. */
const readingOf = (row: HolePlanRow, code: string): number | string => {
  switch (code) {
    case 'count':
      return row.group.features.length
    case 'diameter':
      return row.group.diameter
    case 'depth':
      return row.group.depth
    case 'thread':
      return row.thread?.name ?? ''
    case 'drill':
      return row.drills[0]?.tool.catalogNumber ?? ''
    case 'tap':
      return row.makers[0]?.catalogNumber ?? ''
    default:
      return ''
  }
}

/**
 * The rows in the order a column asks for.
 *
 * A row with nothing in the column sorts last whichever way the column runs:
 * "no tap" is not a small tap, and floating it to the top of an ascending sort
 * would bury the rows the sort was for.
 */
export const sortHoleRows = (
  rows: ReadonlyArray<HolePlanRow>,
  sort: HoleSort | null,
): Array<HolePlanRow> => {
  if (sort === null) {
    return [...rows]
  }
  return [...rows].sort((a, b) => {
    const left = readingOf(a, sort.code)
    const right = readingOf(b, sort.code)
    if (typeof left === 'string' || typeof right === 'string') {
      const one = String(left)
      const two = String(right)
      if (one === '' || two === '') {
        return one === two ? 0 : one === '' ? 1 : -1
      }
      const by = one.localeCompare(two, 'en', { numeric: true })
      return sort.ascending ? by : -by
    }
    return sort.ascending ? left - right : right - left
  })
}

/** Ascending, then descending, then back to the table's own order. */
export const nextHoleSort = (sort: HoleSort | null, code: string): HoleSort | null => {
  if (sort?.code !== code) {
    return { code, ascending: true }
  }
  return sort.ascending ? { code, ascending: false } : null
}

/** The values a term column offers, with how many rows each would leave. */
export const holeFacet = (
  rows: ReadonlyArray<HolePlanRow>,
  code: 'thread' | 'drill' | 'tap',
): Array<{ value: string; label: string; count: number }> => {
  const read = code === 'thread' ? threadState : code === 'drill' ? drillState : tapState
  // The thread column's own values are thread names, which are their own labels.
  const counts = new Map<string, number>()
  for (const row of rows) {
    const value = read(row)
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  const LABELS: Readonly<Record<string, string>> = {
    plain: 'No thread',
    drill: 'A drill',
    interpolated: 'A mill, interpolated',
    none: 'Nothing fits',
    tap: 'A tap',
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: LABELS[value] ?? value, count }))
    .sort((a, b) => a.label.localeCompare(b.label, 'en', { numeric: true }))
}

/**
 * Which hole of a group a zoom frames, and which the next press will.
 *
 * The viewer frames one feature at a time, so eight ⌀5 holes are walked
 * rather than framed together: press, see the first; press again, see the
 * second; past the last it comes round (Paul, 2026-09-01). `at` is 1-based
 * because it is also what the button says.
 */
export const stepZoom = (
  holes: number,
  at: number | undefined,
): { readonly index: number; readonly next: number } => {
  if (holes <= 0) {
    return { index: 0, next: 1 }
  }
  const index = ((((at ?? 1) - 1) % holes) + holes) % holes
  return { index, next: ((index + 1) % holes) + 1 }
}

/**
 * Every size of hole that reads as a thread at one stated diameter, with the
 * choice to write into it.
 *
 * **A shop knows how its own CAD draws a tapped hole.** Saying so once — "our
 * holes are modelled at the tap drill, and we cut-tap them" — is the whole of
 * this job for most parts, and doing it row by row is forty presses somebody
 * has to get right forty times (Paul, 2026-09-01).
 *
 * Every matching row, whatever it says now: this is a button somebody pressed,
 * and a bulk apply that skipped the rows already set would be unpredictable —
 * press it twice with two different readings and the second press would do
 * nothing to the rows the first one took.
 */
export const autoThreads = (
  rows: ReadonlyArray<HolePlanRow>,
  read: ThreadRead,
  mode: HoleMode,
): Array<{ readonly key: string; readonly choice: GroupChoice }> =>
  rows.flatMap((row) => {
    const guess = threadAtReading(row.group.diameter, read)
    return guess === null ? [] : [{ key: row.group.key, choice: { mode, spec: guess.spec } }]
  })

/**
 * The size of hole a feature belongs to, by group key.
 *
 * **Both sides count.** A hole open at both ends is one group and two
 * readings, and clicking the far one on the part is still asking about that
 * size — it is the same hole (Paul, 2026-09-01).
 */
export const groupOfFeature = (
  groups: ReadonlyArray<{
    readonly key: string
    readonly features: ReadonlyArray<{ readonly featureTag: string }>
    readonly other: { readonly features: ReadonlyArray<{ readonly featureTag: string }> } | null
  }>,
  featureTag: string | null,
): string | null => {
  if (featureTag === null) {
    return null
  }
  const found = groups.find(
    (group) =>
      group.features.some((each) => each.featureTag === featureTag) ||
      (group.other?.features.some((each) => each.featureTag === featureTag) ?? false),
  )
  return found?.key ?? null
}
