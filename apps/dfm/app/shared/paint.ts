import { DIRECTION_COLORS } from '@toolpath/viewer'
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
export type PaintMode = 'directions' | 'plain' | 'difficulty'

export const PAINT_MODES: readonly PaintMode[] = ['plain', 'directions', 'difficulty']

/**
 * The modes, in the order they are offered.
 *
 * Words **and** icons. The words carry it — these are the question the part is
 * answering, and a picture of "no standing opinion" is not one anybody reads
 * cold — but they sit at the top left away from the rest of the toolbar now,
 * and a shelf of bare words over there read as a heading rather than a control.
 * The glyph is what says *press me*; the word still says what pressing does.
 *
 * The icons live in `components/panel-icons`, because an icon is a component
 * and this file is one a test can import without a DOM.
 */
const ALL_PAINT_MODE_LABELS: readonly (readonly [PaintMode, string])[] = [
  ['plain', 'Plain'],
  ['directions', 'Directions'],
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
export const loadPaintMode = (storage: Pick<Storage, 'getItem'> | null): PaintMode => {
  const stored = storage?.getItem(STORAGE_KEY)
  const found = PAINT_MODES.find((mode) => mode === stored) ?? 'plain'

  // A mode this release does not offer is a part coloured by something with no
  // button to turn it off, which reads as the part being wrong.
  return PAINT_MODE_LABELS.some(([mode]) => mode === found) ? found : 'plain'
}

export const savePaintMode = (storage: Pick<Storage, 'setItem'> | null, mode: PaintMode): void => {
  storage?.setItem(STORAGE_KEY, mode)
}

export interface FeatureWash {
  readonly tag: string
  readonly color: number
  readonly weight: number
}

/** A colour on one face, for work that covers only part of a reading. */
export interface RegionWash {
  readonly region: number
  readonly color: number
  readonly weight: number
}

/**
 * The wash for readings that cut only part of what they cover.
 *
 * Painted face by face rather than by feature, because the feature's other
 * faces belong to somebody else now — see `cutRegionsByDirection`. Disjoint
 * from {@link paintWash} by cut-once, so the two layers cannot disagree.
 *
 * **Both washes need this layer, not just directions.** A split reading drops
 * out of the by-tag map on purpose, so a mode without a face-by-face layer
 * paints it with nothing at all: difficulty showed a hole exactly where a
 * reading had been divided, which is often where the hardest work is and
 * always where somebody has been making decisions.
 */
export const regionWash = (
  mode: PaintMode,
  /** Which way up cuts each face, for `directions`. */
  cutByRegion: ReadonlyMap<number, number> = new Map(),
  /** Which reading cuts each face, for `difficulty`. */
  cutRegionsBy: ReadonlyMap<number, string> = new Map(),
  /** What the rules made of each feature, for `difficulty`. */
  verdicts: readonly { tag: string; band: Band | null }[] = [],
): RegionWash[] => {
  if (mode === 'difficulty') return difficultyRegionWash(cutRegionsBy, verdicts)
  if (mode !== 'directions') return []

  return [...cutByRegion].map(([region, direction]) => ({
    region,
    color: DIRECTION_COLORS[direction % DIRECTION_COLORS.length] ?? 0x64748b,
    weight: PAINT_WEIGHT,
  }))
}

/**
 * A split reading's faces, in the band of the reading cutting them.
 *
 * No sort, unlike {@link difficultyWash}: cut-once means a face is cut by one
 * reading in a pass, so there is nothing here for a gentler band to win.
 *
 * A face whose reading the rules never judged paints in the unjudged colour
 * rather than not at all — the same answer the by-tag layer gives it. What is
 * left grey is a face nothing cuts, which is a different statement and one the
 * page depends on being able to make.
 */
const difficultyRegionWash = (
  cutRegionsBy: ReadonlyMap<number, string>,
  verdicts: readonly { tag: string; band: Band | null }[],
): RegionWash[] => {
  const bands = new Map(verdicts.map((verdict) => [verdict.tag, verdict.band]))

  return [...cutRegionsBy]
    .filter(([, tag]) => bands.has(tag))
    .map(([region, tag]) => ({
      region,
      color: bandHex(bands.get(tag) ?? null),
      weight: PAINT_WEIGHT,
    }))
}

/**
 * The standing wash for a mode.
 *
 * Plain has no standing opinion; Difficulty colours every feature by the rule
 * band it landed in.
 */
export const paintWash = (
  mode: PaintMode,
  /** What the rules made of each feature, for `difficulty`. */
  verdicts: readonly { tag: string; band: Band | null }[] = [],
  /** Which way up cuts each feature in the pass being shown, for `directions`. */
  cutBy: ReadonlyMap<string, number> = new Map(),
): FeatureWash[] => {
  if (mode === 'difficulty') return difficultyWash(verdicts, new Set(cutBy.keys()))
  if (mode === 'directions') return directionsWash(cutBy)
  return []
}

/**
 * The part by **who cuts what**, in the direction cycle.
 *
 * Pointed at the plan rather than at the Engine's reported direction, which is
 * the whole difference between this and a picture of the analysis: a feature is
 * reported from every way up that can reach it, so colouring by that would paint
 * a decision nobody made. A face with no colour here is a face nothing cuts —
 * which is the question the page exists to close.
 */
const directionsWash = (cutBy: ReadonlyMap<string, number>): FeatureWash[] => {
  return [...cutBy].map(([tag, direction]) => ({
    tag,
    color: DIRECTION_COLORS[direction % DIRECTION_COLORS.length] ?? 0x64748b,
    weight: PAINT_WEIGHT,
  }))
}

/**
 * The part by how hard the work **the plan will do** is, in the five band
 * colours.
 *
 * **Only what is mapped.** A face is read from every way up that can reach it,
 * and under cut-once all but one of those readings must lose — so painting
 * every verdict coloured the part by trouble no operation on it would ever
 * meet, and picking the gentlest of them where they overlapped said the part
 * was easier than any plan could make it.
 *
 * A part with nothing mapped therefore paints as nothing, which is the honest
 * answer and a useful one: the colour arrives face by face as the work is
 * placed, so the wash is a picture of the plan rather than of the report. This
 * is a change of model — difficulty showed every candidate because there was no
 * mapping to show instead, and now there is.
 *
 * Easiest last among the ones that are mapped, so where two share a surface the
 * gentler is on screen; unjudged paints first and loses to everything, since
 * "nobody looked" should not cover a colour that means something.
 */
const difficultyWash = (
  verdicts: readonly { tag: string; band: Band | null }[],
  /** Readings the plan cuts in the pass being shown. */
  mapped: ReadonlySet<string>,
): FeatureWash[] => {
  return verdicts
    .filter((verdict) => mapped.has(verdict.tag))
    .sort((a, b) => paintOrder(b.band) - paintOrder(a.band))
    .map((verdict) => ({
      tag: verdict.tag,
      color: bandHex(verdict.band),
      weight: PAINT_WEIGHT,
    }))
}

/** The violet an offer is painted in — the picker's own `PROPOSED_HEX`. */
export const PROPOSED_HEX = 0x8b5cf6

/** The orange painting is drawn in. Its own colour, and nothing else's. */
export const PAINTED_HEX = 0xf97316

/**
 * A standing offer, over whatever the part is already painted with.
 *
 * Painted **last** so it wins: while an offer stands it is the question on
 * screen, and a difficulty band showing through would read as work already
 * placed.
 *
 * **In the colour of the way up it came from**, rather than in one violet for
 * every offer. An offer *is* a direction's claim — "these are the faces +Z
 * would take" — so painting it the colour that way up already wears on its
 * arrow, its row and its held faces says which one is asking. Violet said only
 * "something is being suggested", which is the one thing already obvious from
 * the panel standing open beside it.
 *
 * It is still unmistakably an offer rather than a decision: nothing is in the
 * plan until it is confirmed, and the panel says so. What changed is that the
 * part now says *whose* offer it is.
 *
 * Per reading rather than per face, which comes to the same thing: the readings
 * an offer amounts to tile exactly the faces it is offering.
 */
export const proposedWash = (
  readings: readonly { featureTag: string }[],
  /** Which way up is asking. Falls back to the old violet where unknown. */
  direction?: number,
): FeatureWash[] => {
  const color =
    direction === undefined
      ? PROPOSED_HEX
      : (DIRECTION_COLORS[direction % DIRECTION_COLORS.length] ?? 0x64748b)

  return readings.map((reading) => ({
    tag: reading.featureTag,
    color,
    weight: PAINT_WEIGHT,
  }))
}

/**
 * Faces gathered for a way up, in their own orange.
 *
 * Painting is the one thing on the part that is about *this moment* — a set
 * being assembled to ask a question with — so it borrows nothing: not the
 * direction cycle, not the difficulty ramp, and not the pale blue the viewer
 * uses for faces picked to ask "what owns this".
 *
 * That conflation is what made it unreadable: painted faces rendered as picked
 * faces, so the part showed two different meanings in one colour and neither
 * could be identified.
 */
export const paintedWash = (readings: readonly { featureTag: string }[]): FeatureWash[] => {
  return readings.map((reading) => ({
    tag: reading.featureTag,
    color: PAINTED_HEX,
    weight: PAINT_WEIGHT,
  }))
}
