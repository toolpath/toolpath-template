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

/**
 * A collet list, grouped by the series a holder joins it on.
 *
 * **Because the scan is per tool.** `holdersFor` is asked of every tool in the
 * filtered list on every change of a filter or a clearance, and it asked
 * whether any collet in the whole list fits each collet holder — the catalog's
 * 21 holders and 321 collets over 4,697 tools is 133 ms of scanning before a
 * single clearance is swept, and the crib is about to be an order of magnitude
 * larger. A series is a string equality that partitions the list, so grouping
 * once turns the inner scan from every collet into that series' own.
 *
 * Cached against the array's identity rather than rebuilt: the catalog hands
 * out one frozen array for the life of the page, so the index is built once and
 * a caller that passes a different list gets its own. A `WeakMap` is what keeps
 * that from pinning a list nothing else holds.
 */
const INDEXES = new WeakMap<ReadonlyArray<Collet>, Map<string, Array<Collet>>>()

const seriesIndex = (collets: ReadonlyArray<Collet>): Map<string, Array<Collet>> => {
  const cached = INDEXES.get(collets)
  if (cached !== undefined) {
    return cached
  }
  const index = new Map<string, Array<Collet>>()
  for (const collet of collets) {
    const series = index.get(collet.series)
    if (series === undefined) {
      index.set(collet.series, [collet])
    } else {
      series.push(collet)
    }
  }
  INDEXES.set(collets, index)
  return index
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
/**
 * Whether this holder can take this tool at all — the cheap half of
 * {@link holdersFor}, without the list or its order.
 *
 * Separated because the question is asked two ways: the picker wants every
 * holder in the recommended order, and the tool list wants only whether one
 * exists — for every tool it draws, on every change of a filter. Building and
 * sorting a list to answer a boolean is what made that second question cost
 * 2.2 seconds over 17,470 tools and 531 holders.
 */
export const holderCanTake = (
  tool: CatalogTool,
  holder: Holder,
  collets: ReadonlyArray<Collet>,
): boolean =>
  holderNeedsCollet(holder)
    ? (seriesIndex(collets).get(holder.colletSeries ?? '') ?? []).some((collet) =>
        holderTakesTool(holder, collet, tool),
      )
    : holderTakesTool(holder, null, tool)

/**
 * Whether this holder takes a collet series the crib stocks none of.
 *
 * **A fact about the crib, never a fit claim.** `holderCanTake` answers whether
 * a stack grips a tool and must stay strict — a bare ER32 chuck grips nothing,
 * and softening that is how a cutter ends up on the floor. This answers a
 * different question that a *picture* needs: is this holder absent from the
 * list because it cannot hold the tool, or because nobody has bought its
 * collets yet? MariTool publishes 135 collet chucks and no collets at all, and
 * without the distinction every one of them is invisible for a reason the UI
 * cannot state.
 */
export const seriesUnstocked = (holder: Holder, collets: ReadonlyArray<Collet>): boolean =>
  holderNeedsCollet(holder) &&
  (seriesIndex(collets).get(holder.colletSeries ?? '') ?? []).length === 0

/**
 * The holders worth *showing* for a tool, in two groups.
 *
 * `holding` is `holdersFor` — what actually grips this tool, unchanged.
 * `unstocked` is the collet chucks whose series the crib has none of: shown so
 * a holder can be looked at and drawn, and never presented as something that
 * can hold the tool. A caller that renders them without saying which group they
 * came from has misused this.
 */
export const holdersToShow = (
  tool: CatalogTool,
  holders: ReadonlyArray<Holder>,
  collets: ReadonlyArray<Collet>,
  filters: HolderFilters = {},
): { holding: Array<Holder>; unstocked: Array<Holder> } => ({
  holding: holdersFor(tool, holders, collets, filters),
  unstocked: holders
    .filter((holder) => matchesFilters(holder, filters))
    .filter((holder) => seriesUnstocked(holder, collets))
    .sort(compareHolders),
})

export const holdersFor = (
  tool: CatalogTool,
  holders: ReadonlyArray<Holder>,
  collets: ReadonlyArray<Collet>,
  filters: HolderFilters = {},
): Array<Holder> =>
  holders
    .filter((holder) => matchesFilters(holder, filters))
    .filter((holder) => holderCanTake(tool, holder, collets))
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
  return (seriesIndex(collets).get(holder.colletSeries ?? '') ?? [])
    .filter((collet) => gripsShank(collet, shank))
    .sort(
      (a, b) =>
        collapse(a, shank) - collapse(b, shank) ||
        a.catalogNumber.localeCompare(b.catalogNumber, 'en', { numeric: true }),
    )
}

/**
 * Every collet in the crib that closes on this tool's shank, closest to
 * on-size first — **whatever series it belongs to**.
 *
 * **For choosing a collet before a holder** (Paul, 2026-09-01: "I should be
 * able to select a collet without selecting a holder… every collet that grips
 * the tool's shank, which yes, then all holders are shown but we show the ones
 * that work with that collet at the top"). {@link colletsFor} answers the
 * other order — holder first, then the collets that fit it — and needs a
 * holder to have a series to narrow by.
 */
export const colletsForShank = (
  tool: CatalogTool,
  collets: ReadonlyArray<Collet>,
): Array<Collet> => {
  const shank = tool.geometry.SFDM
  if (shank === undefined) {
    return []
  }
  return collets
    .filter((collet) => gripsShank(collet, shank))
    .sort(
      (a, b) =>
        collapse(a, shank) - collapse(b, shank) ||
        a.series.localeCompare(b.series, 'en', { numeric: true }) ||
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
