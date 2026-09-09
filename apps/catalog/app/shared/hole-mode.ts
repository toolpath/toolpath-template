import type { PartFeature } from '@toolpath/part-contracts'
import {
  TOOL_FORMS,
  stickoutCeiling,
  type CatalogTool,
  type ThreadMethod,
} from '@toolpath/catalog-data'
import { asNumber, asRecord } from '@toolpath/part-contracts/datasheet'
import { partTop } from '@toolpath/part-contracts/measurements'
import { makerOf, methodOf, minorOf, type HoleMode, type ThreadSpec } from './threads'

/**
 * Holes, read as holes.
 *
 * A part's holes are the part of it a shop plans by size rather than by
 * feature: eight ⌀5 × 12 deep is one drill and one line on a bill, whatever
 * the kernel called each of them. This module is that reading — grouping,
 * standing a hole in at another diameter, and finding the tap for a thread —
 * kept pure so the mode above it is a layout rather than a calculation
 * (Paul, 2026-08-31).
 */

/** How deep it goes, in millimetres. */
export const holeDepthOf = (feature: PartFeature): number | null => {
  const sheet = feature.datasheet
  const zMin = asNumber(sheet?.zMin)
  const zMax = asNumber(sheet?.zMax)
  return zMin === null || zMax === null ? null : Math.round((zMax - zMin) * 1000) / 1000
}

/**
 * The bore the model draws for a feature, in millimetres — `null` where it is
 * not a hole at all.
 */
export const boreOf = (feature: PartFeature): number | null =>
  asNumber(asRecord(feature.datasheet?.facts)?.diameter)

/**
 * The holes of one bore among a set of tags.
 *
 * **A thread applies to what is selected, and only to the holes in it** (Paul,
 * 2026-09-09: "only what's selected — but I should be able to apply threads to
 * the full group in the Group dialog if desired"). What is selected can be a
 * group holding a pocket and two bores, and a thread choice written across all
 * of it would name the pocket `M6×1 Pocket` — `threadedName` reads the choice
 * per tag and cannot tell it was never meant for that feature. A tap has one
 * nominal size, so the bore is what says which of them it was meant for.
 *
 * @param diameter the modelled bore, in millimetres, the choice was made against
 */
export const holesAt = (
  features: ReadonlyArray<PartFeature>,
  tags: ReadonlyArray<string>,
  diameter: number,
): Array<string> => {
  const wanted = new Set(tags)
  return features.flatMap((feature) =>
    wanted.has(feature.featureTag) && boreOf(feature) === diameter ? [feature.featureTag] : [],
  )
}

/**
 * The same hole, stood in at another diameter.
 *
 * A threaded hole is drilled at the tap drill, and the model may have been
 * drawn at the minor or the nominal size instead — so the drill is judged
 * against the hole the shop will actually make. Nothing else about the feature
 * changes, which is what keeps the depth, the way up and the reach curve the
 * ones the rules already read.
 */
