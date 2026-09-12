import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PanelResizer } from './panel-resizer'
import { NARROWEST, OPENS_AT, OPENS_AT_FOR_A_GROUP } from 'shared/panel-width'

/**
 * The handle on the right edge of the panel over the part (Paul, 2026-09-11).
 *
 * What a width may *be* is `shared/panel-width.ts` and pinned there. What is
 * pinned here is that the edge can be moved without a mouse at all, that a
 * double-click gives the defaults back, and that the handle is reported as a
 * separator with its two ends on it — a drag target nothing announces is a drag
 * target only a mouse can find.
 *
 * The drag itself is in `tests/on-the-part.spec.ts`: it is a pointer capture
 * against a measured viewer, and jsdom has neither.
 */
const show = (width = OPENS_AT) => {
  const onResize = vi.fn()
  const onReset = vi.fn()
  render(<PanelResizer width={width} onResize={onResize} onReset={onReset} />)
  return { handle: screen.getByRole('separator'), onResize, onReset }
}

describe('the panel handle', () => {
  it('says what it is and where its two ends are', () => {
    const { handle } = show(360)

    expect(handle).toHaveAttribute('aria-orientation', 'vertical')
    expect(handle).toHaveAttribute('aria-valuenow', '360')
    expect(handle).toHaveAttribute('aria-valuemin', String(NARROWEST))
  })

  /** The arrows move the edge, so widening the panel is not a mouse-only act. */
  it('widens and narrows on the arrow keys', () => {
    const { handle, onResize } = show(320)

    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(onResize).toHaveBeenLastCalledWith(336)

    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(onResize).toHaveBeenLastCalledWith(304)
  })

  /**
   * Rendered outside the viewer it measures, the clamp still has two ends —
   * `widestPanel` answers a width rather than nothing for a room it cannot
   * measure, which is what stops an arrow press snapping the panel shut.
   */
  it('holds the narrowest against a press that would go under it', () => {
    const { handle, onResize } = show(NARROWEST)

    fireEvent.keyDown(handle, { key: 'ArrowLeft' })

    expect(onResize).toHaveBeenLastCalledWith(NARROWEST)
  })

  it('does not move on a press that is not an arrow', () => {
    const { handle, onResize } = show()

    fireEvent.keyDown(handle, { key: 'Enter' })

    expect(onResize).not.toHaveBeenCalled()
  })

  /** Double-click is the way back to what the box in the panel opens at. */
  it('puts the defaults back on a double-click', () => {
    const { handle, onReset } = show(OPENS_AT_FOR_A_GROUP)

    fireEvent.doubleClick(handle)

    expect(onReset).toHaveBeenCalled()
  })
})
