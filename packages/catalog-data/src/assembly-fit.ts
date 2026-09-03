import { assemblyAgainst, type AssemblyFit as SharedAssemblyFit } from '@toolpath/tool-support'

import type { FeatureDemand, FitFailure } from './fit.js'
import { fitAgainst } from './fit.js'
import {
  assembliesFor,
  withStickout,
  type Assembly,
  type Collet,
  type Holder,
} from './toolholding.js'
import type { CatalogTool } from './types.js'

/**
 * Whether one assembly clears one feature.
 *
 * `@toolpath/tool-support`'s. What stays below is the pair that builds a crib
 * out of holder and collet lists and orders the result, which is catalog
 * composition rather than domain arithmetic.
 */
export { assemblyAgainst, NOT_MODELLED } from '@toolpath/tool-support'

/**
 * Whether the whole stack reaches, not just the cutter.
 *
 * `fit.ts` answers "could this cutter cut this feature". This answers the
 * question a shop actually acts on: **is there a way to hold it that reaches**.
 * The two are different often enough to matter — a 3 mm end mill with 20 mm of
 * flute clears a 15 mm pocket on its own, and fails the moment the only collet
 * that grips a 3 mm shank leaves 12 mm standing out of the holder.
 *
 * This is deliberately thin, and everything it does not model is named in
 * {@link NOT_MODELLED} rather than left for somebody to discover.
 */

export type AssemblyFit = SharedAssemblyFit<Assembly>

/**
 * Every assembly that cuts every selected feature, shortest stickout first.
 *
 * Shortest first because the shortest stack that reaches is the rigid one, and
 * rigidity is the thing a shop gives up last.
 */
export const assembliesForFeatures = (
  tools: ReadonlyArray<CatalogTool>,
  holders: ReadonlyArray<Holder>,
  collets: ReadonlyArray<Collet>,
  demands: ReadonlyArray<FeatureDemand>,
  taper?: string,
): Array<AssemblyFit> => {
  // Pulled out as far as the deepest feature needs, within what the tool and
  // the grip allow: a stack starts at the flutes and is stood out to reach,
  // not offered at a stickout it cannot cut from.
  const needed = Math.max(0, ...demands.map((demand) => demand.reachBelowTop ?? 0))
  const fits: Array<AssemblyFit> = []

  for (const tool of tools) {
    for (const found of assembliesFor(tool, holders, collets, taper)) {
      const assembly =
        found.stickout === null ? found : withStickout(found, Math.max(found.stickout, needed))
      const failures = demands.flatMap((demand) => assemblyAgainst(assembly, demand))
      fits.push({ assembly, fits: failures.length === 0, failures })
    }
  }

  return fits.sort((a, b) => {
    if (a.assembly.stickout === null) {
      return b.assembly.stickout === null ? 0 : 1
    }
    if (b.assembly.stickout === null) {
      return -1
    }
    return a.assembly.stickout - b.assembly.stickout
  })
}

/**
 * A tool that fits but cannot be held: the answer a cutter-only check hides.
 *
 * Worth surfacing on its own, because it is not the same problem as a tool
 * being too wide — it is a gap in the crib, and it is fixed by buying a collet
 * rather than by choosing another cutter.
 */
export const unholdableTools = (
  tools: ReadonlyArray<CatalogTool>,
  holders: ReadonlyArray<Holder>,
  collets: ReadonlyArray<Collet>,
  demands: ReadonlyArray<FeatureDemand>,
  taper?: string,
): Array<CatalogTool> =>
  tools.filter(
    (tool) =>
      demands.every((demand) => fitAgainst(tool, demand).length === 0) &&
      assembliesFor(tool, holders, collets, taper).length === 0,
  )