export const holeAt = (feature: PartFeature, diameter: number): PartFeature => {
  const sheet = (feature.datasheet ?? {}) as Record<string, unknown>
  const facts = asRecord(sheet.facts) ?? {}
  const bore = asNumber(facts.diameter)
  const endMillCap = asNumber(facts.maxEndmillDiameter)
  return {
    ...feature,
    datasheet: {
      ...sheet,
      facts: {
        ...facts,
        diameter,
        /**
         * **The drill limit is the bore too** (Paul, 2026-09-01: "near miss
         * drills are too large even though they are smaller than the form tap
         * it shows? Hole diameter = 0.110", form tap predrill = 0.122", drill
         * diameter is 0.116" and it's too large?").
         *
         * The kernel states `maxDrillDiameter` for the hole it was given, and
         * the rules read that before the diameter — so standing the hole in at
         * the tap drill moved one number and left the one the rule actually
         * uses at the modelled size. Every drill between the model and the
         * bore came back "too large".
         */
        ...(facts.maxDrillDiameter === undefined ? {} : { maxDrillDiameter: diameter }),
        /**
         * **And so is the end mill limit** (Paul, 2026-09-02, asking for an
         * end mill to be usable in place of a drill).
         *
         * The kernel states `maxEndmillDiameter` for the bore it was given —
         * short of the bore itself, because an end mill has to helix down
         * inside it — and it is the number `largest end mill diameter` reads.
         * Standing the hole in at the predrill without it would judge a mill
         * against the modelled bore while every drill beside it was judged
         * against the predrill, which is the defect the line above fixes for
         * drills.
         *
         * Rescaled rather than recomputed: the kernel's own allowance is a
         * proportion of the bore, and this repository does not know how it
         * was arrived at. What it can say is that the same proportion of a
         * different bore is the same claim about a different hole.
         */
        ...(bore === null || bore === 0 || endMillCap === null
          ? {}
          : { maxEndmillDiameter: (endMillCap * diameter) / bore }),
      },
    },
  } as PartFeature
}

/**
 * Whether a form is a tap.
 *
 * **The space matters.** `startsWith('tap')` also catches `tapered mill`,
 * which is a milling cutter — so `tapsFor` was offering one as a tap for a
 * thread whose nominal size it happened to match (found 2026-09-02, adding the
 * taps to the type filter).
 */
const isTap = (form: string): boolean => form.startsWith('tap ')

/**
 * The tool forms a threaded hole is made with: the drill that makes the hole,
 * and the taps that cut the thread.
 *
 * **Saying a hole is threaded says which tools it takes** (Paul, 2026-09-02:
 * "tap is not automatically added to tool type filter when I define a hole as
 * threaded. It should be"). Choosing cut or form tap wrote `drill` into the
 * type filter and nothing else, so the taps the same choice asks for were
 * outside what the filters admitted.
 *
 * Read off {@link TOOL_FORMS} by the same rule {@link tapsFor} uses — a form
 * whose name begins with `tap` — so a hand this catalog does not hold yet
 * arrives without anybody editing a list.
 */
export const THREADED_FORMS: ReadonlyArray<string> = [
  'drill',
  ...TOOL_FORMS.filter((form) => isTap(form.value)).map((form) => form.value),
]

/**
 * The end mills that can make a hole in place of a drill.
 *
 * **A predrill is a hole, and a hole can be interpolated** (Paul, 2026-09-02:
 * "I need to be able to use an end mill on a threaded hole in place of a
 * drill"). The rules sheet already says so — `*Hole` ranks `drill; flat end
 * mill; bull nose end mill; ball end mill` and caps a mill at the largest end
 * mill diameter, which is short of the bore because it has to helix down
 * inside it. What kept them off a threaded hole's list was this application:
 * choosing a thread writes {@link THREADED_FORMS} into the filters, and the
 * list is drills-only besides.
 *
 * The two flat-bottomed forms and no more: a ball nose leaves a round bottom
 * in a hole meant to be tapped, and it is the last of the four the sheet ranks.
 */
export const PREDRILL_MILL_FORMS: ReadonlyArray<string> = ['flat end mill', 'bull nose end mill']

/**
 * The forms a threaded hole's filter must hold, whatever else is written.
 *
 * **The thread's forms outrank a suggestion** (Paul, 2026-09-09: "the tap type
 * is no longer automatically being enabled in tapped holes. It needs to be to
 * show the taps!"). A feature's own row says a hole is drilled — true before
 * anybody threads it — and `applySuggestions` overrules the `form` axis
 * outright, so any write triggered after the thread was chosen erased the taps
 * that choosing it had added. The tap list reads that axis, so the taps
 * vanished from a hole whose whole question was which tap.
 *
 * `held` is what the filter holds now, and the predrill mills in it survive:
 * without that, this rule and the one that turns the mills on when no drill
 * fits would take turns undoing each other.
 */
