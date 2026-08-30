import { gripsShank, holderTakesTool, type Collet, type Holder } from './toolholding.js'
import type { CatalogTool } from './types.js'

/**
 * Which holders will take a tool, and which collets go in them — the rules
 * behind an assembly picker.
 *
 * **Taken from the DFM catalog's `fit.ts` (Justin Gray, 2026-08-05), the
 * flow this application follows:** three panes, each narrowing the next.
 * Holders that can hold the shank, ordered by the least overhang a machinist
 * picks by hand — smallest collet series, then shortest gauge length — with
 * the first row a recommendation rather than merely first. Then the collets
 * of the chosen holder's series that close on the shank, closest to on-size
 * first, because a collet grips and runs truest at its nominal size. A
 * direct-bore holder needs no collet, and that is not an empty result.
 *
 * Pure — no catalog import — so every rule is tested against literals.
 */

/**
 * Two microns: how far apart two vendor-printed decimals can be and still
 * name one physical size. A 3/8 in shank converts to 9.525 and a vendor
 * prints it 9.5250 or 9.525; the tightest gap between two genuinely different
 * sizes in this catalog is sixty times wider.
 */
const EPSILON = 0.002

/**
 * The discrete holder axes, in the order a picker shows them — one list,
 * because three places walk it (the predicate, the facet counter, the chips)
 * and an axis added to two of the three silently stops filtering.
 */
export const HOLDER_AXES = ['taper', 'contact', 'clamping', 'colletSeries'] as const
export type HolderAxis = (typeof HOLDER_AXES)[number]

/** Values are OR-ed within an axis and AND-ed across axes. */
export interface HolderFilters {
  readonly taper?: ReadonlyArray<string>
  readonly contact?: ReadonlyArray<string>
  readonly clamping?: ReadonlyArray<string>
  readonly colletSeries?: ReadonlyArray<string>
}

/**
 * Whether constraining `axis` can narrow anything, given the rest.
 *
 * One rule: a bore or shrink holder grips the shank itself and carries no
 * collet series, so under a clamping that excludes collet chucks a series is
 * not a narrower question, it is a question with no answers. Nothing selected
 * means the axis constrains — `[]` is "any style", which includes collet chucks.
 */
export const axisConstrains = (filters: HolderFilters, axis: HolderAxis): boolean => {
  if (axis !== 'colletSeries') {
    return true
  }
  const clamping = filters.clamping ?? []
  return clamping.length === 0 || clamping.includes('collet')
}

/**
 * The filters with any axis that cannot constrain dropped — what a selection
 * *means*, as opposed to what it literally says. `holdersFor` deliberately
 * does not call this: it stays a literal AND, so asking for the impossible
 * returns nothing rather than something not asked for.
 */
export const applicableFilters = (filters: HolderFilters): HolderFilters =>
  axisConstrains(filters, 'colletSeries') ? filters : { ...filters, colletSeries: [] }

const valueOn = (holder: Holder, axis: HolderAxis): string | null => holder[axis]

export const matchesFilters = (holder: Holder, filters: HolderFilters): boolean =>
  HOLDER_AXES.every((axis) => {
    const allowed = filters[axis]
    if (allowed === undefined || allowed.length === 0) {
      return true
    }
    const value = valueOn(holder, axis)
    // A holder with no value on the axis cannot satisfy a constraint on it —
    // a series filter must not match a shrink-fit chuck.
    return value !== null && allowed.includes(value)
  })

/** The size a collet series is named for: `PG6` → 6, `ER32` → 32. Null for a series with no number. */
export const seriesSize = (series: string | null): number | null => {
  const digits = /(\d+(?:\.\d+)?)/.exec(series ?? '')
  return digits ? Number(digits[1]) : null
}

/**
 * The recommended order: smallest collet series, then shortest gauge length,
 * then the catalog number so the order is stable. A holder with no series (a
 * bore or shrink chuck) sorts with the smallest, since it holds the shank
 * itself and has no nut to stand off.
 */
