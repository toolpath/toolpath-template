import { useRef, useState } from 'react'
import { cn } from '@toolpath/ui'
import { clampPanel, widestPanel, NARROWEST } from 'shared/panel-width'

/**
 * The right edge of the panel over the part, as something to drag.
 *
 * **Widen it by pulling the edge** (Paul, 2026-09-11: "I should have the ability
 * to make the order list (and feature/group/tool assembly) wider by clicking the
 * edge and expanding to the right"). One panel carries all of them, so this is
 * one handle, and `shared/panel-width.ts` holds every number it clamps to.
 *
 * **It measures the viewer itself.** The clamp needs the room the panel stands
 * in, and the one place that room is known without threading a measurement
 * through the route is here, at the pointer: the handle walks up to the overlay
 * the panel lives in and takes its offset parent, which is the viewer's own
 * box. Measured at the press rather than held in state, so a window resized
 * between two drags is a different clamp rather than a stale one.
 *
 * It is deliberately narrow and invisible until it is wanted. The strip takes
 * the pointer, and a wide `pointer-events: auto` strip down the middle of the
 * canvas is the curtain `tests/on-the-part.spec.ts` § "at a laptop width"
 * exists for — six pixels centred on the edge is a handle; forty is a wall.
 */
export interface PanelResizerProps {
  /** What the panel is drawn at now, which is where a drag starts from. */
  readonly width: number
  /** A width dragged to, already the panel's own — this clamps before calling. */
  readonly onResize: (width: number) => void
  /** Double-click: forget the stated width and put the defaults back. */
  readonly onReset: () => void
}

/** What one arrow press moves the edge by. */
const STEP = 16

/**
 * The room the panel has: the viewer it is drawn over.
 *
 * The overlay is `absolute` inside the viewer's `relative` section, so that
 * section is its offset parent and its width is the whole canvas — which is what
 * `WIDEST_SHARE` is a share of.
 */
const roomFor = (handle: HTMLElement | null): number => {
  const overlay = handle?.closest('[data-questions]')
  if (!(overlay instanceof HTMLElement)) {
    return 0
  }
  return overlay.offsetParent instanceof HTMLElement ? overlay.offsetParent.clientWidth : 0
}

export const PanelResizer = ({ width, onResize, onReset }: PanelResizerProps) => {
  /** Where the drag started, and how wide the panel was then. */
  const from = useRef<{ readonly x: number; readonly width: number; readonly room: number } | null>(
    null,
  )
  const [dragging, setDragging] = useState(false)
  const [room, setRoom] = useState(0)

  const moveTo = (wanted: number, against: number) => {
    onResize(clampPanel(wanted, against))
  }

  return (
    <div
      /*
        Not `data-over-part`: `spokenFor` measures what is in front of the part
        to frame it beside, and the handle is the panel's own edge. Measuring it
        would inset the part by the six pixels this hangs over, for nothing.
      */
      role="separator"
      aria-orientation="vertical"
      aria-label="Drag to widen the panel"
      title="Drag to widen — double-click to put it back"
      aria-valuenow={Math.round(width)}
      aria-valuemin={NARROWEST}
      aria-valuemax={Math.round(widestPanel(room))}
      tabIndex={0}
      onPointerDown={(event) => {
        const handle = event.currentTarget
        const measured = roomFor(handle)
        from.current = { x: event.clientX, width, room: measured }
        setRoom(measured)
        setDragging(true)
        handle.setPointerCapture(event.pointerId)
        // The part is under this: a press here must not also start an orbit.
        event.preventDefault()
        event.stopPropagation()
      }}
      onPointerMove={(event) => {
        const start = from.current
        if (start === null) {
          return
        }
        moveTo(start.width + (event.clientX - start.x), start.room)
      }}
      onPointerUp={(event) => {
        from.current = null
        setDragging(false)
        event.currentTarget.releasePointerCapture(event.pointerId)
      }}
      onPointerCancel={() => {
        from.current = null
        setDragging(false)
      }}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        const by = event.key === 'ArrowRight' ? STEP : event.key === 'ArrowLeft' ? -STEP : 0
        if (by === 0) {
          return
        }
        event.preventDefault()
        const measured = roomFor(event.currentTarget)
        setRoom(measured)
        moveTo(width + by, measured)
      }}
      className={cn(
        /*
          Centred on the edge — half over the panel, half over the part — so the
          width the pointer aims at is the width it lands on. `cursor-col-resize`
          is the whole affordance until it is hovered, which is what keeps a
          permanent line off the geometry.
        */
        'group pointer-events-auto absolute top-0 -right-1 z-10 h-full w-2 cursor-col-resize',
        'focus-visible:outline-none',
      )}
    >
      {/* The line itself: a hairline down the middle of the strip, on hover. */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-0 left-1/2 w-px -translate-x-1/2 rounded-full transition',
          dragging ? 'bg-info' : 'bg-info/0 group-hover:bg-info/60 group-focus-visible:bg-info/60',
        )}
      />
    </div>
  )
}