export const threadedFormsWith = (held: ReadonlyArray<string>): Array<string> => [
  ...THREADED_FORMS,
  ...millsShown(held),
]

/**
 * The form filter with the predrilling mills added or taken away.
 *
 * The button is a **filter**, not a second list: the filters are the last word
 * on what a list holds, so a shop that turns the mills on can see them in the
 * rail and turn them off there too (Paul, 2026-08-31, on why a threaded hole
 * writes its forms into the filters rather than hiding the rest).
 */
export const millsShown = (forms: ReadonlyArray<string>): Array<string> =>
  PREDRILL_MILL_FORMS.filter((form) => forms.includes(form))

/**
 * What the button says, which is what the filter says.
 *
 * **The filter is the switch** (Paul, 2026-09-02: "end mills should also show
 * if I enable them in the top level filter, and the button should highlight —
 * if only one type is shown, it should say 'showing <flat, or whatever type>
 * end mills'"). Ticking one form on the rail is the same act as pressing this,
 * so the button reads its state off the same place and names what is actually
 * on rather than claiming both.
 */
export const millsLabel = (forms: ReadonlyArray<string>): string => {
  const on = millsShown(forms)
  if (on.length === 0) {
    return 'Show compatible endmills'
  }
  if (on.length === PREDRILL_MILL_FORMS.length) {
    return 'Showing end mills'
  }
  return `Showing ${on[0] ?? ''}s`
}

/**
 * The forms the drill half of a threaded hole may show: drills, and whatever
 * other cutter the filter is asking for.
 *
 * **A tapped hole is drilled, but the filter says with what** (Paul,
 * 2026-09-08: "End mills are technically a valid tool to predrill for the tap,
 * just usually not the first choice"). The rule this replaces was `drill` plus
 * {@link PREDRILL_MILL_FORMS} — the two forms the predrill press writes — so a
 * type asked for in the Type column was judged, fitted, and then dropped by the
 * list on its way to the screen, with nothing on the page saying why.
 *
 * The taps are still out of it: they are the other half of the same feature and
 * have a list of their own, so a tap on the drill list would be the same tool
 * offered twice. Drills still lead, which is {@link drillsFirst}.
 */
export const predrillFormsOf = (forms: ReadonlyArray<string>): Array<string> => [
  'drill',
  ...forms.filter((form) => form !== 'drill' && !isTap(form)),
]

export const formsWithMills = (forms: ReadonlyArray<string>, on: boolean): Array<string> =>
  on
    ? [...forms, ...PREDRILL_MILL_FORMS.filter((form) => !forms.includes(form))]
    : forms.filter((form) => !PREDRILL_MILL_FORMS.includes(form))

/**
 * The forms the drill half of a threaded hole's list shows, drills first.
 *
 * **Drills lead, always** (Paul, 2026-09-02: "it should always show drills
 * first by default"). A mill that lands exactly on the predrill would outrank
 * every drill on the sheet's own "closest to the hole diameter" row, and the
 * shop rule is that a hole up to an inch is drilled — the sheet says so as a
 * `prefer`. So the mills follow the drills rather than being ranked among
 * them, each half in the order the rules put it.
 */
export const drillsFirst = <T extends { readonly form: string }>(
  tools: ReadonlyArray<T>,
): Array<T> => [
  ...tools.filter((each) => each.form === 'drill'),
  ...tools.filter((each) => each.form !== 'drill'),
]

/** How far a tap's own diameter may be from the thread's, in millimetres. */
const TAP_WITHIN = 0.2

