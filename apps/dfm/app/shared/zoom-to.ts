/**
 * What the wheel zooms toward.
 *
 * A preference rather than a right answer, so it is remembered: zooming to the
 * cursor is what Fusion does and what most people reach for, and on a trackpad
 * it can walk the model off screen. Whichever somebody picks, they picked it
 * once and should not have to pick it again on the next part.
 *
 * Kept beside {@link loadShowAids} and the paint mode, which persist for the
 * same reason.
 */
export type ZoomTo = 'centre' | 'cursor'

const STORAGE_KEY = 'part-viewer.zoom-to'

export function loadZoomTo(storage: Pick<Storage, 'getItem'> | null): ZoomTo {
  return storage?.getItem(STORAGE_KEY) === 'centre' ? 'centre' : 'cursor'
}

export function saveZoomTo(storage: Pick<Storage, 'setItem'> | null, zoomTo: ZoomTo): void {
  storage?.setItem(STORAGE_KEY, zoomTo)
}
