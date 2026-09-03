import { DEFAULT_CLAMPING, clampWanted, type ClampingRule } from './clamping.js'
import { hasNeck } from './forms.js'
import type { CatalogTool } from './types.js'

/**
 * How far a tool stands out of whatever holds it — the one answer.
 *
 * **There used to be four.** Until 2026-09-03 the same question was worked out
 * in four unconnected places, and they disagreed by a factor of two on an
 * ordinary tool:
 *
 * | where | what it computed | on a ⌀1 in end mill, `OAL` 5, `LCF` 1.25, `SFDM` 1 |
 * | ----- | ---------------- | -------------------------------------------------- |
 * | `clamping.ts` → `geometry.LBH` | `OAL − 3×SFDM` | 2.000 in |
 * | `toolholding.ts` `stickoutLimits().max` | `OAL − OAL×heldShare` | 3.333 in |
 * | `stickoutLimits().default` → the drawing | flutes, floored and stepped | 1.250 in |
 * | `hole-mode.ts` `reaches` | read `geometry.LBH` as maximum reach | 2.000 in |
 *
 * The details table printed the first and the drawing beside it drew the
 * third, so a dimension line for `LBH` ran up past the holder nose and into
 * the holder body. Neither of the first two consulted the other, and the two
 * knobs behind them — `minimum clamping length` (a length of **shank**) and
 * `good hold` (a share of the **overall length**) — were combined nowhere.
 *
 * So this module owns the quantity outright and every other number is this
 * same function with more arguments:
 *
 * ```
 * geometry.LBH      ≡ stickoutRange(tool).setup                  — no holder, no feature
 * Assembly.stickout ≡ stickoutRange(tool, { grip, required }).setup
 * the ceiling       ≡ stickoutRange(tool, …).max
 * ```
 *
 * `min ≤ setup ≤ max` holds by construction, so a drawn stickout can never
 * exceed the length the table prints beside it. `stickout.test.ts` checks the
 * invariant over the committed dataset rather than trusting this sentence.
 *
 * **`LBH` is the setup length, not the ceiling** (Justin Gray, 2026-09-03).
 * The "Below holder" column answers what a machinist would set the tool up
 * at; the most it *could* stand out is {@link StickoutRange.max}, which is
 * checked and reported but is not the column. This is the reading rolled back
 * on 2026-09-01 — "now length below holder is always set to the flute length!
 * Argh" — and what makes it different now is that the sheet's floor and step
 * finally reach it: {@link DEFAULT_STICKOUT_POLICY} carries `least` and
 * `step`, where the old default carried zero for both and so produced the bare
 * flute length. That drill — ⌀0.096 in, `OAL` 2.283, `LCF` 0.669, `SFDM`
 * 0.157 — now comes out at 0.750 in (flutes, up to the half-inch floor, onto
 * the next eighth) against 0.669 then, with its 1.812 in ceiling checked.
 */

/**
 * What this module needs of a tool: its geometry, and which unit system its
 * step is counted in.
 *
 * Deliberately narrower than `CatalogTool` so `build.ts` can ask before a tool
 * is finished being built, and so nothing here can reach for a catalog number
 * or a vendor.
 */
export type StickoutTool = Pick<CatalogTool, 'geometry' | 'unitSystem'>

/**
 * The share of a tool's overall length a holder must always have hold of.
 *
 * A third. **This application's figure, not a vendor's** — no vendor in this
 * catalog publishes a minimum engagement — which is why it is named here and
 * every control that shows it says whose it is. Deliberately a share of the
 * length and not a multiple of the shank diameter: how much of a tool a collet
 * needs is about the tool's leverage, not its shank. That other reading is
 * {@link ClampingRule}, and both are honoured — see {@link StickoutLimit}.
 */
export const HELD_SHARE = 1 / 3

/**
 * How the setup stickout is set, from the catalog's sheet.
 *
 * Paul's rule (2026-08-30): nobody sets a tool up 6 mm out, so the stickout
 * stands out at least `least` (half an inch) where the tool's length allows,
 * and lands on a round number — the `step` for the tool's unit system (an
 * eighth of an inch, or 3 mm) nearest what the holder needs, never under it.
 */