/**
 * The two numbers the thread and the hole put on a tap, as bounds.
 *
 * **What swept the list, said in the columns it swept on** (Paul, 2026-09-09:
 * "shouldn't thread diameter and thread length be applied from the thread spec
 * and model feature/group depth respectively?"). Both were already applied —
 * {@link tapsFor} takes the diameter band and {@link reaches} the cutting
 * length — and neither was anywhere on screen, so the two columns a shop picks
 * a tap on looked untouched over a list that had been narrowed by exactly them.
 *
 * One function so a header and the sweep cannot disagree about the number.
 * `hole-mode.test.ts` § *the bounds a thread puts on a tap* is the sensor: it
 * puts a tap on each edge of the stated band through `tapsFor` and requires the
 * two to answer the same.
 *
 * `reach` is the hole being threaded, which is a feature's depth or a group's
 * worst case — the depth is read off whatever the selection resolved to, so a
 * group answers here the same way one hole does. Absent, there is no depth to
 * state and the diameter stands alone.
 */
export const tapBounds = (
  spec: ThreadSpec,
  reach: ThreadReach | null,
): Record<string, { readonly min?: number; readonly max?: number }> => ({
  DC: { min: spec.major - TAP_WITHIN, max: spec.major + TAP_WITHIN },
  ...(reach === null ? {} : { LCF: { min: reach.depth } }),
})

/**
 * The taps that cut this thread, closest first.
 *
 * **By size alone.** A tap's diameter is its nominal size and every vendor
 * states it; the *pitch* is in the catalog number and the family name, in a
 * different shape for every brand, and nothing in this dataset holds it as a
 * number. So an M8×1.25 and an M8×1 are both offered for an M8 thread and the
 * choice is the person's — which the panel says out loud rather than picking
 * one and being wrong half the time.
 */
export const tapsFor = (
  spec: ThreadSpec,
  tools: ReadonlyArray<CatalogTool>,
  /**
   * Which kind of tap is being asked for, or `null` for both.
   *
   * **The mode is what filters the list** (Paul, 2026-09-09: "these buttons
   * should filter to show only cut or form taps on the taps table"). A cut tap
   * and a form tap start from holes half a millimetre apart on an M6, so a list
   * holding both is a list where half the rows do not fit the drill chosen
   * beside them.
   *
   * **A tap that states no method stays in both.** Silence is not `cutting` —
   * the rule `CatalogTool.threadMethod` states — and every tap in a store
   * scraped before `@toolpath/tool-scraper` 2.4.0 is silent, so excluding the
   * unlabelled would empty this list entirely on an older scrape rather than
   * narrow it.
   */
  method: ThreadMethod | null = null,
): Array<CatalogTool> => {
  /*
    Read off {@link tapBounds} rather than written again as `|size - major| <=
    TAP_WITHIN`. The two are the same rule to three decimal places and *not* the
    same in binary: `major - 0.2` is a hair under the band a subtraction here
    lands on, so a tap sitting exactly on the edge was inside the number the
    heading states and outside the sweep that states it. One expression, one
    answer, whichever of the two is being read.
  */
  const band = tapBounds(spec, null).DC
  return tools
    .filter((tool) => isTap(tool.form))
    .filter((tool) => {
      /*
        `?? null` because "states none" has two spellings that reach here: an
        ingested tool carries `null`, and a tool built without the field at all
        — a fixture, or a document written before it existed — carries
        `undefined`. Reading only one of them as silence filtered every such tap
        out of both lists, which is the whole list on an older scrape.
      */
      const stated = tool.threadMethod ?? null
      return method === null || stated === null || stated === method
    })
    .filter((tool) => {
      const size = tool.geometry.DC
      return (
        size !== undefined &&
        (band?.min === undefined || size >= band.min) &&
        (band?.max === undefined || size <= band.max)
      )
    })
    .sort(
      (a, b) =>
        Math.abs((a.geometry.DC ?? 0) - spec.major) - Math.abs((b.geometry.DC ?? 0) - spec.major) ||
        a.catalogNumber.localeCompare(b.catalogNumber),
    )
}

/**
 * The thread mills that cut this thread, smallest first.
 *
 * A thread mill works from inside the hole, so what bounds it is the **minor**
 * diameter rather than the nominal one — the sheet's own rule, `diameter <=
 * hole diameter - thread mill margin`, read here for the tool half of hole
 * mode. Smallest first because the smaller mill reaches deeper before it fouls
 * the wall.
 */
