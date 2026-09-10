/**
 * Framing the part into the half of the canvas the panel does not cover.
 *
 * **The part centres beside the list, not behind it** (Paul, 2026-09-10: "the
 * viewer should really be only to the right of the left hand panel — so the
 * part centers next to the list rather than behind it on small screens. I
 * would, however, still like to be able to see the part behind the list and
 * keep the layers that work now").
 *
 * The two halves of that are what makes this a camera problem rather than a
 * layout one. Narrowing the canvas would centre the part and take the part out
 * from behind the translucent rows with it — and the overlay's layers, its
 * pointer rules and the `absolute inset` chrome are all written against a
 * canvas that fills the panel. So the canvas keeps every pixel it has, and the
 * **projection** is what gets told that a strip down its left is spoken for.
 *
 * `three` calls that a view offset: `setViewOffset(fullW, fullH, x, y, w, h)`
 * renders the sub-rectangle `(x, y, w, h)` of a virtual screen `fullW × fullH`.
 * It is honoured inside `updateProjectionMatrix()` for both cameras, and the
 * viewer only ever writes `left/right/top/bottom`, `fov`, `aspect` and then
 * calls that — it never touches `camera.view`. So an offset set here survives
 * every resize, fit and re-projection the viewer does, and because it is part of
 * the projection rather than a pan, it holds under any orbit and any zoom.
 * A pan would drift: world-space padding stops being screen-left the moment the
 * part turns.
 *
 * Picking is unaffected. A raycast unprojects the pointer through this same
 * matrix, so a click lands where it looks like it lands.
 */

/** The six numbers `Camera.setViewOffset` takes, in CSS pixels. */
export interface ViewOffset {
  readonly fullWidth: number
  readonly fullHeight: number
  readonly offsetX: number
  readonly offsetY: number
  readonly width: number
  readonly height: number
}

/**
 * The most of the canvas a panel may take before the part stops being the
 * point of it.
 *
 * The part is framed into what is left, so the inset costs it size — two fifths
 * of the width costs two fifths of the part. Past this the window is too narrow
 * for both, and a part shrunk to a speck beside a full-height list is worse than
 * a part the list overlaps: at least the second one can be read by folding the
 * rows away. So the panel wins up to here and the part keeps the rest.
 *
 * **Two fifths rather than a third** (2026-09-10): the column and its margins
 * are 340px, and at a 1280-wide window the canvas between the filters and the
 * assembly panel is about 900 — 37.8% of it. A third would have capped the
 * inset just short of the column on exactly the screens this is for, leaving
 * the part a couple of dozen pixels behind its right edge.
 */
export const MOST_OF_IT = 0.4

/**
 * How the camera should frame the part, given the canvas and the strip a panel
 * covers down its left.
 *
 * `null` where there is nothing to do — no panel, or a canvas not laid out yet
 * — which is also what says "clear the offset" rather than "set it to nothing".
 *
 * The offset it returns is a **uniform scale and a shift**: the part ends up
 * centred in the free slot at the same fraction of it that it filled of the
 * whole canvas before. Doing it any other way distorts — narrowing the frustum
 * horizontally alone stretches the part vertically, which on a cube is
 * immediately and obviously wrong.
 */
export const frameInset = (width: number, height: number, inset: number): ViewOffset | null => {
  if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(inset)) {
    return null
  }
  if (width <= 0 || height <= 0) {
    return null
  }
  const taken = Math.min(Math.max(inset, 0), width * MOST_OF_IT)
  // Under a pixel is a rounding difference, not a panel.
  if (taken < 1) {
    return null
  }
  const free = width - taken
  return {
    /*
      The virtual screen is the *free* width, and the sub-rectangle rendered is
      the whole canvas — wider than the virtual screen, which is unusual and is
      the point: it says "what fits the free slot, drawn across everything".
    */
    fullWidth: free,
    // Scaled with it, so the world shrinks by the same factor in both axes.
    fullHeight: (height * free) / width,
    /*
      Negative, and this is the shift. `offsetX` is where the rendered rectangle
      starts on the virtual screen, so starting a panel's width *before* it puts
      the virtual centre — where the part is framed — at `(width + taken) / 2`,
      which is the middle of the strip the panel leaves.
    */
    offsetX: -taken,
    // The same arithmetic vertically, and it comes out to no vertical move at
    // all: the part stays on the middle line.
    offsetY: (-height * taken) / (2 * width),
    width,
    height,
  }
}

/**
 * A box drawn over the part, as much of it as this needs.
 *
 * `right` and `left` are page coordinates, the same ones
 * `getBoundingClientRect` hands back, so the caller measures and this decides.
 */
export interface Drawn {
  readonly right: number
  readonly top: number
  readonly bottom: number
}

/**
 * The band of the canvas the part is taken to stand in: the middle third.
 *
 * The part is framed about the middle of the view and a fitted one fills most
 * of the height, so a box that reaches this band is in front of it and a box
 * that stops above it is over empty sky. A third rather than the middle line
 * itself because a line is a coin toss for a list that ends near it.
 */
const WHERE_THE_PART_IS = 3

/**
 * How much of the canvas is spoken for: how far in the boxes that stand in
 * front of the part reach.
 *
 * **It follows what is drawn, not the column** (Paul, 2026-09-10: "have it
 * follow the drawn content"). The column is a fixed width and the full height
 * of the viewer whatever is in it, so insetting by *it* pushes the part aside
 * for three buttons in the top corner and an empty list. What is actually in
 * the way is the boxes — the presses, the box being filled in, the fold, the
 * rows — and only those of them that reach the part.
 *
 * So a short list leaves the part in the middle of the viewer and sits over the
 * sky above it, and the part moves aside once the list is long enough to be in
 * front of it. That is a step rather than a slide, and it is the honest one:
 * there is no half-way state where the part is half behind a row.
 *
 * `0` where nothing reaches it, which is what says "no offset at all".
 */
export const spokenFor = (
  canvas: { readonly left: number; readonly top: number; readonly height: number },
  boxes: ReadonlyArray<Drawn>,
): number => {
  const from = canvas.top + canvas.height / WHERE_THE_PART_IS
  const to = canvas.top + canvas.height - canvas.height / WHERE_THE_PART_IS
  return boxes.reduce(
    (most, box) =>
      box.bottom > from && box.top < to ? Math.max(most, box.right - canvas.left) : most,
    0,
  )
}
