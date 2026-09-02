import type { CatalogTool } from './types.js'

/** The geometry a clamping rule reads, by ISO code. */
type ToolGeometry = Readonly<Record<string, number>>

/**
 * How much shank stays in the holder, and what that leaves below it.
 *
 * **ISO 13399 calls it `LSCN`** — *clamping length minimum*, stated against
 * the shank diameter `DMM`, which is what a multiple of "D" means here: the
 * holder grips the shank, not the cut. Manufacturers publish it per tool; the
 * five Seco end mills Paul checked (2026-09-01) want between 4 and 6 diameters
 * clamped against the 3×D rule of thumb, and the difference is most of a
 * tool's reach. So the rule reads the vendor's own number first and falls back
 * to a multiple of the diameter for every tool that publishes none — which is
 * every tool in this catalog today, because no scraper carries the column yet.
 *
 *     LBH = OAL − (minimum clamping length × SFDM)
 *
 * **Except where that would bury the head.** When the answer is at or under
 * the shoulder length — the flutes, and the reduced section under them on a
 * necked tool — the tool comes out to `shoulder length + SFDM` instead, so a
 * diameter of plain shank shows below the holder rather than a chuck closing
 * on the relief (Paul, 2026-09-01).
 *
 * **Here rather than in the application** (Paul, 2026-09-02: "I think we
 * should do what I did"). The dataset carried its own older rule — flute
 * length plus a diameter, capped at two thirds of the overall length — while
 * the part page applied this one over the top, so the same tool read one way
 * on the catalog page and another beside a feature. One rule, in the package
 * that owns the contract, used by the build and by the page.
 */

/** What a shop holds: the vendor's number where there is one, else a multiple of the diameter. */
export interface ClampingRule {
  /** Read the manufacturer's `LSCN` where the tool publishes one. On by default. */
  readonly vendorSpec: boolean
  /** Diameters to clamp where it does not — the rule of thumb is 3. Zero for none. */
  readonly perDiameter: number
}

/** What the dataset is built with, and what the page starts at. */
export const DEFAULT_CLAMPING: ClampingRule = { vendorSpec: true, perDiameter: 3 }

const round = (value: number) => Math.round(value * 100) / 100

/**
 * The diameter a clamping length is a multiple **of**: the shank.
 *
 * `LSCN` is stated against `DMM`, and the shank is what the holder grips — a
 * keyseat cutter 22 mm across on a ⌀12 shank is clamped on 12. The cut stands
 * in only where a vendor states no shank.
 */
export const heldDiameter = (geometry: ToolGeometry): number | undefined =>
  geometry.SFDM ?? geometry.DC

/**
 * Where the shank starts, measured from the tip: past the flutes, and past the
 * reduced section under them where a tool has one. A chuck closes on neither.
 */
export const headLength = (geometry: ToolGeometry): number =>
  Math.max(geometry['shoulder-length'] ?? 0, geometry.LCF ?? 0)

/** What this rule asks to keep in the holder, or null where it says nothing. */
export const clampWanted = (
  geometry: ToolGeometry,
  rule: ClampingRule = DEFAULT_CLAMPING,
): number | null => {
  const stated = geometry.LSCN
  if (rule.vendorSpec && stated !== undefined && stated > 0) {
    return round(stated)
  }
  const shank = heldDiameter(geometry)
  if (rule.perDiameter <= 0 || shank === undefined || shank <= 0) {
    return null
  }
  return round(shank * rule.perDiameter)
}

/** What is left below the holder: see the rule at the top of this file. */
export const lengthBelowHolder = (
  geometry: ToolGeometry,
  rule: ClampingRule = DEFAULT_CLAMPING,
): number | null => {
  const wanted = clampWanted(geometry, rule)
  const { OAL } = geometry
  if (wanted === null || OAL === undefined) {
    return null
  }
  const below = OAL - wanted
  const head = headLength(geometry)
  if (head <= 0 || below > head) {
    return round(Math.max(0, below))
  }
  return round(Math.min(OAL, head + (heldDiameter(geometry) ?? 0)))
}

/** What the holder is left holding, which is what a drawing shades. */
export const clampedLength = (
  geometry: ToolGeometry,
  rule: ClampingRule = DEFAULT_CLAMPING,
): number | null => {
  const below = lengthBelowHolder(geometry, rule)
  const { OAL } = geometry
  return below === null || OAL === undefined ? clampWanted(geometry, rule) : round(OAL - below)
}

/** How much shank the rule asked for and the tool has not got, or null where it fits. */
export const clampShortfall = (
  geometry: ToolGeometry,
  rule: ClampingRule = DEFAULT_CLAMPING,
): number | null => {
  const wanted = clampWanted(geometry, rule)
  const { OAL } = geometry
  if (wanted === null || OAL === undefined) {
    return null
  }
  const shank = Math.max(0, OAL - headLength(geometry))
  return wanted <= shank ? null : round(wanted - shank)
}

/** The same, for a whole tool rather than a bare geometry. */
export const belowHolderFor = (tool: CatalogTool, rule?: ClampingRule): number | null =>
  lengthBelowHolder(tool.geometry, rule)
