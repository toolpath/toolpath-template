import { bandHex, paintOrder } from './bands'
import type { Band } from './rules'

/**
 * What the part is coloured by while nothing is selected.
 *
 * `plain` is the default and is not "colour off" — it is "no standing
 * opinion". Selection, hover and the faces being held still paint over it; what
 * changes is whether the part carries an answer to a question nobody has asked
 * yet.
 */
export type PaintMode = 'plain' | 'difficulty'

export const PAINT_MODES: readonly PaintMode[] = ['plain', 'difficulty']

/**
 * The modes, in the order they are offered.
 *
 * Words rather than icons, unlike the rest of the toolbar: these are the
 * question the part is answering, and "no standing opinion" has no picture.
 */
const ALL_PAINT_MODE_LABELS: readonly (readonly [PaintMode, string])[] = [
  ['plain', 'Plain'],
  ['difficulty', 'Difficulty'],
]

export const PAINT_MODE_LABELS = ALL_PAINT_MODE_LABELS

/** How strongly the standing wash covers the part, under everything else. */
export const PAINT_WEIGHT = 0.7

const STORAGE_KEY = 'part-viewer.paint'

/**
 * The mode persists across parts and pages: what the part is coloured by is the
 * first thing anybody changes, and having to change it again on every part
 * turns a preference into a chore.
 */
export function loadPaintMode(storage: Pick<Storage, 'getItem'> | null): PaintMode {
  const stored = storage?.getItem(STORAGE_KEY)
  const found = PAINT_MODES.find((mode) => mode === stored) ?? 'plain'

  // A mode this release does not offer is a part coloured by something with no
  // button to turn it off, which reads as the part being wrong.
  return PAINT_MODE_LABELS.some(([mode]) => mode === found) ? found : 'plain'
}

export function savePaintMode(storage: Pick<Storage, 'setItem'> | null, mode: PaintMode): void {
  storage?.setItem(STORAGE_KEY, mode)
}

export interface FeatureWash {
  readonly tag: string
  readonly color: number
  readonly weight: number
}

/**
 * The standing wash for a mode.
 *
 * Plain has no standing opinion; Difficulty colours every feature by the rule
 * band it landed in.
 */
export function paintWash(
  mode: PaintMode,
  /** What the rules made of each feature, for `difficulty`. */
  verdicts: readonly { tag: string; band: Band | null }[] = [],
): FeatureWash[] {
  if (mode === 'difficulty') return difficultyWash(verdicts)
  return []
}

/**
 * The part by how hard each feature is, in the five band colours.
 *
 * Painted easiest last, so where two features share a surface the gentler
 * reading is the one on screen: a face nobody has placed is shown at its best,
 * which is the best a shop could do if it held the part that way. Unjudged
 * paints first and loses to everything, since "nobody looked" should not cover
 * a colour that means something.
 */
function difficultyWash(verdicts: readonly { tag: string; band: Band | null }[]): FeatureWash[] {
  return [...verdicts]
    .sort((a, b) => paintOrder(b.band) - paintOrder(a.band))
    .map((verdict) => ({
      tag: verdict.tag,
      color: bandHex(verdict.band),
      weight: PAINT_WEIGHT,
    }))
}