export interface StickoutPolicy {
  /** Share of the overall length that must stay in the holder. */
  readonly heldShare: number
  /** The shortest stickout worth setting up, mm; zero for none. */
  readonly least: number
  /** The increment the setup lands on, mm, by the tool's unit system; zero for none. */
  readonly step: { readonly inch: number; readonly metric: number }
}

/**
 * What the dataset is built with, and what a page starts at.
 *
 * **The sheet's own numbers, and `apps/catalog` keeps a lockstep test on it.**
 * These were `least: 0, step: { inch: 0, metric: 0 }` until 2026-09-03, which
 * mattered the moment `LBH` became the setup length: with no floor and no step
 * the answer is the bare flute length, which is the result that got this
 * reading reverted on 2026-09-01. The knobs existed at the time and never
 * reached the build. `knobs.csv` states them for the page; a package cannot
 * read a sheet in an application, so `clamping-length.test.ts` fails when the
 * two drift apart.
 */
export const DEFAULT_STICKOUT_POLICY: StickoutPolicy = {
  heldShare: HELD_SHARE,
  least: 12.7,
  step: { inch: 3.175, metric: 3 },
}

/**
 * Which rule set the ceiling, so a control can say why rather than showing a
 * number nobody can trace.
 *
 * `clamp` is the shop's clamping length — `minimum clamping length` on the
 * sheet, or the vendor's own `LSCN`; `hold` is {@link HELD_SHARE}; `collet` is
 * the collet's published grip. They used to be a ceiling each in a different
 * file; here they are three caps and the tightest wins.
 */
export type StickoutLimit = 'clamp' | 'hold' | 'collet'

export interface StickoutRange {
  /** Shortest, mm: the flutes out of the collet, or the neck where there is one. */
  readonly min: number
  /**
   * The length to set the tool up at, mm: the least that works for this
   * feature, floored and stepped by the policy, held under {@link max}.
   *
   * This is `geometry.LBH` when asked with no holder and no feature, and
   * `Assembly.stickout` when asked with both.
   */
  readonly setup: number
  /**
   * Longest, mm: the tightest of the three caps, and never under {@link min} —
   * a tool that cannot meet the rule at any depth is gripped as short as the
   * grip allows and {@link gripShort} says so. Null where the tool states no
   * overall length, which is an unbounded range rather than a bound of nothing.
   */
  readonly max: number | null
  /** Which cap {@link max} came from, or null where nothing capped it. */
  readonly limitedBy: StickoutLimit | null
  /** The parallel shank behind {@link min}, mm: all a holder can ever grip. */
  readonly grip: number | null
  /** How much of the tool the tightest cap asks to keep in the holder, mm. */
  readonly wantedGrip: number | null
  /**
   * True when the rule cannot be met at any depth: the range collapses onto
   * {@link min}, and a control should say why rather than refuse.
   */
  readonly gripShort: boolean
}

export interface StickoutRequest {
  /**
   * How much shank the holder actually grips, mm — a collet's published grip
   * length. Null where the vendor does not publish one, which REGO-FIX's
   * powRgrip line does not, and null for a bore or shrink holder, whose grip
   * this package does not carry.
   *
   * **A length rather than a `Collet`**, so this module depends on nothing in
   * `toolholding.ts` and the two cannot form a cycle. `stickoutLimits` there is
   * the collet-shaped way in.
   */
  readonly grip?: number | null
  /** What the holder needs to clear the part, mm, from the sweep. */
  readonly required?: number | null
  /** What the shop keeps clamped. The dataset's own by default. */
  readonly rule?: ClampingRule
  /** The floor, step and hold share. The sheet's by default. */
  readonly policy?: StickoutPolicy
}

const round = (value: number) => Math.round(value * 100) / 100

/** A hair, so a rounded stickout a femtometre under what is needed is not stepped up. */
const STICKOUT_TOLERANCE = 1e-6

/**
 * The least a tool can stand out: its flutes, or its neck where it has one.
 *
 * Paul's rule (2026-08-29): the collet face sits at the end of the flutes, and
 * a stated neck — which a collet must not close on — pushes it back to the
 * shoulder. A tool that states no flute length has no known head, so it has no
 * known stickout at all and this answers `null`; since 2026-09-03 that also
 * means it carries no `LBH`, where it used to get one derived from `OAL` and
 * `SFDM` alone.
 */
