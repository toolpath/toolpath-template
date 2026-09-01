import type { PartFeature } from '@toolpath/part-contracts'
import type { CatalogTool } from '@toolpath/catalog-data'
import type { Format, Verdict } from './judge'
import type { Knob } from './rules'
import { fittingTools } from './tool-fit'
import { holeAt, makersFor, type HoleGroup } from './hole-mode'
import { drillFor, type HoleMode, type ThreadSpec } from './threads'

/**
 * A plan for every hole on the part, one row per size.
 *
 * The second half of hole mode (Paul, 2026-08-31): with nothing selected, the
 * part is read as its holes — grouped by size, each group given the tool that
 * makes it. It is the same judging the list does, asked once per group instead
 * of once per click.
 *
 * **A drill first.** Where nothing in the crib drills a size, an end mill that
 * can interpolate it is offered instead and marked, because "no tool" is worse
 * information than "not a drill". What the filters say is final either way:
 * they are given the tools before this sees them, so a shop that filtered to
 * drills gets drills or nothing.
 */
export interface HolePlanRow {
  readonly group: HoleGroup
  /** How it is made: plain, cut tap, form tap or thread mill. */
  readonly mode: HoleMode
  /** The thread it is for, or null for a plain hole. */
  readonly thread: ThreadSpec | null
  /**
   * What drills it, best first — the rules' own order, drills before anything
   * else. Empty means nothing offered fits.
   */
  readonly drills: ReadonlyArray<Verdict>
  /** True when the drills above are not drills: no drill fit, so a mill stands in. */
  readonly interpolated: boolean
  /** What makes the thread — taps, or thread mills; empty for a plain hole. */
  readonly makers: ReadonlyArray<CatalogTool>
}

/** How a group of holes is made, as somebody said. */
export interface GroupChoice {
  readonly mode: HoleMode
  readonly spec: ThreadSpec | null
}

/**
 * @param groups the part's holes, by size
 * @param threads what somebody has said each group is threaded for, by group key
 * @param tools the tools to choose among — **already filtered**
 * @param features every feature on the part, so reach is measured from its top
 */
export const holePlan = (
  groups: ReadonlyArray<HoleGroup>,
  threads: Readonly<Record<string, GroupChoice>>,
  tools: ReadonlyArray<CatalogTool>,
  features: ReadonlyArray<PartFeature>,
  format?: Format,
  knobs?: ReadonlyArray<Knob>,
): Array<HolePlanRow> =>
  groups.map((group) => {
    const choice = threads[group.key] ?? { mode: 'plain' as const, spec: null }
    const thread = choice.spec
    /**
     * The deepest hole of the size decides the tool, and a threaded one is
     * drilled at the size **its own mode** starts from — a form tap wants a
     * bigger hole than a cut tap, and a thread mill the minor diameter.
     */
    const deepest = group.features[0]
    const bore = thread === null ? null : drillFor(thread, choice.mode)
    const stand = deepest === undefined ? null : bore === null ? deepest : holeAt(deepest, bore)
    const { fitting } =
      stand === null
        ? { fitting: [] as ReadonlyArray<Verdict> }
        : fittingTools([stand], features, tools, format, knobs)
    const drills = fitting.filter((each) => each.tool.form === 'drill')
    /**
     * **A tapped hole is drilled.** The fallback to a mill that can
     * interpolate the bore is for a plain hole, where "not a drill" beats "no
     * tool"; a thread needs the hole at size before the tap goes near it, so
     * a threaded group offers drills or nothing (Paul, 2026-08-31).
     */
    const milled = choice.mode === 'plain' && drills.length === 0 && fitting.length > 0
    return {
      group,
      mode: choice.mode,
      thread,
      drills: drills.length > 0 ? drills : milled ? fitting : [],
      interpolated: milled,
      makers: thread === null ? [] : makersFor(thread, choice.mode, tools).made,
    }
  })
