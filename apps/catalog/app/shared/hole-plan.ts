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
 * **Hole tools only** (Paul, 2026-09-01). Reading a part as its holes is asking
 * what drills and taps it needs, so that is what is judged: an end mill is not
 * an answer to "what makes this hole" until no drill is. It is also most of
 * the speed — 600 drills and taps against 17,000 tools, once per size.
 *
 * **And then the end mills, as their own list.** Where nothing drills a size,
 * the mills that could interpolate the bore are offered *beside* the empty
 * drill cell rather than inside it: "no compatible drills, see end mills" is
 * the true sentence, and standing a mill in the drill's place said something
 * else.
 */
export interface HolePlanRow {
  readonly group: HoleGroup
  /** How it is made: plain, cut tap, form tap or thread mill. */
  readonly mode: HoleMode
  /** The thread it is for, or null for a plain hole. */
  readonly thread: ThreadSpec | null
  /** What drills it, best first. Empty means no drill in the catalog fits. */
  readonly drills: ReadonlyArray<Verdict>
  /**
   * The end mills that could interpolate the bore, best first.
   *
   * Only worked out when no drill fits — otherwise it is a list nobody asked
   * for, judged over the whole catalog once per size.
   */
  readonly endMills: ReadonlyArray<Verdict>
  /** True when the row is offering mills because no drill fits. */
  readonly interpolated: boolean
  /** What makes the thread — taps, or thread mills; empty for a plain hole. */
  readonly makers: ReadonlyArray<CatalogTool>
}

/**
 * The forms that make a hole: what a drill list and a tap list are drawn from.
 *
 * Everything else is judged for nothing — most of a 17,000-tool catalog is end
 * mills, and none of them is an answer to "what drills this".
 */
const HOLE_FORMS: ReadonlySet<string> = new Set([
  'drill',
  'center drill',
  'spot drill',
  'reamer',
  'tap right hand',
  'tap left hand',
  'thread mill',
])

const holeMakers = (tools: ReadonlyArray<CatalogTool>): Array<CatalogTool> =>
  tools.filter((each) => HOLE_FORMS.has(each.form))

/** The mills that could interpolate a bore, for the row that has no drill. */
const MILL_FORMS: ReadonlySet<string> = new Set([
  'flat end mill',
  'bull nose end mill',
  'ball end mill',
])

const millsIn = (tools: ReadonlyArray<CatalogTool>): Array<CatalogTool> =>
  tools.filter((each) => MILL_FORMS.has(each.form))

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
        : fittingTools([stand], features, holeMakers(tools), format, knobs)
    const drills = fitting.filter((each) => each.tool.form === 'drill')
    /**
     * **A tapped hole is drilled.** A mill that can interpolate the bore is an
     * answer for a plain hole, where "not a drill" beats "no tool"; a thread
     * needs the hole at size before the tap goes near it, so a threaded group
     * offers drills or nothing (Paul, 2026-08-31).
     */
    const mills =
      stand === null || drills.length > 0 || choice.mode !== 'plain'
        ? []
        : fittingTools([stand], features, millsIn(tools), format, knobs).fitting
    return {
      group,
      mode: choice.mode,
      thread,
      drills,
      endMills: mills,
      interpolated: drills.length === 0 && mills.length > 0,
      makers: thread === null ? [] : makersFor(thread, choice.mode, tools).made,
    }
  })
