import { useEffect, useRef } from 'react'

/**
 * Escape backs out of the thing on top, and only that thing.
 *
 * Every overlay on the part page used to answer Escape for itself, or not at
 * all: the order dialog and the tool table's filters had no answer, and the
 * filter rail's own listener fired *beside* the page's, so one press both put
 * the panel away and dropped the reading underneath it. That is the defect
 * this module exists to prevent — a press has one meaning, and it is the
 * newest thing on the screen.
 *
 * So the layers are a stack rather than a set of independent listeners. The
 * page registers first and sits at the bottom; anything opened over it is
 * pushed on top and takes the next press. Pressing Escape until nothing
 * happens still walks outward one step at a time, which is the rule
 * `escapeStep` in `part-selection.ts` already states for the part itself.
 */
export type EscapeLayer = {
  readonly id: symbol
  /**
   * What kind of layer this is, for the one press that is not Escape.
   *
   * Escape only ever needs to know *which* layer is on top, and a symbol
   * answers that. Enter needs to know *what* it is: the page orders on Enter
   * and a column filter opened inside that box takes the press instead, so the
   * page has to recognise a filter above it without importing the component
   * that drew it. See `LAYER_COLUMN_FILTER`.
   */
  readonly name?: string
}

/** The layer a column filter's menu pushes, which Enter belongs to. */
export const LAYER_COLUMN_FILTER = 'column-filter'

const layers: Array<EscapeLayer> = []

/**
 * Is a column filter open anywhere?
 *
 * **Counted rather than read off the top of the stack** (Paul, 2026-09-10:
 * "pressing ENTER still closes the feature dialog — it should only apply the
 * filter"). The page defers on this, and what it is deferring to is *a filter
 * being open*, which is a fact about the screen rather than about the order two
 * components happened to mount in. Asking the top of the stack made the page's
 * standing down conditional on nothing else having been pushed since — and the
 * failure of that question is the box closing on somebody, which is the one
 * outcome worth engineering against. Nothing above answers Enter, so deferring
 * to a filter under something else costs a press that does nothing rather than
 * a press that throws work away.
 */
export const columnFilterOpen = (): boolean =>
  layers.some((layer) => layer.name === LAYER_COLUMN_FILTER)

/** Puts a layer on top, and hands back the way to take it off again. */
export const pushLayer = (layer: EscapeLayer): (() => void) => {
  layers.push(layer)
  return () => {
    const at = layers.indexOf(layer)
    if (at >= 0) {
      layers.splice(at, 1)
    }
  }
}

/**
 * Is this the layer a press belongs to?
 *
 * Removal is by identity rather than by popping, because React unmounts in no
 * order a stack can rely on — a route dropping two overlays in one render
 * would otherwise leave whichever unmounted second holding a press it no
 * longer owns.
 */
export const isTopLayer = (layer: EscapeLayer): boolean =>
  layers.length > 0 && layers[layers.length - 1] === layer

/** How many layers are listening, for tests. */
export const layerCount = (): number => layers.length

/**
 * The keys one overlay answers while it is the newest thing on the screen.
 *
 * One layer, not one per key: two `pushLayer` calls from the same overlay would
 * leave each of them believing the other was above it, and neither would answer
 * anything.
 *
 * `onEnter` is on the document rather than on the menu, because the press it is
 * competing with is on the document too — the page orders on Enter wherever the
 * focus is, which is the whole reason Enter reaches a filter menu nobody has
 * clicked into. A layer that answers Enter names itself so the page can stand
 * down for it; see `columnFilterOpen`.
 *
 * **The two keys are heard in opposite directions, and that is the point.**
 * Escape listens on the way *up*, because a `@toolpath/ui` popover closes
 * itself and marks the press handled as it goes, which is how a combobox inside
 * a dialog closes its own list without closing the dialog. Enter listens on the
 * way *down*, because the control it is being taken away from answers it
 * first — the kit's `Checkbox` is a `<button role="checkbox">` and had ticked
 * itself long before anything on the document heard the press. A layer that
 * wants Enter has to be in front of the focus, not behind it.
 */
export const useKeyLayer = (
  open: boolean,
  keys: {
    readonly name?: string
    readonly onEscape: (event: KeyboardEvent) => void
    readonly onEnter?: (event: KeyboardEvent) => void
  },
): void => {
  const latest = useRef(keys)
  useEffect(() => {
    latest.current = keys
  })

  const { name } = keys
  useEffect(() => {
    if (!open) {
      return
    }
    const layer: EscapeLayer = { id: Symbol('escape'), name }
    const drop = pushLayer(layer)
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || !isTopLayer(layer)) {
        return
      }
      event.preventDefault()
      latest.current.onEscape(event)
    }
    const onEnter = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || event.defaultPrevented || !isTopLayer(layer)) {
        return
      }
      latest.current.onEnter?.(event)
    }
    document.addEventListener('keydown', onEscape)
    document.addEventListener('keydown', onEnter, true)
    return () => {
      document.removeEventListener('keydown', onEscape)
      document.removeEventListener('keydown', onEnter, true)
      drop()
    }
  }, [open, name])
}

/**
 * Answer Escape while `open`, but only while nothing is stacked above.
 *
 * `event.defaultPrevented` is left alone: a `@toolpath/ui` popover closes
 * itself on Escape and marks the press as handled on the way up, so a combobox
 * inside a dialog closes its own list without also closing the dialog.
 */
export const useEscape = (open: boolean, onEscape: (event: KeyboardEvent) => void): void => {
  useKeyLayer(open, { onEscape })
}
