import type { ReachCurve } from '@toolpath/part-contracts'
import {
  clearance,
  colletsFor,
  holdBand,
  stickoutLimits,
  type Assembly,
  type CatalogTool,
  type Collet,
  type Collision,
  type HoldBand,
  type Holder,
  type Margins,
  type StickoutLimits,
} from '@toolpath/catalog-data'
import { collets as allCollets, holders as allHolders } from './catalog'
import { policyOf, type HoldThresholds } from './holder-choice'
import { atLeastFloor, withLeastFor } from './stickout-floor'

/**
 * The assembly the page draws, built once from what was picked.
 *
 * The drawing card and the 3D viewer show the same stack, so the stack is
 * worked out here and handed to both — the card used to build it inline,
 * and a second copy in the page would be a divergence with a delay on it.
 */
export interface DrawnAssembly {
  readonly holder: Holder | null
  /** The collet drawn: the one picked, or the first that fits a collet chuck. */
  readonly collet: Collet | null
  /** What the holder needs to clear the part by the margins, or null without a curve or holder. */
  readonly required: number | null
  readonly limits: StickoutLimits | null
  /** The least stickout that works for this feature: the flutes out, or what the holder needs. */
  readonly least: number | null
  /** True when the holder needs more than the tool allows. */
  readonly overLimit: boolean
  readonly stickout: number | null
  readonly band: HoldBand | null
  readonly assembly: Assembly | null
  /** What collides at this stickout, from the sweep; empty without a curve. */
  readonly collisions: ReadonlyArray<Collision>
}

export interface DrawnSelection {
  readonly holder: string | null
  readonly collet: string | null
  readonly stickout: number | null
}

export const drawnAssembly = (
  tool: CatalogTool,
  selection: DrawnSelection,
  curve: ReachCurve | null,
  margins: Margins,
  thresholds: HoldThresholds,
  holders: ReadonlyArray<Holder> = allHolders,
  collets: ReadonlyArray<Collet> = allCollets,
): DrawnAssembly => {
  const holder = holders.find((each) => each.guid === selection.holder) ?? null
  const picked = collets.find((each) => each.guid === selection.collet) ?? null
  const collet = picked ?? (holder === null ? null : (colletsFor(tool, holder, collets)[0] ?? null))
  const required =
    holder !== null && curve !== null
      ? clearance({ tool, holder, collet, stickout: 0 }, curve, margins).requiredStickout
      : null
  const limits = stickoutLimits(
    tool,
    picked,
    required,
    withLeastFor(policyOf(thresholds), tool.geometry),
  )
  const least = limits === null ? null : Math.max(limits.min, required ?? limits.min)
  const overLimit = least !== null && limits?.max != null && least > limits.max + 1e-6
  const stickout =
    limits === null
      ? null
      : Math.min(
          Math.max(
            selection.stickout ??
              atLeastFloor(limits.setup, tool.geometry, {
                floor: policyOf(thresholds).least,
                ceiling: limits.max,
              }) ??
              limits.setup,
            limits.min,
          ),
          limits.max ?? Number.POSITIVE_INFINITY,
        )
  const band = stickout === null ? null : holdBand(tool, stickout, thresholds)
  const assembly: Assembly | null =
    holder === null ? null : { tool, holder, collet, stickout, maxStickout: limits?.max ?? null }
  const collisions = assembly && curve ? clearance(assembly, curve, margins).collisions : []
  return {
    holder,
    collet,
    required,
    limits,
    least,
    overLimit,
    stickout,
    band,
    assembly,
    collisions,
  }
}

/**
 * What the list's **Length below holder** column says about one candidate.
 *
 * The column used to print `geometry.LBH`, which is the length a tool would be
 * set up at with **no holder and no feature** — the one figure `stickout.ts`
 * says is that same function asked with no arguments. Beside a stack that had a
 * holder in it and a pocket to reach down into, that was a wrong number rather
 * than an incomplete one (Paul, 2026-09-08: "we can plainly see that more of
 * the tool is beneath the holder"): the panel drew the tool 2.125 in out and
 * the row beside it read 0.625 in.
 *
 * There was machinery for this and the tree walked away from it. The column
 * asked `Holding.requiredStickout`, which reads the holder somebody picked in a
 * dropdown *on the row* — and the dropdowns came out on 2026-09-08 when the
 * assembly tree took over, so nothing has set that holder since and every row
 * fell back to the tool's own figure. The holder is the stack's now, so the
 * question is asked of the stack once instead of per row.
 *
 * Null with no holder in the stack, which is the column falling back to the
 * tool's own setup length — the honest answer while nothing holds it.
 */
export interface BelowHolder {
  /** The length the tool stands below the nose in this stack, mm: the column's number. */
  readonly length: number | null
  /** The least that clears the part by the shop's margins, mm. */
  readonly needs: number | null
  /** The furthest this tool can stand out and keep hold, mm; null where nothing caps it. */
  readonly most: number | null
  /** True when what clearing needs is more than the tool can be set out at. */
  readonly overLimit: boolean
}

/**
 * One candidate tool, in the stack that is open.
 *
 * `drawnAssembly` and nothing else, so the number in the row is the number on
 * the drawing beside it — the four-way disagreement `stickout.ts` was written
 * to end started as two of these worked out in two places.
 */
export const belowHolder = (
  tool: CatalogTool,
  stack: { readonly holder: Holder | null; readonly collet: Collet | null },
  curve: ReachCurve | null,
  margins: Margins,
  thresholds: HoldThresholds,
  collets: ReadonlyArray<Collet> = allCollets,
): BelowHolder | null => {
  if (stack.holder === null) {
    return null
  }
  const drawn = drawnAssembly(
    tool,
    { holder: stack.holder.guid, collet: stack.collet?.guid ?? null, stickout: null },
    curve,
    margins,
    thresholds,
    [stack.holder],
    collets,
  )
  return {
    length: drawn.stickout,
    needs: drawn.least,
    most: drawn.limits?.max ?? null,
    overLimit: drawn.overLimit,
  }
}