export const compareHolders = (a: Holder, b: Holder): number => {
  const sa = seriesSize(a.colletSeries) ?? 0
  const sb = seriesSize(b.colletSeries) ?? 0
  if (sa !== sb) {
    return sa - sb
  }
  const ga = a.gaugeLength ?? Number.POSITIVE_INFINITY
  const gb = b.gaugeLength ?? Number.POSITIVE_INFINITY
  if (ga !== gb) {
    return ga - gb
  }
  return a.catalogNumber.localeCompare(b.catalogNumber, 'en', { numeric: true })
}

/** True when this holder takes a collet rather than the shank directly. */
export const holderNeedsCollet = (holder: Holder): boolean => holder.clamping === 'collet'

/**
 * Every holder that can hold this tool, matching the filters, in the
 * recommended order.
 *
 * A collet holder is a candidate only when a collet of its series closes on
 * the shank — without that the picker would offer a PG 6 chuck for a 10 mm
 * shank and discover the problem at the collet step.
 */
export const holdersFor = (
  tool: CatalogTool,
  holders: ReadonlyArray<Holder>,
  collets: ReadonlyArray<Collet>,
  filters: HolderFilters = {},
): Array<Holder> =>
  holders
    .filter((holder) => matchesFilters(holder, filters))
    .filter((holder) =>
      holderNeedsCollet(holder)
        ? collets.some((collet) => holderTakesTool(holder, collet, tool))
        : holderTakesTool(holder, null, tool),
    )
    .sort(compareHolders)

/**
 * How far a collet has to close to grip this shank, in millimetres: its
 * largest size less the shank. Zero is on-size, which is where a collet grips
 * and runs truest. A powRgrip collet is specified for one size, so on it this
 * is zero or the collet does not fit.
 */
export const collapse = (collet: Collet, shank: number): number => collet.clampMax - shank

/** True when the shank is exactly this collet's size. */
export const isOnSize = (collet: Collet, shank: number): boolean =>
  Math.abs(collapse(collet, shank)) <= EPSILON

/**
 * The collets that fit this tool in this holder, closest to on-size first.
 * Empty for a holder that needs none — which is a different fact from "none
 * fit", and the picker says which.
 */
export const colletsFor = (
  tool: CatalogTool,
  holder: Holder,
  collets: ReadonlyArray<Collet>,
): Array<Collet> => {
  const shank = tool.geometry.SFDM
  if (!holderNeedsCollet(holder) || shank === undefined) {
    return []
  }
  return collets
    .filter((collet) => collet.series === holder.colletSeries && gripsShank(collet, shank))
    .sort(
      (a, b) =>
        collapse(a, shank) - collapse(b, shank) ||
        a.catalogNumber.localeCompare(b.catalogNumber, 'en', { numeric: true }),
    )
}

/**
 * The distinct values of an axis across a holder list, each with how many
 * holders constraining that axis to that value alone would leave, every
 * other axis as it is.
 *
 * **The vocabulary comes from `holders`; the number from `filters`.** The
 * list of values stays put so a chip greys out where it stands instead of
 * vanishing, while the number beside it stays a true promise about what
 * clicking it returns. Measured through {@link applicableFilters}: with a
 * series selected, "direct bore" would otherwise count zero — but clicking it
 * drops the series, so what it really returns is every bore chuck.
 */
export const holderFacet = (
  holders: ReadonlyArray<Holder>,
  filters: HolderFilters,
  axis: HolderAxis,
): Array<{ value: string; count: number }> => {
  const vocabulary: Array<string> = []
  for (const holder of holders) {
    const value = valueOn(holder, axis)
    if (value !== null && !vocabulary.includes(value)) {
      vocabulary.push(value)
    }
  }
  return vocabulary.map((value) => {
    const alone = applicableFilters({ ...filters, [axis]: [value] })
    return { value, count: holders.filter((holder) => matchesFilters(holder, alone)).length }
  })
}