const threadMillsFor = (
  spec: ThreadSpec,
  tools: ReadonlyArray<CatalogTool>,
  /** How far under the minor a mill has to stay, as a share: the sheet's knob. */
  margin = 0.02,
): Array<CatalogTool> => {
  const room = minorOf(spec) * (1 - margin)
  return tools
    .filter((tool) => tool.form === 'thread mill')
    .filter((tool) => {
      const size = tool.geometry.DC
      return size !== undefined && size <= room
    })
    .sort((a, b) => (a.geometry.DC ?? 0) - (b.geometry.DC ?? 0))
}

/** How deep the thread goes, and how far under the part top it starts. */
export interface ThreadReach {
  /** The threaded depth, in millimetres. */
  readonly depth: number
  /** From the top of the part down to the bottom of it, in millimetres. */
  readonly below: number
  /**
   * Whether the tool's own body clears the part on the way down — the reach
   * curve, swept the same way a drill's is.
   *
   * **Given, this is the answer; `below` is only the stand-in for when there
   * is no curve to ask.** A hole at the bottom of an open pocket is half an
   * inch of fresh air above a quarter inch of hole, and a tap whose derived
   * length below the holder is shorter than that drop reaches it perfectly
   * well: what is beside the shank there is nothing (Paul, 2026-08-31, on
   * taps that "don't reach" a hole its own drill reaches).
   */
  readonly clears?: (tool: CatalogTool) => boolean
}

/**
 * Whether a threading tool reaches the bottom of the thread.
 *
 * **It was not being asked** (Paul, 2026-08-31: "are we checking to make sure
 * the taps can reach the feature?"). The drills go through the rules sheet,
 * which measures flutes against depth and the holder against the part; taps
 * did not, because the sheet's hole rules are written about a *bore* and a tap
 * is wider than the hole it threads — every one of them would be refused on
 * diameter before anything about reach was read.
 *
 * So the two questions the sheet would have asked are asked here directly:
 * the cutting length has to cover the thread, and the tool's own body has to
 * clear the part on the way down — swept against the reach curve where there
 * is one, which is the same question `clearance.ts` asks of a drill. Without a
 * curve it falls back to how far the tool can stand out at all against the
 * drop from the part top, which is the conservative reading.
 *
 * **The ceiling, not `LBH`** (2026-09-03). This read `geometry.LBH` while that
 * field was the most a tool could stand out; it is the length the tool is *set
 * up* at now, and asking it here would refuse a tap that reaches the bottom
 * perfectly well pulled a little further out. `stickoutCeiling` is the
 * question this was always asking — see the table at the top of `stickout.ts`.
 *
 * A number the vendor never stated cannot refuse a tool, so an absent one
 * passes.
 */
export const reaches = (tool: CatalogTool, reach: ThreadReach | null): boolean => {
  if (reach === null) {
    return true
  }
  const cutting = tool.geometry.LCF
  if (cutting !== undefined && cutting < reach.depth) {
    return false
  }
  if (reach.clears) {
    return reach.clears(tool)
  }
  const furthest = stickoutCeiling(tool)
  return furthest === null || furthest >= reach.below
}

/** How far short of the bottom a threading tool falls, in millimetres. */
const fallsShortBy = (tool: CatalogTool, reach: ThreadReach): number => {
  // Only where the drop is what was measured: a swept tool either clears or
  // does not, and there is no shortfall to sort by.
  const furthest = reach.clears ? null : stickoutCeiling(tool)
  return Math.max(
    0,
    tool.geometry.LCF === undefined ? 0 : reach.depth - tool.geometry.LCF,
    furthest === null ? 0 : reach.below - furthest,
  )
}

