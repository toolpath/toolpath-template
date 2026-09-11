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
