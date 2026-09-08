import type { PartFeature } from '@toolpath/part-contracts'
import type { CatalogTool } from '@toolpath/catalog-data'
import { allTools } from './catalog.js'
import {
  foldVerdicts,
  judgeTools,
  orderVerdicts,
  removedFrom,
  type Format,
  type Verdict,
} from './judge'
import type { Knob } from './rules'
import { filterTools, type ToolQuery } from './filter'
import { holdableTools, splitHolding } from './holding'

/**
 * The catalog, judged against a selection of features by the rules sheet.
 *
 * The judging is `judge.ts` and is tested there against literals; this is the
 * binding to the bundled catalog, the same thin layer `catalog.ts` is over the
 * dataset. Reach is measured from the part top, so the whole feature list goes
 * in even when three of them are selected.
 */
export interface Fitting {
  /**
   * Every tool no feature removed, in the sheet's order: what fits, then what
   * was warned, then what was demoted — each by the rank rows of the first
   * selected feature.
   */
  readonly fitting: ReadonlyArray<Verdict>
  /**
   * Tools ruled out, each with the rules that ruled it out.
   *
   * Kept rather than discarded: "nothing fits" is only actionable when it says
   * which feature is doing the excluding, and by how much.
   */
  readonly excluded: ReadonlyArray<Verdict>
}

/**
 * @param selected what the person picked
 * @param all every feature on the part, so reach is measured from the part top
 * @param format words the numbers in the person's unit
 * @param knobs the sheet's knobs, with the clearances entered on the page
 */
export const fittingTools = (
  selected: ReadonlyArray<PartFeature>,
  all: ReadonlyArray<PartFeature> = selected,
  tools: ReadonlyArray<CatalogTool> = allTools,
  format?: Format,
  knobs?: ReadonlyArray<Knob>,
): Fitting => {
  if (selected.length === 0) {
    return { fitting: [], excluded: [] }
  }
  const verdicts = foldVerdicts(
    selected.map((feature) =>
      judgeTools(tools, feature, all, {
        ...(format ? { format } : {}),
        ...(knobs ? { knobs } : {}),
      }),
    ),
  )
  return { fitting: orderVerdicts(verdicts), excluded: removedFrom(verdicts) }
}

/**
 * The removed tools still inside the person's discrete choices — brand, type,
 * shank, the crib — so the list's fill never shows a tool they filtered out.
 * The ranges are left aside: they are the rules' bounds, and "close" is
 * exactly a tool a little outside them.
 */
export const closeCandidates = (
  excluded: ReadonlyArray<Verdict>,
  query: ToolQuery,
): Array<Verdict> => {
  const { tools: toolQuery, holding } = splitHolding(query)
  const kept = new Set(
    holdableTools(
      filterTools(
        excluded.map((verdict) => verdict.tool),
        { ...toolQuery, ranges: {} },
      ),
      holding,
    ).map((each) => each.guid),
  )
  return excluded.filter((verdict) => kept.has(verdict.tool.guid))
}

/**
 * How many tools each rule was the first to remove, by the rule's own text.
 *
 * **A tally rather than the verdicts** because the verdicts do not survive the
 * worker boundary: a drill question removes ~37,000 tools and only the nearest
 * few dozen are worth sending, so the count that {@link tightestOf} reads is
 * taken where the whole set still exists (2026-09-07). Named by its text — the
 * sheet row as written — so an answer can say "diameter <= largest tool
 * diameter is what rules them out" rather than only which feature.
 */
export const ruleTally = (excluded: ReadonlyArray<Verdict>): Record<string, number> => {
  const counts: Record<string, number> = {}
  for (const verdict of excluded) {
    const first = verdict.removed[0]
    if (first) {
      const name = first.rule?.text ?? 'the tool types this feature considers'
      counts[name] = (counts[name] ?? 0) + 1
    }
  }
  return counts
}

/** Which rule excluded the most tools: the one to reconsider first. */
export const tightestOf = (tally: Readonly<Record<string, number>>): string | null => {
  let worst: string | null = null
  let most = 0
  for (const [name, count] of Object.entries(tally)) {
    if (count > most) {
      worst = name
      most = count
    }
  }
  return worst
}

/** The same answer from the verdicts themselves, for a caller that holds them all. */
export const tightestRule = (excluded: ReadonlyArray<Verdict>): string | null =>
  tightestOf(ruleTally(excluded))