/**
 * Which number keeps a threading tool off the list, and by how much.
 *
 * A section that says "none reach the bottom" and then lists tools with every
 * number in plain grey has told somebody nothing they can act on; the length
 * that falls short is the one to paint (Paul, 2026-08-31: "it should show some
 * length on the tap in red").
 *
 * `by` is null where the tool was swept against the reach curve rather than
 * measured: it fouls the part or it does not, and there is no shortfall.
 */
export const shortfallOf = (
  tool: CatalogTool,
  reach: ThreadReach | null,
): { readonly code: 'LCF' | 'LBH'; readonly by: number | null } | null => {
  if (reach === null || reaches(tool, reach)) {
    return null
  }
  const cutting = tool.geometry.LCF
  if (cutting !== undefined && cutting < reach.depth) {
    return { code: 'LCF', by: Math.round((reach.depth - cutting) * 1000) / 1000 }
  }
  if (reach.clears) {
    return { code: 'LBH', by: null }
  }
  /**
   * Painted on `LBH`, measured against the ceiling. The column a reader
   * associates with reach is the one to paint, and the shortfall is against
   * the furthest the tool can go — pulling it out is the thing they would try.
   */
  const furthest = stickoutCeiling(tool)
  return furthest === null
    ? null
    : { code: 'LBH', by: Math.round((reach.below - furthest) * 1000) / 1000 }
}

/**
 * What makes the thread, for the mode it is made by.
 *
 * Those that reach the bottom, and — when **none** of them do — the nearest
 * misses instead, closest first, with `short` saying so. An empty section is a
 * true answer told uselessly: "these are the taps for this thread and here is
 * how far each falls short" is what somebody can act on (Paul, 2026-08-31).
 */
export const makersFor = (
  spec: ThreadSpec,
  mode: HoleMode,
  tools: ReadonlyArray<CatalogTool>,
  reach: ThreadReach | null = null,
): { readonly made: Array<CatalogTool>; readonly short: boolean } => {
  const maker = makerOf(mode)
  if (maker === null) {
    return { made: [], short: false }
  }
  const sized = maker === 'tap' ? tapsFor(spec, tools, methodOf(mode)) : threadMillsFor(spec, tools)
  const reaching = sized.filter((tool) => reaches(tool, reach))
  if (reaching.length > 0 || reach === null || sized.length === 0) {
    return { made: reaching.length > 0 ? reaching : sized, short: false }
  }
  return {
    made: [...sized].sort((a, b) => fallsShortBy(a, reach) - fallsShortBy(b, reach)).slice(0, 8),
    short: true,
  }
}

/**
 * The tap half of a form filter.
 *
 * `predrillFormsOf` is the drill half of the same question, and the two are
 * deliberately disjoint: a threaded hole is one filter read by two lists, and
 * neither may show the other's tools.
 */
export const tapFormsOf = (forms: ReadonlyArray<string>): Array<string> => forms.filter(isTap)

/**
 * The form filter with its tap half replaced, the drill half untouched.
 *
 * **A tick on the tap list's Type column is a tap form asked for** (Paul,
 * 2026-09-09: "when I am in the TAPs row or table, it should be filtering to
 * taps"). The tap list is swept out of the catalog by the thread rather than
 * narrowed by the tool query, so it had no filters at all and its Type heading
 * said nothing while the chrome over it counted three.
 *
 * It moves the taps in the `form` axis rather than writing a second axis of its
 * own, because that is where choosing a thread already put them
 * ({@link THREADED_FORMS}) and because the drill list reads that same axis
 * through {@link predrillFormsOf}, which strips the taps out — so the tap half
 * can be answered without a drill leaving the tab beside it. A `type` written
 * here instead would be the same filter under two names and would empty the
 * drill list, whose phrases are not a tap's.
 */
export const formsAskingTaps = (
  forms: ReadonlyArray<string>,
  taps: ReadonlyArray<string>,
): Array<string> => [...forms.filter((form) => !isTap(form)), ...taps]
