import {
  DEFAULT_CLAMPING,
  DEFAULT_STICKOUT_POLICY,
  setupStickout,
  type CatalogTool,
  type ClampingRule,
  type StickoutPolicy,
} from '@toolpath/catalog-data'

export { type ClampingRule }

/**
 * The shop's clamping rule, as this page lets somebody set it.
 *
 * **The rule itself is `@toolpath/catalog-data`'s** (Paul, 2026-09-02). It has
 * to be: the dataset is built with it, so a tool's length below holder is the
 * same number on the catalog page as beside a feature. What lives here is the
 * knob — the default the rail starts at, and applying a changed one to the
 * whole catalog.
 *
 * **What the rule now moves is the ceiling, not `LBH` directly** (2026-09-03).
 * `LBH` is the length the tool is set up at, and the clamping rule is one of
 * three caps on it — so clamping more shank shortens the column only for tools
 * whose setup was already against the ceiling. `stickout.ts` in the package is
 * the whole rule; this file has no arithmetic of its own left, which is the
 * point of it.
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
 * `LBH` is already this shop's. `LD` follows, because it is `LBH ÷ DC` and
 * would otherwise disagree with the column beside it.
 *
 * **The policy is passed in and is not optional in practice.** With the sheet's
 * floor and step, `setupStickout` gives the length a machinist sets up at; with
 * a policy of zeroes it gives the bare flute length, which is the answer this
 * reading was reverted over on 2026-09-01. `clamping-length.test.ts` pins the
 * page's policy against the package's so a knob edited in `knobs.csv` cannot
 * leave the dataset's `LBH` and the page's disagreeing.
 */
export const withClampingLength = (
  tools: ReadonlyArray<CatalogTool>,
  rule: ClampingRule,
  policy: StickoutPolicy = DEFAULT_STICKOUT_POLICY,
): ReadonlyArray<CatalogTool> =>
  tools.map((tool) => {
    const below = setupStickout({ geometry: tool.geometry, unitSystem: tool.unitSystem }, rule)
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
