import {
  DEFAULT_CLAMPING,
  clampWanted,
  clampedLength,
  lengthBelowHolder,
  type CatalogTool,
  type ClampingRule,
} from '@toolpath/catalog-data'

export { clampWanted, clampedLength, lengthBelowHolder, type ClampingRule }

/**
 * The shop's clamping rule, as this page lets somebody set it.
 *
 * **The rule itself is `@toolpath/catalog-data`'s** (Paul, 2026-09-02). It has
 * to be: the dataset is built with it, so a tool's length below holder is the
 * same number on the catalog page as beside a feature. What lives here is the
 * knob — the default the rail starts at, and applying a changed one to the
 * whole catalog.
 */

/**
 * The knob the page reads the fallback from — named once, so the sensor that
 * insists every knob is named somewhere can find it.
 */
export const CLAMPING_KNOB = 'minimum clamping length'

/** What the dataset was built with, and what the rail starts at. */
export const SHEET_CLAMPING: ClampingRule = DEFAULT_CLAMPING

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
    const below = lengthBelowHolder(tool.geometry, rule)
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
