/**
 * How wide a column is, and why the list always ends at the edge of its box.
 *
 * **The columns divide the room they have; they do not ask for room and
 * overflow it** (Paul, 2026-09-11). What a list used to be handed was
 * `minmax(10rem, 1fr)` — a floor in rem and an equal share of whatever was
 * left — under a table forced to `min-width: max-content`. Under max-content
 * sizing every `1fr` track resolves to the *widest* floor it was handed, so the
 * thirteen-column tool list opened 2120 px wide inside a 1169 px panel, with
 * every column 192 px whatever the map beside it said. Measured on 2026-09-11.
 * The list then snapped to fit the moment somebody touched a resize handle,
 * because the kit's resizer rewrites the tracks as percentages of the box —
 * which is the layout it should have opened at.
 *
 * So the rem in a width map is read as a **weight** rather than as a floor:
 * `minmax(0, 10fr)` next to `minmax(0, 6fr)` is a catalogue number ten parts
 * wide beside a flute count of six, out of whatever the panel has. Two things
 * follow from the zero floor, and both are wanted:
 *
 * - the tracks always sum to the width of the box, at any size, with no
 *   horizontal scrollbar and no gutter reserved for one; and
 * - the proportions in the map finally do something, where before only the
 *   largest entry in it did.
 *
 * A cell that runs out of room truncates — the kit's cells are `overflow:
 * hidden` with an ellipsis, and the words a column can lose are on rows that
 * carry a `title`.
 */

/** The parts a column with nothing said about it asks for. */
export const DEFAULT_WEIGHT = 6

/** What a column with nothing said about it asks for. */
export const DEFAULT_COLUMN_WIDTH = `${DEFAULT_WEIGHT}rem`

/**
 * The parts of the box a column asks for.
 *
 * Anything that is not a plain rem length weighs what an unstated column does:
 * a width map is read by this module alone, so a `px` or a `%` in one would be
 * a silent third sizing rule rather than something to honour.
 */
export const columnWeight = (width: string): number => {
  const rem = /^\s*([\d.]+)rem\s*$/.exec(width)
  const stated = rem === null ? Number.NaN : Number(rem[1])
  return Number.isFinite(stated) && stated > 0 ? stated : DEFAULT_WEIGHT
}

/** The grid track a column asks for: its share of the box, never more than it. */
export const fillingWidth = (width: string): string => `minmax(0, ${columnWeight(width)}fr)`

/**
 * The id the kit stores this list's dragged column widths under.
 *
 * **The column set is the id** (Paul, 2026-09-11: "the column widths should be
 * stored in local storage but invalidate the old stores/ids every time a column
 * is added or hidden. The table id controls the local storage so the id needs
 * to be changed to be the cache breaker").
 *
 * What `@toolpath/ui`'s table writes under `table-<id>` is a grid track list —
 * eleven percentages in the order the columns happened to be in when somebody
 * let go of the handle. It is **positional**, and it says nothing about which
 * column each track was for, so a stored answer means something different the
 * moment the columns change: hide one and every width after it lands on its
 * neighbour. The kit guards the one case it can see, a change in the *count*,
 * and is blind to a swap or a reorder, which leave the count alone. Widths were
 * taken out of storage entirely for that reason earlier the same day.
 *
 * Naming the id after the columns is what puts them back safely: one stored
 * layout per column set, found again when that set comes back, and never
 * applied to any other. The **order** is in it too — a reorder is a
 * rearrangement of the very positions the track list is indexed by.
 *
 * `shared/column-layout.ts` is the other half of this: which columns are shown
 * and in what order is stored by *code*, so it survives the column set moving
 * rather than being invalidated by it. The difference is the whole reason these
 * are two modules.
 */
export const widthId = (list: string, shown: ReadonlyArray<string>): string =>
  [list, ...shown].join('.')

/** What the kit prefixes its own storage keys with — `use-column-layout.ts` in `@toolpath/ui`. */
const KIT_PREFIX = 'table-'

/**
 * Every stored width, dropped.
 *
 * **Showing or hiding a column puts every list back on its default widths**
 * (Paul, 2026-09-11: "on changing columns shown/hidden delete all localstorage
 * keys saving column widths, they should all be invalidated. I don't want
 * columns to change size as I show and hide columns. Go back to the default
 * sizes."). A stored answer is only about the set it was dragged on, and a
 * column set that has been edited is not that set — so the honest thing is a
 * clean sheet rather than an old answer resurfacing under some id somebody
 * happens to arrive back at.
 *
 * **Called from the press, not from the id.** A sweep hung on the id changing
 * was built first and deleted the store the list was about to settle on: the
 * tool list passes through two column sets on every load — the defaults, and
 * then the set `shared/auto-columns.ts` settles on once it can see what is on
 * the list, corner radius coming on for end mills a tick after the tools
 * arrive. The id at mount is not the id a drag was stored under. A press in the
 * column picker is a decision; that first change is the list finishing loading,
 * and only one of the two should throw a width away. `shared/column-layout.ts`
 * is where the press lives.
 *
 * **Cleared, not kept empty.** The kit writes its current layout back on any
 * mouse-up once it has one in hand, so a key for the columns now on screen
 * reappears within a click or two. What it holds then is the tracks the list
 * computed for itself, which is exactly what going back to the default sizes
 * means — what is gone is the old answer, not the file.
 */
export const forgetStoredWidths = (
  storage: Pick<Storage, 'length' | 'key' | 'removeItem'> | null,
): void => {
  if (storage === null) {
    return
  }
  const stale: Array<string> = []
  for (let at = 0; at < storage.length; at++) {
    const key = storage.key(at)
    if (key !== null && key.startsWith(KIT_PREFIX)) {
      stale.push(key)
    }
  }
  stale.forEach((key) => storage.removeItem(key))
}
