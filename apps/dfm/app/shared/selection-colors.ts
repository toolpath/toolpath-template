/**
 * What the part wears for "this is the thing I am reading".
 *
 * Blue, and saturated enough to still read as blue over a light grey part —
 * but eased off the fully saturated version, which sat on the part as a slab of
 * colour rather than as a face wearing one. There is a floor to this: brightened
 * or drained much further it becomes a white patch, and the thing being read
 * stops being a colour at all.
 *
 * **A selected feature is one colour.** The face that was clicked used to wear a
 * deeper blue than the rest of the feature it resolved to, on the reasoning that
 * a click is a stronger claim than an inference. On a part it reads as two
 * things selected rather than one, and the split the Engine cuts for machining
 * makes it worse: the seam between two shades looks like a seam in the part.
 * What somebody has selected is a feature, so the feature is what is coloured.
 *
 * The hover stays a step lighter, because it is a question rather than an
 * answer and it has to be told apart from what is already chosen.
 *
 * The warm equivalent is kept for setups, where a plan is being laid on the
 * part rather than a feature read off it — and for difficulty, whose five bands
 * are a warm ramp that a selection sitting over them cannot be warm too.
 */
export const READING_COLORS = {
  highlight: 0x3e6bcc,
  hover: 0x6d97dd,
  // The same blue as the rest of the feature: a face still paints when it
  // belongs to no feature at all, which is what this layer is for now.
  picked: 0x3e6bcc,
} as const
