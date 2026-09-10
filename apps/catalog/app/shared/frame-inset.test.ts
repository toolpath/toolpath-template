import { describe, expect, it } from 'vitest'
import { MOST_OF_IT, frameInset, spokenFor, type ViewOffset } from './frame-inset'

/**
 * Where the middle of the part lands, and at what scale.
 *
 * This is `three`'s own orthographic view-offset arithmetic, which is the only
 * thing that makes the six numbers mean anything — asserting the numbers
 * themselves would pin the derivation rather than the result. The frustum is
 * the one the viewer writes: symmetric about the target, so the part is at
 * world `(0, 0)`.
 */
const projected = (
  offset: ViewOffset | null,
  canvas: { readonly width: number; readonly height: number },
  half: { readonly x: number; readonly y: number },
) => {
  let left = -half.x
  let right = half.x
  let top = half.y
  let bottom = -half.y
  if (offset !== null) {
    const scaleW = (right - left) / offset.fullWidth
    const scaleH = (top - bottom) / offset.fullHeight
    left += scaleW * offset.offsetX
    right = left + scaleW * offset.width
    top -= scaleH * offset.offsetY
    bottom = top - scaleH * offset.height
  }
  return {
    /** The pixel down the canvas the part's middle draws at. */
    x: ((0 - left) / (right - left)) * canvas.width,
    y: ((top - 0) / (top - bottom)) * canvas.height,
    /** World units per pixel, which is the part's size on screen. */
    perPixelX: (right - left) / canvas.width,
    perPixelY: (top - bottom) / canvas.height,
  }
}

const CANVAS = { width: 1000, height: 800 }
const HALF = { x: 50, y: 40 }

describe('frameInset', () => {
  it('has nothing to say without a panel over the part', () => {
    expect(frameInset(1000, 800, 0)).toBeNull()
    // Under a pixel is a rounding difference, not a panel.
    expect(frameInset(1000, 800, 0.4)).toBeNull()
  })

  it('has nothing to say about a canvas that is not laid out yet', () => {
    expect(frameInset(0, 0, 320)).toBeNull()
    expect(frameInset(Number.NaN, 800, 320)).toBeNull()
  })

  it('centres the part in the strip the panel leaves', () => {
    const offset = frameInset(CANVAS.width, CANVAS.height, 320)
    expect(offset).not.toBeNull()
    const at = projected(offset, CANVAS, HALF)
    // The middle of what is left: halfway between the panel's edge and the
    // right edge of the canvas.
    expect(at.x).toBeCloseTo((1000 + 320) / 2, 6)
    // And no vertical move at all — the part stays on the middle line.
    expect(at.y).toBeCloseTo(400, 6)
  })

  it('scales the part by the same amount in both directions', () => {
    const at = projected(frameInset(CANVAS.width, CANVAS.height, 320), CANVAS, HALF)
    /*
      Narrowing the frustum horizontally alone would stretch the part upward,
      which on a cube is immediately and obviously wrong. Both axes or neither.
    */
    expect(at.perPixelX).toBeCloseTo(at.perPixelY, 12)
  })

  it('costs the part exactly the width it gave up', () => {
    const before = projected(null, CANVAS, HALF)
    const after = projected(frameInset(CANVAS.width, CANVAS.height, 320), CANVAS, HALF)
    // 680 of 1000 to draw in, so the part draws at 68% — it fills the free slot
    // as fully as it filled the whole canvas.
    expect(before.perPixelX / after.perPixelX).toBeCloseTo(680 / 1000, 12)
  })

  it('gives the panel no more than most of it', () => {
    // A window narrow enough for the panel to swallow the part keeps the part:
    // MOST_OF_IT is the floor under how small this may make it.
    const offset = frameInset(CANVAS.width, CANVAS.height, 900)
    const taken = CANVAS.width * MOST_OF_IT
    const at = projected(offset, CANVAS, HALF)
    expect(at.x).toBeCloseTo((CANVAS.width + taken) / 2, 6)
  })

  it('leaves the part in the middle when nothing is offset', () => {
    expect(projected(null, CANVAS, HALF).x).toBeCloseTo(500, 6)
  })
})

describe('spokenFor', () => {
  // A canvas 300 tall from y=100: the part's band is 200 to 300.
  const CANVAS = { left: 10, top: 100, height: 300 }
  const box = (over: Partial<{ right: number; top: number; bottom: number }> = {}) => ({
    right: 350,
    top: 110,
    bottom: 400,
    ...over,
  })

  it('is nothing with nothing drawn over the part', () => {
    expect(spokenFor(CANVAS, [])).toBe(0)
  })

  it('is nothing while the boxes stop above the part', () => {
    // Three presses in the corner and an empty list: the part keeps the middle
    // of the viewer, and they sit over the sky above it.
    expect(spokenFor(CANVAS, [box({ top: 110, bottom: 140 })])).toBe(0)
  })

  it('measures to the right edge of a box that reaches the part', () => {
    // From the canvas's own left edge, which is what the camera is offset by.
    expect(spokenFor(CANVAS, [box({ top: 110, bottom: 250 })])).toBe(340)
  })

  it('takes the furthest of them', () => {
    const reach = spokenFor(CANVAS, [
      box({ right: 500, top: 110, bottom: 150 }), // wider, and out of the way
      box({ right: 350, top: 110, bottom: 260 }),
      box({ right: 200, top: 240, bottom: 380 }),
    ])
    expect(reach).toBe(340)
  })

  it('counts a box that only clips the top of the part', () => {
    // A list ending just inside the band is in front of the part.
    expect(spokenFor(CANVAS, [box({ top: 110, bottom: 201 })])).toBe(340)
    expect(spokenFor(CANVAS, [box({ top: 110, bottom: 199 })])).toBe(0)
  })
})
