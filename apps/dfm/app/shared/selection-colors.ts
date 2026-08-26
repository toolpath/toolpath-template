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
 * Cool is right over the **difficulty** ramp, whose five bands are warm — a
 * selection sitting over them cannot be warm too. Over the **direction cycle**
 * it is wrong, and {@link SETUP_COLORS} is what the part wears there instead.
 */
export const READING_COLORS = {
  highlight: 0x3e6bcc,
  hover: 0x6d97dd,
  // The same blue as the rest of the feature: a face still paints when it
  // belongs to no feature at all, which is what this layer is for now.
  picked: 0x3e6bcc,
} as const

/**
 * What the part wears while it is coloured by **direction**.
 *
 * §3.5's rule: the selection palette follows what the part is painted with —
 * warm over the cool direction cycle, cool over the warm difficulty ramp. The
 * direction cycle is blue, teal, cyan, emerald and slate, so a blue selection
 * over it is one more direction rather than an answer to a question, and the
 * hover in particular sat a shade away from the first direction colour.
 *
 * Orange because the cycle has no warm entry and never will: the viewer's own
 * note reserves the warm ramp for difficulty, red for sharp corners, orange for
 * faces being picked and green for whatever is being looked at.
 *
 * Deliberately spread in **lightness** rather than hue. Faces being painted are
 * already orange (`PAINTED_HEX`, orange-500) and sit between these two, so the
 * three are told apart by how dark they are as much as by their colour — which
 * is the only axis left once the hue is spoken for.
 */
export const SETUP_COLORS = {
  highlight: 0xea580c,
  hover: 0xfb923c,
  picked: 0xea580c,
} as const

/**
 * The faces of the reading being listed, while a face list is open.
 *
 * **Green, which the viewer's own palette note reserves for "whatever is being
 * looked at"** — and a face list is exactly that. It has to be a hue nothing
 * else on the part uses, because this layer's whole job is to separate faces
 * from the feature they belong to and from each other.
 *
 * It cannot borrow the selection colours. In both {@link READING_COLORS} and
 * {@link SETUP_COLORS} `highlight` and `picked` are the *same hex* — a
 * deliberate choice there, where a clicked face and the reading it resolved to
 * should read as one thing. Here it is fatal: the set and the face under the
 * pointer would paint identically, and the panel would light a dozen faces in
 * one flat colour with no way to tell which row was which.
 *
 * So the set is green and the row under the pointer keeps the theme's `picked`
 * — orange over the direction cycle, blue over difficulty — which is a full hue
 * away from it in either mode.
 */
export const FACE_COLORS = {
  /** Roughed **and** finished here: the whole job, done from this way up. */
  cut: 0x16a34a,
  /**
   * Roughed here and finished somewhere else, or the other way about.
   *
   * Its own colour rather than a shade of green, because a face half claimed is
   * not a face nearly done — it is a face two setups touch, which is the
   * expensive kind. Amber reads as "look at this" without reading as wrong.
   */
  rough: 0xd97706,
  /**
   * Finished here, roughed elsewhere. Cooler than `rough` and plainly not it:
   * the two are the same *kind* of answer and the eye has to tell them apart at
   * a glance to count setups.
   */
  finish: 0x7c3aed,
  /**
   * A face it covers and is **not** cutting.
   *
   * Red, which is free: the viewer's palette note reserves it for sharp
   * corners, and that layer was deliberately never built (§3.4). Nothing else
   * on the part is red, so it cannot be mistaken for a band, a direction or a
   * selection — and "covered but not cut" is exactly the state somebody opens
   * this panel to find.
   */
  uncut: 0xdc2626,
} as const

/**
 * The colour a face wears in the editor, from the passes this reading cuts it
 * in.
 *
 * Four states rather than two. "Cut or not" was the whole answer while a face
 * was claimed all at once; once roughing and finishing are separate claims,
 * **which** of them is held is the thing somebody is reading the part for — a
 * face roughed here and finished from the other side costs a second setup, and
 * painting it the same green as a face done in one is the app hiding the cost.
 */
export const faceColor = (passes: ReadonlyArray<'rough' | 'finish'>): number => {
  if (passes.length === 0) return FACE_COLORS.uncut
  if (passes.length > 1) return FACE_COLORS.cut
  return passes[0] === 'rough' ? FACE_COLORS.rough : FACE_COLORS.finish
}
