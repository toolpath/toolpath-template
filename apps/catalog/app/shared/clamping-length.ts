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

/**
 * Where the shank starts, measured from the tip.
 *
 * **This is the length a holder has to grip in.** Above it is shank; below it
 * is flute, and on a necked tool the reduced section under the shank as well.
 * A chuck cannot close on either.
 */
const shankFrom = (tool: CatalogTool): number =>
  Math.max(tool.geometry['shoulder-length'] ?? 0, tool.geometry.LCF ?? 0)

/** How much shank there is to hold: the overall length less what is below it. */
export const shankLength = (tool: CatalogTool): number | null => {
  const { OAL } = tool.geometry
  return OAL === undefined ? null : Math.round(Math.max(0, OAL - shankFrom(tool)) * 100) / 100
}

/** What this rule *asks* to keep in the holder, or null where it says nothing. */
export const clampWanted = (tool: CatalogTool, rule: ClampingRule): number | null => {
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

/**
 * What this rule keeps in the holder — **never more shank than the tool has**.
 *
 * **The rule cannot reach past the shank** (Paul, 2026-09-01: "below holder
 * rule is not possible in this scenario… build a plan to ensure length below
 * holder is not set in impossible areas"). A ⌀20 necked bull nose 104 mm long
 * with 53 mm of shoulder has 51 mm of shank; 3×D asks for 60. Taken at its
 * word it left 44 mm below the holder — less than the 53 mm of neck and flute
 * that cannot be inside one, which is a chuck closed on the relief. Capped, the
 * answer is the honest one: everything below the shank is below the holder.
 *
 * {@link clampShortfall} says by how much the rule was refused, for the tools
 * where the shop's own rule is not achievable.
 */
export const clampedLength = (tool: CatalogTool, rule: ClampingRule): number | null => {
  const wanted = clampWanted(tool, rule)
  const shank = shankLength(tool)
  if (wanted === null) {
    return null
  }
  return shank === null ? wanted : Math.round(Math.min(wanted, shank) * 100) / 100
}

/**
 * How much shank the rule asks for and the tool does not have, in millimetres.
 *
 * Null where the rule fits — which is nearly every tool, and all of the plain
 * ones. It is the number to say out loud when a shop's clamping rule cannot be
 * met: "3×D wants 60 mm and this tool has 51 mm of shank".
 */
export const clampShortfall = (tool: CatalogTool, rule: ClampingRule): number | null => {
  const wanted = clampWanted(tool, rule)
  const shank = shankLength(tool)
  if (wanted === null || shank === null || wanted <= shank) {
    return null
  }
  return Math.round((wanted - shank) * 100) / 100
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
