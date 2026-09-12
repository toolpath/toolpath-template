import { useCallback, useEffect, type RefObject } from 'react'

/**
 * What the kit's resize handle leaves behind, and when it has to go.
 *
 * Dragging a column edge does not go through React at all: `@toolpath/ui`'s
 * table is `@table-library/react-table-library` underneath, and its resizer
 * writes the tracks straight onto the table element as an inline custom
 * property — percentages of the box, measured at the width the box had while
 * the mouse was down. An inline property beats the class `shared/column-width`
 * hands its tracks to, so from the first drag onwards the list is laid out by
 * that frozen string and nothing else.
 *
 * Two things then make it wrong rather than merely stale:
 *
 * - **a column is shown or hidden**, and the string still names the old
 *   columns — eleven percentages over twelve tracks, so every column after the
 *   change is the width of its neighbour and the last of them is unclaimed; and
 * - **the box changes size**, where the percentages hold but the widths
 *   somebody dragged were chosen against a panel that is no longer that size.
 *
 * Both are answered the same way: drop the inline property and let the tracks
 * the list asked for take over, which is the layout it opens at. A drag is
 * therefore kept until one of those two happens and not after — that is the
 * trade, and it is the right way round, because a list that fits its box is
 * what every column in it is read from.
 *
 * A `ResizeObserver` rather than a window listener: the panel is resized by the
 * order list folding away and by the tool drawing beside it as much as by the
 * window, and none of those raise a `resize` event.
 *
 * @param inside the element the list is drawn in — the table is found under it.
 * @param columns what the shown columns are, in order, as one string. Any
 *   change to it refits, so it has to name the columns rather than count them.
 */
export const useFittedColumns = (inside: RefObject<HTMLElement | null>, columns: string): void => {
  const refit = useCallback(() => {
    const table = inside.current?.querySelector('[data-table-library_table]')
    if (!(table instanceof HTMLElement)) {
      return
    }
    table.style.removeProperty('--data-table-library_grid-template-columns')
  }, [inside])

  useEffect(() => {
    refit()
  }, [refit, columns])

  useEffect(() => {
    const element = inside.current
    // jsdom has no ResizeObserver, and a component test has nothing to observe.
    if (element === null || typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver(() => refit())
    observer.observe(element)
    return () => observer.disconnect()
  }, [inside, refit])
}
