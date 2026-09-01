import { type CatalogTool } from '@toolpath/catalog-data'

/**
 * How much shank stays in the holder, and what that leaves below it.
 *
 * **ISO 13399 calls it `LSCN`** — *clamping length minimum*, stated against
 * the shank diameter `DMM`, which is what a multiple of "D" means here: the
 * holder grips the shank, not the cut. The manufacturers publish it per tool: the five
 * Seco end mills Paul checked (2026-09-01) want between 4 and 6 diameters
 * clamped, against the 3×D rule of thumb everybody quotes, and the difference
 * is most of a tool's reach.
 *
 * So the rule reads **the vendor's own number first** and falls back to a
 * multiple of the diameter for every tool that publishes none — which is every
 * tool in this catalog today, because no scraper carries the column yet. The
 * day one does, the tools that have it stop guessing without anybody changing
 * a setting.
 *
 * What it decides is `LBH`, and `LBH` is then arithmetic: the overall length
 * less the shank held. A ⌀6 end mill 57 long, clamped 6×D as Seco asks, has
 * 21 mm below the holder and an L/D of 3.5 — the reach question answered in
 * the shop's terms rather than the catalog's.
 */

/**
 * The knob the page reads the fallback from — named once, so the sensor that
 * insists every knob is named somewhere can find it.
 */
export const CLAMPING_KNOB = 'minimum clamping length'

/** What a shop holds: the vendor's number where there is one, else a multiple of the diameter. */
export interface ClampingRule {
  /** Read the manufacturer's `LSCN` where the tool publishes one. On by default. */
  readonly vendorSpec: boolean
  /** Diameters to clamp where it does not — the rule of thumb is 3. Zero for none. */
  readonly perDiameter: number
}

/**
 * The diameter a clamping length is a multiple **of**: the shank.
 *
 * **`LSCN` is stated against `DMM`**, the shank diameter, and the shank is
 * what the holder grips — a keyseat cutter 22 mm across on a ⌀12 shank is
 * clamped on 12 (Paul, 2026-09-01). Reading it off the cut made every
 * disc-shaped tool ask for a clamp it has no shank for. The cut stands in only
 * where a vendor states no shank, which is a tool this rule cannot be precise
 * about either way.
 */
const heldDiameter = (tool: CatalogTool): number | undefined =>
  tool.geometry.SFDM ?? tool.geometry.DC

/** What this rule keeps in the holder for one tool, or null where it says nothing. */
export const clampedLength = (tool: CatalogTool, rule: ClampingRule): number | null => {
  const stated = tool.geometry.LSCN
  if (rule.vendorSpec && stated !== undefined && stated > 0) {
    return Math.round(stated * 100) / 100
  }
  const shank = heldDiameter(tool)
  if (rule.perDiameter <= 0 || shank === undefined || shank <= 0) {
    return null
  }
  return Math.round(shank * rule.perDiameter * 100) / 100
}

/** Whether the number came from the manufacturer or from the rule of thumb. */
export const clampedFrom = (tool: CatalogTool, rule: ClampingRule): 'vendor' | 'rule' | null => {
  const stated = tool.geometry.LSCN
  if (rule.vendorSpec && stated !== undefined && stated > 0) {
    return 'vendor'
  }
  return clampedLength(tool, rule) === null ? null : 'rule'
}

/**
 * What is left below the holder: the overall length less the shank held.
 *
 * Never negative — a tool with nothing to spare is pushed all the way in, and
 * the hold band is what says whether that is a problem.
 */
export const lengthBelowHolder = (tool: CatalogTool, rule: ClampingRule): number | null => {
  const clamped = clampedLength(tool, rule)
  const { OAL } = tool.geometry
  if (clamped === null || OAL === undefined) {
    return null
  }
  return Math.round(Math.max(0, OAL - clamped) * 100) / 100
}

/**
 * The catalog as this shop reads it.
 *
 * Applied once, where the tools are read, so nothing downstream has to know
 * the rule exists: the judge, the columns and the filters all see a tool whose
 * `LBH` already has the shank it holds taken out of it. `LD` follows, because
 * it is `LBH ÷ DC` and would otherwise disagree with the column beside it.
 */
export const withClampingLength = (
  tools: ReadonlyArray<CatalogTool>,
  rule: ClampingRule,
): ReadonlyArray<CatalogTool> => {
  if (!rule.vendorSpec && rule.perDiameter <= 0) {
    return tools
  }
  return tools.map((tool) => {
    const below = lengthBelowHolder(tool, rule)
    const { DC } = tool.geometry
    if (below === null || DC === undefined || DC <= 0) {
      return tool
    }
    return {
      ...tool,
      geometry: { ...tool.geometry, LBH: below, LD: Math.round((below / DC) * 100) / 100 },
      provenance: { ...tool.provenance, LBH: 'derived' as const, LD: 'derived' as const },
    }
  })
}