export const minStickout = (tool: StickoutTool): number | null => {
  const { LCF } = tool.geometry
  if (LCF === undefined) {
    return null
  }
  const shoulder = tool.geometry['shoulder-length']
  return hasNeck(tool) && shoulder !== undefined ? shoulder : LCF
}

/**
 * The setup length before the ceiling: what is needed, no shorter than the
 * policy's least, on the policy's step for this tool — the nearest step, or
 * the one above it where the nearest falls short of what is needed.
 */
const steppedTo = (tool: StickoutTool, needed: number, policy: StickoutPolicy): number => {
  const step = tool.unitSystem === 'metric' ? policy.step.metric : policy.step.inch
  const preferred = Math.max(needed, policy.least)
  if (step <= 0) {
    return preferred
  }
  const nearest = Math.round(preferred / step) * step
  return nearest + STICKOUT_TOLERANCE < needed ? nearest + step : nearest
}

/**
 * Every stickout this tool has, in one answer.
 *
 * `null` only when the tool states no flute length, because then nothing about
 * where it stands out of a holder can be worked out at all.
 */
export const stickoutRange = (
  tool: StickoutTool,
  request: StickoutRequest = {},
): StickoutRange | null => {
  const min = minStickout(tool)
  if (min === null) {
    return null
  }
  const {
    grip = null,
    required = null,
    rule = DEFAULT_CLAMPING,
    policy = DEFAULT_STICKOUT_POLICY,
  } = request
  const { OAL } = tool.geometry

  /**
   * The three ways of saying "this much stays in the holder", as three caps on
   * one number. The tightest wins and says its name — which is the whole point
   * of the module: the sheet carries `minimum clamping length` and `good hold`
   * as separate knobs, and before this they capped separate numbers in
   * separate files and nothing ever compared them.
   */
  const caps: Array<{ readonly by: StickoutLimit; readonly at: number }> = []
  if (OAL !== undefined) {
    const clamp = clampWanted(tool.geometry, rule)
    if (clamp !== null) {
      caps.push({ by: 'clamp', at: OAL - clamp })
    }
    if (policy.heldShare > 0) {
      caps.push({ by: 'hold', at: OAL * (1 - policy.heldShare) })
    }
    if (grip !== null) {
      caps.push({ by: 'collet', at: OAL - grip })
    }
  }

  const tightest = caps.reduce<{ readonly by: StickoutLimit; readonly at: number } | null>(
    (best, cap) => (best === null || cap.at < best.at ? cap : best),
    null,
  )
  const gripShort = tightest !== null && tightest.at < min
  const max = tightest === null ? null : round(gripShort ? min : tightest.at)

  const wanted = steppedTo(tool, Math.max(min, required ?? min), policy)
  return {
    min: round(min),
    setup: round(max === null ? wanted : Math.min(wanted, max)),
    max,
    limitedBy: tightest?.by ?? null,
    grip: OAL === undefined ? null : round(Math.max(0, OAL - min)),
    wantedGrip: OAL === undefined || tightest === null ? null : round(OAL - tightest.at),
    gripShort,
  }
}

/**
 * What this tool would be set up at on its own: no holder chosen and no
 * feature to reach. This is `geometry.LBH`, and `build.ts` writes it with
 * exactly this call.
 */
export const setupStickout = (
  tool: StickoutTool,
  rule?: ClampingRule,
  policy?: StickoutPolicy,
): number | null => stickoutRange(tool, { rule, policy })?.setup ?? null

/**
 * The furthest this tool can ever stand out of a holder, mm.
 *
 * **The reach screen's number, not `LBH`.** A tap that will not reach the
 * bottom of a hole at its setup length may reach it pulled further out, and
 * asking `LBH` — which since 2026-09-03 is the setup — would refuse it. Anything
 * asking "could this tool get down there at all" asks this.
 */
export const stickoutCeiling = (
  tool: StickoutTool,
  rule?: ClampingRule,
  policy?: StickoutPolicy,
): number | null => stickoutRange(tool, { rule, policy })?.max ?? null
