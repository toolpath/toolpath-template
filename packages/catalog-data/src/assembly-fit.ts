import type { FeatureDemand, FitFailure } from './fit.js'
import { fitAgainst } from './fit.js'
import { clearance, describeCollision } from './clearance.js'
import {
  assembliesFor,
  withStickout,
  type Assembly,
  type Collet,
  type Holder,
} from './toolholding.js'
import type { CatalogTool } from './types.js'

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

export interface AssemblyFit {
  readonly assembly: Assembly
  readonly fits: boolean
  readonly failures: ReadonlyArray<FitFailure>
}

/**
 * What an assembly check does **not** answer yet, stated so nobody reads a
 * pass as more than it is.
 *
 * - **Holder collision, on a report without a reach curve.** From Engine API
 *   1.0.4 every datasheet carries one and `clearance.ts` sweeps the nose and
 *   the shank over it; an older report is not checked rather than guessed. The
 *   silhouette swept is the catalog's — nose diameter, shank, neck — not a
 *   holder's CAD.
 * - **Deflection.** Reach is geometry; whether a stack at that reach can take
 *   a cut is rigidity, and this package has no force model.
 * - **A bore holder's grip length**, which is why those assemblies use the
 *   whole tool as their stickout and are an upper bound rather than a fact.
 * - **Reach, on an assembly whose collet publishes no grip length.** REGO-FIX's
 *   powRgrip collets do not, so those assemblies carry no stickout and their
 *   reach goes unchecked rather than guessed.
 */
export const NOT_MODELLED = [
  'holder collision without a reach curve',
  'deflection',
  'bore holder grip',
] as const

/**
 * Whether one assembly clears one feature.
 *
 * The cutter's own checks run first and unchanged — an assembly cannot rescue a
 * tool that is too wide. What it adds is reach: the stickout has to clear the
 * whole distance from the part top to the bottom of the feature, because the
 * holder nose cannot go below the top of the part.
 */
export const assemblyAgainst = (assembly: Assembly, demand: FeatureDemand): Array<FitFailure> => {
  const failures = [...fitAgainst(assembly.tool, demand)]

  // An unstated stickout is not checked, the same rule the cutter checks
  // follow: what nobody has said is not a limit anybody can be held to.
  if (
    assembly.stickout !== null &&
    demand.reachBelowTop !== undefined &&
    assembly.stickout < demand.reachBelowTop
  ) {
    failures.push({
      featureTag: demand.featureTag,
      reason: `${assembly.stickout.toFixed(1)} mm of stickout does not clear ${demand.reachBelowTop.toFixed(1)} mm below the part top`,
    })
  }

  // The material around the feature, where the report states it: the holder
  // nose and the shank are swept over the reach curve, and each thing they
  // meet is its own reason.
  if (demand.reachCurve) {
    for (const collision of clearance(assembly, demand.reachCurve).collisions) {
      failures.push({ featureTag: demand.featureTag, reason: describeCollision(collision) })
    }
  }

  return failures
}

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
