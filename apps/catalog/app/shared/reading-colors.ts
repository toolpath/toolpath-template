/**
 * What the part wears for "this is the thing I am reading".
 *
 * Taken from the DFM application so a selected feature looks the same in both.
 * Blue, saturated enough to read as blue over a light grey part but eased off
 * the fully saturated version, which sat on the part as a slab of colour rather
 * than as a face wearing one.
 *
 * **A selected feature is one colour.** The face that was clicked used to wear a
 * deeper blue than the rest of the feature it resolved to. On a part that reads
 * as two things selected rather than one, and the seam between the two shades
 * looks like a seam in the part. What somebody selected is a feature, so the
 * feature is what is coloured.
 *
 * The hover stays a step lighter: it is a question rather than an answer, and
 * it has to be told apart from what is already chosen.
 */
const READING_COLORS = {
  highlight: 0x3e6bcc,
  hover: 0x6d97dd,
  // The same blue as the rest of the feature: a face still paints when it
  // belongs to no feature at all, which is what this layer is for.
  picked: 0x3e6bcc,
} as const

/**
 * A colour, mixed toward white.
 *
 * The hover has to be told apart from the selection at a glance, and the
 * selection's colour is now the way up's rather than a fixed blue — so the
 * hover is derived from whatever that is instead of being another constant that
 * would clash with five of the six.
 */
const lighten = (color: number, amount = 0.4): number => {
  const mix = (channel: number) => Math.round(channel + (255 - channel) * amount)
  return (mix((color >> 16) & 0xff) << 16) | (mix((color >> 8) & 0xff) << 8) | mix(color & 0xff)
}

/**
 * What the part wears for the reading on screen, in the colour of the way up it
 * is cut from.
 *
 * The arrow and the feature are the same claim — *this, from here* — and two
 * colours for one claim makes somebody check which is which. Falls back to the
 * reading blue when the way up is unknown.
 */
export const readingTheme = (color: number | null) =>
  color === null ? READING_COLORS : { highlight: color, hover: lighten(color), picked: color }
