import type { PartFeature } from '@toolpath/part-contracts'
import type { CatalogTool } from '@toolpath/catalog-data'
import { allTools } from './catalog.js'
import { foldOnto, judgeTools, orderVerdicts, type Format, type Verdict } from './judge'
import type { Knob } from './rules'
import { sheetOf } from './feature-defaults'
import { filterTools, type ToolQuery } from './filter'
import { holdableTools, splitHolding } from './holding'
import { columnOfRule } from './tool-marks'

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
 * @param asked the forms the filter asks for, which the type table lets past —
 *   `judge.ts` § `JudgeOptions.asked` says why, and `formsAsking`
 *   (`shared/tool-type.ts`) is what a tick on the Type column writes
 *
 * **A group is judged question by question, folding as it goes** (Paul,
 * 2026-09-08: "this is a 42 tool group. We should optimize for up to 150 or
 * so"). Two things made a group cost what it did: every feature judged the whole
 * catalog, and every feature's verdicts were held to be folded at the end — 42
 * passes over 9,000 tools, and a 150-hole group exhausted the worker's heap
 * outright. So {@link distinctQuestions} asks each question once, and a tool a
 * question removes is out of the next one's candidates: what stands is what
 * every question kept.
 *
 * The trade, stated where it is made: a removed tool carries the reasons of the
 * question that removed it and not the rest of the group's. `ruleTally` and the
 * panel read only the first anyway, and a near miss is then measured against the
 * feature that turned it down — which is the one somebody is looking at.
 */
/**
 * The question a feature asks of a tool, as a value.
 *
 * **Four identical holes are one question, and were being asked four times**
 * (2026-09-08, measured: a `×4` bolt circle cost 435 ms an answer against the
 * scraped catalog where one hole cost 110 ms). `judgeTools` reads a feature
 * through exactly two things — its `featureType`, which picks the sheet rows and
 * the type table, and its {@link sheetOf} reading, which is every number those
 * rows are measured against, including the reach curve. Two features equal in
 * both cannot be told apart by any rule, so judging the second is arithmetic
 * already done.
 *
 * A group of identical holes is the ordinary case: the page groups a bolt circle
 * as one row precisely because it is one decision. A group somebody built by
 * hand out of genuinely different features still judges each of them.
 *
 * The stringify is per feature, not per tool — four of them against 9,000 tools
 * judged — so it costs nothing worth measuring.
 */
const questionOf = (feature: PartFeature, all: ReadonlyArray<PartFeature>): string =>
  JSON.stringify([feature.featureType, sheetOf(feature, all)])

/** One feature per distinct question, in the order they were selected. */
export const distinctQuestions = (
  selected: ReadonlyArray<PartFeature>,
  all: ReadonlyArray<PartFeature>,
): Array<PartFeature> => {
  const seen = new Set<string>()
  return selected.filter((feature) => {
    const question = questionOf(feature, all)
    if (seen.has(question)) {
      return false
    }
    seen.add(question)
    return true
  })
}

export const fittingTools = (
  selected: ReadonlyArray<PartFeature>,
  all: ReadonlyArray<PartFeature> = selected,
  tools: ReadonlyArray<CatalogTool> = allTools,
  format?: Format,
  knobs?: ReadonlyArray<Knob>,
  asked?: ReadonlyArray<string>,
): Fitting => {
  if (selected.length === 0) {
    return { fitting: [], excluded: [] }
  }
  const options = {
    ...(format ? { format } : {}),
    ...(knobs ? { knobs } : {}),
    ...(asked ? { asked } : {}),
  }
  const excluded: Array<Verdict> = []
  let standing: Array<Verdict> = []
  let candidates = tools
  for (const [at, feature] of distinctQuestions(selected, all).entries()) {
    const judged = judgeTools(candidates, feature, all, options)
    const next: Array<Verdict> = []
    for (const [index, verdict] of judged.entries()) {
      // Aligned by construction: `candidates` is the previous round's survivors
      // in order, and `judgeTools` answers in the order it is given.
      const before = standing[index]
      const folded = at === 0 || before === undefined ? verdict : foldOnto(before, verdict)
      if (folded.removed.length > 0) {
        excluded.push(folded)
      } else {
        next.push(folded)
      }
    }
    standing = next
    candidates = next.map((verdict) => verdict.tool)
  }
  return { fitting: orderVerdicts(standing), excluded }
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

/**
 * How far outside the rules a removed tool is, for ordering an override list.
 *
 * The same measure {@link closestMisses} ranks on, with the one difference that
 * matters here: a tool no rule *measured* is not a near miss by any distance,
 * so it sorts behind every tool that missed by a number rather than being
 * dropped.
 */
const missBy = (verdict: Verdict): number =>
  verdict.removed.every((reason) => reason.shortfall !== undefined)
    ? Math.max(0, ...verdict.removed.map((reason) => reason.shortfall ?? 0))
    : Number.POSITIVE_INFINITY

/**
 * The columns a removed tool would have to be forgiven on, or nothing.
 *
 * `null` where any one of its reasons is not a column's question at all — the
 * wrong kind of tool for the feature, a rank row. Those cannot be set aside by
 * widening a filter, because there is no filter that asks them.
 */
const columnsBlocking = (verdict: Verdict): ReadonlySet<string> | null => {
  const codes = new Set<string>()
  for (const reason of verdict.removed) {
    const code = columnOfRule(reason.rule)
    if (code === null) {
      return null
    }
    codes.add(code)
  }
  return codes.size === 0 ? null : codes
}

/**
 * How many tools each column alone is keeping off the list.
 *
 * **What a filter offers to forgive has to be counted before it forgives it**
 * (Paul, 2026-09-08: "the override the rules button should be in the filter
 * dialog … and should only override for that specific rule"). The Diameter
 * dialog says how many tools the diameter rows are holding back, and it can
 * only say that while the whole removed set still exists — which is here, in
 * the worker, and not on the far side of a capped list.
 *
 * Counted for a tool only one column blocks. A cutter turned down on both its
 * diameter and its flute length is not brought back by forgiving either on its
 * own, so counting it under both would promise a row that never appears.
 */
export const overridableTally = (
  excluded: ReadonlyArray<Verdict>,
  admitted: ReadonlySet<string>,
): Record<string, number> => {
  const counts: Record<string, number> = {}
  for (const verdict of excluded) {
    if (!admitted.has(verdict.tool.guid)) {
      continue
    }
    const codes = columnsBlocking(verdict)
    const only = codes === null || codes.size !== 1 ? null : [...codes][0]
    if (only !== undefined && only !== null) {
      counts[only] = (counts[only] ?? 0) + 1
    }
  }
  return counts
}

/**
 * The removed tools a set of forgiven columns puts back — what an override
 * offers.
 *
 * **A filter is the last word, and a filter that answers "nothing" is not an
 * answer** (Paul, 2026-09-08: "I may want to use a larger tool than required …
 * when I change the filter, it currently shows me 'no tools match'"). The
 * suggested ranges come off the rules, so widening one asks for exactly the
 * tools the rules go on to remove — and the two together left an empty table
 * with no way through it.
 *
 * **One column at a time.** Forgiving the diameter does not forgive the flute
 * length: a tool is here only when every row that removed it belongs to a
 * column somebody has overridden, so widening one bound never quietly admits a
 * tool that fails a rule nobody looked at.
 *
 * Not {@link closeCandidates}, which deliberately drops the ranges because
 * "close" is a tool a little outside them. This is the opposite question: the
 * ranges are the person's own, so they are the whole of what is admitted.
 * Nearest first, so a widened bound offers the next size up before the largest
 * cutter in the catalog.
 */
const forgivenBy = (
  admitted: ReadonlySet<string>,
  overrides: ReadonlyArray<string>,
): ((verdict: Verdict) => boolean) => {
  const forgiven = new Set(overrides)
  return (verdict) => {
    if (!admitted.has(verdict.tool.guid)) {
      return false
    }
    const codes = columnsBlocking(verdict)
    return codes !== null && [...codes].every((code) => forgiven.has(code))
  }
}

export const overridableTools = (
  excluded: ReadonlyArray<Verdict>,
  admitted: ReadonlySet<string>,
  overrides: ReadonlyArray<string>,
  cap: number,
): Array<Verdict> => {
  if (overrides.length === 0) {
    return []
  }
  return excluded
    .filter(forgivenBy(admitted, overrides))
    .map((verdict) => ({ verdict, miss: missBy(verdict) }))
    .sort((a, b) => a.miss - b.miss)
    .slice(0, Math.max(0, cap))
    .map((each) => each.verdict)
}

/**
 * How many {@link overridableTools} would return uncapped.
 *
 * Counted rather than taken off the capped list, so a truncated answer can say
 * what it is not showing — the rule this page follows everywhere a list is
 * narrowed. Filtering without the sort, because a count has no order.
 */
export const overridableCount = (
  excluded: ReadonlyArray<Verdict>,
  admitted: ReadonlySet<string>,
  overrides: ReadonlyArray<string>,
): number => (overrides.length === 0 ? 0 : excluded.filter(forgivenBy(admitted, overrides)).length)
