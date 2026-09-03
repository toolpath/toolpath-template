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
      ? clearance({ tool, holder, collet, stickout: 0, maxStickout: null }, curve, margins)
          .requiredStickout
      : null
  const limits = stickoutLimits(tool, picked, required, policyOf(thresholds))
  const least = limits === null ? null : Math.max(limits.min, required ?? limits.min)
  const overLimit = least !== null && limits?.max != null && least > limits.max + 1e-6
  const stickout =
    limits === null
      ? null
      : Math.min(
          Math.max(selection.stickout ?? limits.setup, limits.min),
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
