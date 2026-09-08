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
export type EscapeLayer = { readonly id: symbol }

const layers: Array<EscapeLayer> = []

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
 * Answer Escape while `open`, but only while nothing is stacked above.
 *
 * `event.defaultPrevented` is left alone: a `@toolpath/ui` popover closes
 * itself on Escape and marks the press as handled on the way up, so a combobox
 * inside a dialog closes its own list without also closing the dialog.
 */
export const useEscape = (open: boolean, onEscape: (event: KeyboardEvent) => void): void => {
  const latest = useRef(onEscape)
  useEffect(() => {
    latest.current = onEscape
  })

  useEffect(() => {
    if (!open) {
      return
    }
    const layer: EscapeLayer = { id: Symbol('escape') }
    const drop = pushLayer(layer)
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || !isTopLayer(layer)) {
        return
      }
      event.preventDefault()
      latest.current(event)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      drop()
    }
  }, [open])
}
