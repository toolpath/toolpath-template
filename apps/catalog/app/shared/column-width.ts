import { useCallback, useEffect, useState } from 'react'

/**
 * How wide the column over the part is, and what a shop may drag it to.
 *
 * **The edge is a handle** (Paul, 2026-09-11: "I should have the ability to make
 * the order list (and feature/group/tool assembly) wider by clicking the edge
 * and expanding to the right"). One column carries all four of those — the three
 * presses, the box a press opens, the fold, and the rows — so there is one width
 * to state, and stating it is dragging its right edge.
 *
 * It is a rule here rather than a number in `routes/part.tsx` for the reason
 * `part-chrome.ts` and `frame-inset.ts` are: what a width may be is a clamp with
 * two ends and a default, and a clamp written inline in a pointer handler is
 * where a column ends up wider than the window it stands in.
 *
 * **The stated width outlives the box.** A group opens wider than a reading does
 * — the editor asks for more room — but that is a *default*, not a rule about
 * groups: once a shop has said how wide this column is, that is how wide it is
 * whatever is in it. A column that jumped 96px every time a group opened would
 * be undoing the drag that set it.
 */

/** Where the width is remembered: the shop's, in this browser, not the part's. */
const KEY = 'tool-catalog.column-width'

/**
 * The narrowest the column may be dragged.
 *
 * A row of the order list is a name and its answer, and the tree beside an open
 * box is three slots with a component in each. Under this they wrap to the point
 * where the column is taller than the viewer and says less, which is a worse
 * screen than the part being covered — and there is a fold button for that.
 */
export const NARROWEST = 256

/** What the column opens at, never having been dragged: today's `w-80`. */
export const OPENS_AT = 320

/**
 * And what it opens at while a group is being built: today's `w-[26rem]`.
 *
 * The group editor holds the features being grouped, the reading they share and
 * the thread, which is more than a reading has to say.
 */
export const OPENS_AT_FOR_A_GROUP = 416

/**
 * The most of the viewer the column may take.
 *
 * Past `MOST_OF_IT` in `frame-inset.ts` — two fifths — the camera stops moving
 * the part aside, so between there and here the rows sit over the geometry the
 * way they did before 2026-09-10. That is a fair thing to ask for while reading
 * a long order list, and the rows are translucent; what is not fair is dragging
 * the part off screen entirely, which is what the rest of this share is keeping.
 *
 * **It is a ceiling on the drag, not on the column.** The handle measures the
 * viewer at the press and clamps against that, and the route draws the width it
 * is given. Saying it a second time in CSS is what it looks like it wants and is
 * a circle: the overlay the column stands in is shrink-to-fit, so a percentage
 * `max-width` resolves against the column's own width and squeezes it to a share
 * of itself — `routes/part.tsx` carries the note. A window narrowed after a drag
 * therefore keeps the width it was given; the way back is the handle, or the
 * double-click that forgets it.
 */
export const WIDEST_SHARE = 0.7

/**
 * The widest the column may be dragged, given the viewer it stands over.
 *
 * A room that has not been measured yet — a zero from a layout not settled, or
 * anything that is not a number — gets the default back rather than a guess,
 * because a drag against an unknown room is a drag that snaps somewhere
 * arbitrary when the room turns up.
 */
export const widestColumn = (room: number): number => {
  if (!Number.isFinite(room) || room <= 0) {
    return OPENS_AT_FOR_A_GROUP
  }
  return Math.max(NARROWEST, room * WIDEST_SHARE)
}

/** A width somebody dragged to, held between the two ends above. */
export const clampColumn = (wanted: number, room: number): number => {
  if (!Number.isFinite(wanted)) {
    return OPENS_AT
  }
  return Math.min(Math.max(wanted, NARROWEST), widestColumn(room))
}

/** What the column is drawn at: what the shop stated, or what the box opens at. */
export const columnWidth = (stated: number | null, buildingAGroup: boolean): number => {
  if (stated === null) {
    return buildingAGroup ? OPENS_AT_FOR_A_GROUP : OPENS_AT
  }
  return Math.max(stated, NARROWEST)
}

/**
 * The width this browser has been told, or `null` for a shop that has not said.
 *
 * `null` rather than `OPENS_AT`, because "not said" is what lets a group open
 * wider than a reading — a stored 320 means somebody chose 320 and a group must
 * not walk on it.
 */
export const readColumnWidth = (storage: Pick<Storage, 'getItem'> | null): number | null => {
  const raw = storage?.getItem(KEY)
  if (raw === null || raw === undefined) {
    return null
  }
  const width = Number(raw)
  if (!Number.isFinite(width) || width <= 0) {
    return null
  }
  return Math.max(width, NARROWEST)
}

/** States it, or forgets it — which is what puts the defaults back. */
export const writeColumnWidth = (
  storage: Pick<Storage, 'setItem' | 'removeItem'> | null,
  width: number | null,
): void => {
  if (width === null) {
    storage?.removeItem(KEY)
    return
  }
  storage?.setItem(KEY, String(Math.round(width)))
}

/**
 * The stated width, and the two ways a drag ends: at a number, or back at the
 * defaults.
 *
 * Read on mount rather than during render, the way every other preference in
 * this application is: the server renders this page too, and a width read out of
 * `localStorage` while it does is a hydration mismatch over the whole column.
 */
export const useColumnWidth = () => {
  const [stated, setStated] = useState<number | null>(null)

  useEffect(() => {
    setStated(readColumnWidth(globalThis.localStorage ?? null))
  }, [])

  const state = useCallback((width: number | null) => {
    const kept = width === null ? null : Math.round(Math.max(width, NARROWEST))
    setStated(kept)
    writeColumnWidth(globalThis.localStorage ?? null, kept)
  }, [])

  return { stated, state }
}
