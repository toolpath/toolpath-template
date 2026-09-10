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
