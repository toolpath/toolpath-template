/**
 * Where a box opened off a button stands, and how tall it may be.
 *
 * **One rule, for every menu on the part screen.** The column funnels, the
 * column picker and the quick filters over the bottom of the viewer all open a
 * box against a button that can be anywhere on the page, and each had grown its
 * own half of the answer — which is how the picker and the quick filters ended
 * up drawn *inside* the card that clips them (Paul, 2026-09-11: "the 'which
 * columns to show' menu is now hidden behind the table when opened. Same with
 * the 'part material' menu"). A menu belongs to the page, not to the thing it
 * was opened from — which is why the picker and the quick filters are the kit's
 * `Menu` now, and why the column funnels, which cannot be (they re-find an
 * anchor the virtualized table rebuilds under them), are placed by this.
 */

/** Room kept between the menu and the edge of the screen. */
export const MENU_EDGE = 12

/**
 * The least room worth opening downwards into.
 *
 * Below this the menu opens upwards instead. It is a floor on the height as
 * well: a menu squeezed into eighty pixels is one nobody can read, so it takes
 * this much and overhangs rather than becoming a slot.
 */
export const MENU_LEAST = 220

/** The gap between the button and the box it opened. */
export const MENU_GAP = 4

/**
 * How tall a box opened off a button may be, and which way it opens.
 *
 * **A menu is as tall as the screen leaves it** (Paul, 2026-09-10, of the Type
 * filter and then of the column picker: "the edit columns drop down list should
 * be scrollable if it runs off the screen"). Both boxes are opened from a
 * header that can sit anywhere down the page, and both were drawn at whatever
 * height their contents came to, so the rows past the bottom edge were
 * unreachable — the column picker's last column could not be ticked at all.
 *
 * One rule for both: the room under the button is measured, the box takes it
 * and scrolls inside itself, and where what is left under the button is a strip
 * it opens upwards into the larger room instead.
 *
 * **The screen is what runs out, and only the screen.** That is true because a
 * menu placed by {@link placeMenu} is drawn in a portal on the page: a box
 * inside the viewer card would be cut off at the card's edge long before it ran
 * out of window, and measuring against the window would be a lie about it.
 */
export const menuRoom = (
  button: { readonly top: number; readonly bottom: number },
  viewport: number,
): { readonly upwards: boolean; readonly height: number } => {
  const below = viewport - button.bottom - MENU_EDGE
  const above = button.top - MENU_EDGE
  const upwards = below < MENU_LEAST && above > below
  return { upwards, height: Math.max(MENU_LEAST, upwards ? above : below) }
}

/** Where the menu stands: by its top, or by its bottom where it opened upwards. */
export interface Placed {
  readonly top: number | null
  readonly bottom: number | null
  readonly left: number
  /** The most it may be, which is the room the screen left it. */
  readonly height: number
}

/**
 * The whole placement of a menu, in viewport pixels — a `position: fixed` box.
 *
 * Where {@link menuRoom} says upwards, the box is anchored by its **bottom**
 * rather than placed by a height it has not been measured at yet, which is the
 * one way to flip a box without a frame of it in the wrong place.
 *
 * @param button the box the menu opened from.
 * @param width what the menu has measured, or 0 before it has been drawn once.
 * @param align which edge of the button the menu lines up with, so a menu on
 *   the last column opens leftwards instead of off the screen.
 */
export const placeMenu = (
  button: {
    readonly top: number
    readonly bottom: number
    readonly left: number
    readonly right: number
  },
  width: number,
  align: 'left' | 'right',
  viewport: { readonly width: number; readonly height: number },
): Placed => {
  const wanted = align === 'right' ? button.right - width : button.left
  const room = menuRoom(button, viewport.height)
  return {
    top: room.upwards ? null : button.bottom + MENU_GAP,
    bottom: room.upwards ? viewport.height - button.top + MENU_GAP : null,
    left: Math.max(8, Math.min(wanted, viewport.width - width - 8)),
    height: room.height,
  }
}
