import { useEffect, type RefObject } from 'react'
import { useThree } from '@react-three/fiber'
import { frameInset, spokenFor } from 'shared/frame-inset'

/**
 * Frames the part beside the boxes drawn over it rather than behind them.
 *
 * **The part centres beside the list, not behind it** (Paul, 2026-09-10).
 * `shared/frame-inset.ts` holds both rules — `spokenFor`, how far the drawn
 * boxes reach, and `frameInset`, what that does to the camera — and says why
 * this is a camera and not a layout: the canvas keeps every pixel, so the part
 * still draws behind the translucent rows and every overlay layer is untouched.
 *
 * It draws nothing. It is a child of `<Viewer>` because that is the only way to
 * reach the camera, and **because that is the only place the canvas's own size
 * is reliable**: R3F re-renders this whenever the canvas is resized, which is
 * what the first measurement needs. Measured from outside, on mount, the first
 * answer was taken before the panel group had sized the viewer at all — a short
 * canvas whose middle the presses in the top corner crossed, so an empty list
 * shoved the part aside and nothing ever measured again (2026-09-10).
 */
export interface FrameInsetProps {
  /**
   * The column over the part. Every `[data-over-part]` box inside it is
   * measured; a box that forgets the attribute simply does not move the part,
   * which is the safe way for this to be wrong.
   */
  readonly boxes: RefObject<HTMLElement | null>
  /**
   * Anything that changes when those boxes do — the overlay itself.
   *
   * The boxes change height inside a column that does not, so nothing about the
   * column resizes when a list grows a row; what says so is the overlay being
   * drawn again.
   */
  readonly watch: unknown
  /** What was measured, for the page to say out loud. */
  readonly onInset?: (inset: number) => void
}

export const FrameInset = ({ boxes, watch, onInset }: FrameInsetProps) => {
  const camera = useThree((state) => state.camera)
  const size = useThree((state) => state.size)
  const gl = useThree((state) => state.gl)
  const invalidate = useThree((state) => state.invalidate)

  useEffect(() => {
    const canvas = gl.domElement.getBoundingClientRect()
    const column = boxes.current
    const drawn =
      column === null
        ? []
        : [...column.querySelectorAll('[data-over-part]')].map((each) =>
            each.getBoundingClientRect(),
          )
    const inset = spokenFor(
      { left: canvas.left, top: canvas.top, height: canvas.height },
      // A canvas with no box yet is one this has already answered `null` for.
      drawn,
    )
    onInset?.(inset)

    const offset = frameInset(size.width, size.height, inset)
    if (offset === null) {
      camera.clearViewOffset()
    } else {
      camera.setViewOffset(
        offset.fullWidth,
        offset.fullHeight,
        offset.offsetX,
        offset.offsetY,
        offset.width,
        offset.height,
      )
    }
    /*
      `frameloop="demand"`: nothing draws unless something asks, and a
      projection changing on its own is not something the controls know about.
      Without this the part moves at the next orbit rather than at the press
      that opened the box.
    */
    invalidate()
    return () => {
      camera.clearViewOffset()
      invalidate()
    }
  }, [camera, size.width, size.height, gl, boxes, watch, onInset, invalidate])

  return null
}
