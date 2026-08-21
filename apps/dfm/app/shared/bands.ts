import type { Band } from './rules'
import { BANDS, bandRank } from './rules'

/**
 * What the five bands look like.
 *
 * Green through red, and grey for a feature no rule reached — which is not the
 * colour of `easy`. "Nothing judged this" and "this is fine" are different
 * statements, and a part that shows them the same way is a part claiming to
 * have been checked.
 *
 * Deliberately not a gradient: five named bands are five decisions a shop made,
 * and a shade between two of them would be a number the app invented.
 */
export const BAND_HEX: Record<Band, number> = {
  easy: 0x4ea172,
  alright: 0x62b6a8,
  meh: 0xe0b53d,
  rats: 0xe07a48,
  'no go': 0xd6455d,
}

/** The colour of a feature no rule reached. */
export const UNJUDGED_HEX = 0x9ca3af

export const bandHex = (band: Band | null): number =>
  band === null ? UNJUDGED_HEX : BAND_HEX[band]

/** The same five as CSS, for chips and rows beside the part. */
export const BAND_CSS: Record<Band, string> = {
  easy: '#4ea172',
  alright: '#62b6a8',
  meh: '#e0b53d',
  rats: '#e07a48',
  'no go': '#d6455d',
}

export const bandCss = (band: Band | null): string => (band === null ? '#9ca3af' : BAND_CSS[band])

/**
 * Which verdict wins a surface two features share.
 *
 * The easiest reading, painted last. A face nobody has placed is shown at its
 * best — the best a shop could do if it held the part that way — so a plan that
 * cannot afford that orientation reads worse than the colour suggests, rather
 * than the part looking harder than any single way of holding it would be.
 *
 * Unjudged sits behind everything, since a colour that means "nobody looked"
 * should not cover one that means something.
 */
export const paintOrder = (band: Band | null): number =>
  band === null ? BANDS.length : bandRank(band)
