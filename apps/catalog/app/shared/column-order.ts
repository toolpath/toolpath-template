/**
 * The order the table's columns are drawn in.
 *
 * A list of codes, held by the page rather than by the table: the control that
 * edits it is the column picker, which sits in the panel's corner, and a table
 * that owned the order could not be reordered from outside it (Paul,
 * 2026-08-31, asking to drag columns into the order a shop reads them in).
 *
 * Everything here is about the codes alone, which is what keeps it testable
 * without a table, a pointer or a drag.
 */

/**
 * The codes in order, with anything the order does not mention on the end.
 *
 * A column added to the catalog after somebody saved an order is a column the
 * order has never heard of; appending it is the only answer that neither
 * drops it nor pretends somebody put it there.
 */
export const orderedCodes = (
  codes: ReadonlyArray<string>,
  order: ReadonlyArray<string>,
): Array<string> => {
  const known = new Set(codes)
  const placed = order.filter((code) => known.has(code))
  return [...placed, ...codes.filter((code) => !placed.includes(code))]
}

/**
 * One code moved to sit at an index, the rest closing up behind it.
 *
 * The index is read **after** the code is lifted out, which is what makes a
 * drag past the end land on the end rather than one short of it.
 */
export const movedTo = (
  order: ReadonlyArray<string>,
  code: string,
  index: number,
): Array<string> => {
  const without = order.filter((each) => each !== code)
  if (without.length === order.length) {
    return [...order]
  }
  const at = Math.max(0, Math.min(without.length, index))
  return [...without.slice(0, at), code, ...without.slice(at)]
}

/** One code moved one place up or down, staying inside the list. */
export const movedBy = (order: ReadonlyArray<string>, code: string, by: number): Array<string> => {
  const from = order.indexOf(code)
  return from === -1 ? [...order] : movedTo(order, code, from + by)
}

/** Which side of a row a dragged column would land on, or nothing over its own row. */
export type DropEdge = 'above' | 'below'

/**
 * Where the line goes while a column is being dragged over a row.
 *
 * **A drag with no line is a guess** (Paul, 2026-09-11: "the list should show a
 * blue line (2px horizontal) where the item will be dropped to help the user
 * see where it will go"). The picker moved a column on drop and said nothing
 * before it, so the only way to find out where a row would land was to drop it
 * and look.
 *
 * The edge is decided by {@link movedTo} rather than chosen to look right: that
 * function lifts the code out *before* reading the index, so dropping on a row
 * below where the drag started lands **after** that row, and dropping on one
 * above lands **before** it. Say [A, B, C, D] and drag A onto C — without A the
 * list is [B, C, D] and inserting at 2 gives [B, C, A, D], which is under C.
 * Drag D onto B and the same arithmetic puts it over B. A line drawn any other
 * way is a line that lies about the drop.
 *
 * @param order the codes as the list is drawing them.
 * @param held the code being dragged.
 * @param over the index of the row the pointer is on.
 */
export const dropEdge = (
  order: ReadonlyArray<string>,
  held: string,
  over: number,
): DropEdge | null => {
  const from = order.indexOf(held)
  // Nothing over the row being dragged, and nothing for a code this list has
  // never heard of: neither is a drop that would move anything.
  if (from === -1 || from === over || over < 0 || over >= order.length) {
    return null
  }
  return from < over ? 'below' : 'above'
}
