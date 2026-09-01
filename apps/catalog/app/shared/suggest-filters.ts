import type { PartFeature } from '@toolpath/part-contracts'
import { MILLING_FORMS, type ToolForm } from '@toolpath/catalog-data'
import { defaultsFor, sheetOf } from './feature-defaults'
import type { ToolQuery } from './filter'
import { rightSideOf } from './judge'
import { KNOBS, RULES, patternCoversForm, rulesFor, type Knob, type Rule } from './rules'

/**
 * What the filters should already say, once a feature and a material are chosen.
 *
 * **Driven by the matching rules, not by a list of somebody's.** Nothing is
 * on until a feature is clicked; then what can be set automatically is: the
 * tool types the feature considers (the defaults sheet's type table, the
 * engine's), and the `must` bounds of `rules.csv` that apply to every tool
 * type — diameter under the widest the feature admits, flutes over its depth
 * — as the ranges on the quick filters. A rule for one kind of tool is not a
 * filter over all of them; the judge applies it where it belongs.
 *
 * **Suggested, never enforced.** Every value is written into the same controls
 * somebody can change, and {@link applySuggestions} replaces only what the
 * last feature suggested, so an answer somebody gave themselves stands.
 */

type Bound = { min?: number; max?: number }

/**
 * How many flutes the material wants, for a tool that mills.
 *
 * Aluminium and the other non-ferrous metals make a big, soft chip and want
 * the room to clear it: two or three flutes. Steels, stainless, cast iron and
 * the hard and hot alloys make a small one and want edges: four or more.
 * Drills and taps have the flutes they have, so nothing is said about them;
 * composites cut by abrasion more than by flute count, so nothing is said
 * there either.
 */
export const suggestedFlutes = (
  materialGroup: string | null,
  form: ToolForm | null,
): Bound | null => {
  if (materialGroup === null || form === null || !MILLING_FORMS.has(form)) {
    return null
  }
  if (materialGroup === 'N') {
    return { max: 3 }
  }
  if (['P', 'M', 'K', 'S', 'H'].includes(materialGroup)) {
    return { min: 4 }
  }
  return null
}

/** A flutes cell that is a bound rather than a rule: `>= 4`, `<= 3`, `= 2`. */
const flutesBound = (rule: string): Bound | null => {
  const match = /^(<=|>=|=)\s*(\d+)$/.exec(rule.trim())
  if (!match) {
    return null
  }
  const count = Number(match[2])
  switch (match[1]) {
    case '<=':
      return { max: count }
    case '>=':
      return { min: count }
    default:
      return { min: count, max: count }
  }
}

const rounded = (value: number): number => Math.round(value * 1000) / 1000

/** The geometry code each tool field filters on. */
const CODES: Readonly<Record<string, string>> = {
  diameter: 'DC',
  'flute length': 'LCF',
  // The rule is about the flutes *below the corner*; the filter is over the
  // flute length column, so a tool with a corner radius passes a filter the
  // judge will still turn down. Loose is the safe direction for a suggestion:
  // it never hides a tool that fits, and the verdict is the judge's.
  'flute length past the corner': 'LCF',
  'length below holder': 'LBH',
  'overall length': 'OAL',
  'L/D': 'LD',
  'corner radius': 'RE',
  flutes: 'NOF',
  'tip angle': 'SIG',
  'shank diameter': 'SFDM',
}

/**
 * The ranges the sheet's musts put on every tool for this feature.
 *
 * Only `must`, only bounds that can be read off this feature, and never one
 * relative to the other tools.
 *
 * **A bound is only a filter if it holds for every tool the feature
 * considers.** A row that names `*` does. So does a pair that between them
 * leave nothing out — `not drill` and `drill`, which is how the diameter cap
 * is written since a drill's band is the bore plus the oversize knob (Paul,
 * 2026-08-31). For such a pair the filter takes the **loosest** of the two,
 * because a filter that took the tighter one would hide the very tools the
 * looser row exists to admit.
 */
const rangesFromRules = (
  feature: PartFeature,
  partFeatures: ReadonlyArray<PartFeature>,
  rules: ReadonlyArray<Rule> = RULES.rules,
  knobs: ReadonlyArray<Knob> = KNOBS.knobs,
): Record<string, Bound> => {
  const sheet = sheetOf(feature, partFeatures)
  // What the feature considers at all: a bound on a form nothing offers is
  // not a filter, and a form nothing bounds means no filter on that code.
  const forms = defaultsFor(feature, partFeatures)?.toolTypes ?? []
  const bounds = rulesFor(feature, partFeatures, rules).flatMap((rule) => {
    const { test } = rule
    if (
      rule.stage !== 'tool' ||
      rule.level !== 'must' ||
      test.kind !== 'bound' ||
      test.base.kind === 'best'
    ) {
      return []
    }
    const code = CODES[test.field]
    const value = rightSideOf(test, sheet, knobs)
    return code === undefined || value === null
      ? []
      : [{ rule, code, operator: test.operator, value: rounded(value) }]
  })

  /**
   * **A form at a time, then the loosest of them.**
   *
   * A filter hides tools, so it may only say what is true of *every* form the
   * feature considers. Each form gets the tightest of the rows that take it;
   * the filter is then the loosest of those, because a bound that holds for
   * end mills is not a bound on a drill — and since 2026-08-31 the diameter
   * cap is written as exactly that pair (`not drill`, `drill`), a drill being
   * allowed past the bore by the oversize knob. Taking the tighter one would
   * hide the tools the drill row exists to admit.
   */
  const ranges: Record<string, Bound> = {}
  for (const code of new Set(bounds.map((each) => each.code))) {
    let widest: Bound | null = null
    for (const form of forms) {
      const mine = bounds.filter(
        (each) =>
          each.code === code &&
          each.rule.toolTypes.some((pattern) => patternCoversForm(pattern, form)),
      )
      if (mine.length === 0) {
        // Nothing bounds this form, so nothing may be filtered on this code.
        widest = null
        break
      }
      const held: Bound = {}
      for (const each of mine) {
        if (each.operator === '<=' || each.operator === '<' || each.operator === '=') {
          held.max = held.max === undefined ? each.value : Math.min(held.max, each.value)
        }
        if (each.operator === '>=' || each.operator === '>' || each.operator === '=') {
          held.min = held.min === undefined ? each.value : Math.max(held.min, each.value)
        }
      }
      widest =
        widest === null
          ? held
          : {
              ...(held.max === undefined || widest.max === undefined
                ? {}
                : { max: Math.max(held.max, widest.max) }),
              ...(held.min === undefined || widest.min === undefined
                ? {}
                : { min: Math.min(held.min, widest.min) }),
            }
    }
    if (widest && (widest.max !== undefined || widest.min !== undefined)) {
      ranges[code] = widest
    }
  }
  return ranges
}

export interface Suggestions {
  readonly terms: Record<string, ReadonlyArray<string>>
  readonly ranges: Record<string, Bound>
}

/**
 * The filters a feature and a material suggest, on their own.
 *
 * Just what the sheets say they imply — no folding, no history. What it means
 * to *apply* them is {@link applySuggestions}, which is where the rule about
 * whose answer wins lives. `partFeatures` is the whole part, so depth below
 * the top is measured from its top.
 */
export const suggestionsFor = (
  feature: PartFeature | null,
  materialGroup: string | null,
  partFeatures: ReadonlyArray<PartFeature> = [],
): Suggestions => {
  const terms: Record<string, ReadonlyArray<string>> = {}
  const ranges: Record<string, Bound> = {}
  if (feature === null) {
    return { terms, ranges }
  }
  // The part material is not a filter on the vendor's material tags — most
  // of the catalog states none, and a tool tagged only for aluminium is not
  // unusable in steel. Paul's spec (2026-08-29): it sets the flute count.
  const row = defaultsFor(feature, partFeatures)
  if (row === null) {
    return { terms, ranges }
  }
  // The type table: every form the feature considers, as one set. Which of
  // them is best is the rules sheet's, not the tiles'.
  if (row.toolTypes.length > 0) {
    terms.form = [...row.toolTypes]
  }
  if (row.brand.length > 0) {
    terms.brand = [...row.brand]
  }
  if (row.holder !== '') {
    terms.taper = [row.holder]
  }
  if (row.collet !== '') {
    terms.colletSeries = [row.collet]
  }
  Object.assign(ranges, rangesFromRules(feature, partFeatures))
  const flutes =
    row.flutes === 'by material'
      ? suggestedFlutes(materialGroup, row.toolTypes[0] ?? null)
      : flutesBound(row.flutes)
  if (flutes !== null) {
    ranges.NOF = flutes
  }
  return { terms, ranges }
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/**
 * Which filters a new feature overrules outright.
 *
 * **The tool type is the feature's to say.** Which forms can cut a thing is a
 * fact about the thing — a hole is drilled, a filleted floor is not touched by
 * a flat end — so a type chosen for the last feature, by hand or by the sheet,
 * is not an answer about this one. Every other filter is somebody's until they
 * clear it (Paul, 2026-08-31: "when I click a feature, it needs to override
 * the tool type fields and apply the filters for the feature type").
 */
const OVERRULED: ReadonlySet<string> = new Set(['form'])

/**
 * The ranges a new feature overrules outright, and clears when there is no
 * feature.
 *
 * **The size of the tool is the feature's to say** (Paul, 2026-09-01: "flute
 * length and diameter filters do not update when a new feature is selected.
 * When a new feature is selected, or no feature is active, they should clear
 * for the next selection"). A diameter typed for a ⌀12 pocket is not an answer
 * about the ⌀5 hole clicked next, and left standing it hid every tool that
 * could cut it — the same reasoning as the tool type above, on the two numbers
 * a feature states most directly.
 */
const OVERRULED_RANGES: ReadonlySet<string> = new Set(['DC', 'LCF'])

/**
 * The filters a feature suggests, folded onto what is already set.
 *
 * **A suggestion the last feature made is not somebody's answer.** Only filling
 * blanks looked right until a hole was clicked and then a pocket: the drill the
 * hole suggested was no longer blank, so the pocket suggested nothing and the
 * list stayed full of drills. So a value that is still exactly what the last
 * feature suggested is replaced, and a value that is anything else — typed,
 * ticked, or cleared — is left alone, unless it is one of {@link OVERRULED}.
 *
 * `previous` is what was suggested last time, which is the only way to tell
 * those two apart.
 */
export const applySuggestions = (
  query: ToolQuery,
  previous: Suggestions,
  feature: PartFeature | null,
  materialGroup: string | null,
  partFeatures: ReadonlyArray<PartFeature> = [],
): ToolQuery => {
  const next = suggestionsFor(feature, materialGroup, partFeatures)
  const terms: Record<string, ReadonlyArray<string>> = { ...query.terms }
  const ranges: Record<string, Bound> = { ...query.ranges }
  for (const key of new Set([
    ...Object.keys(previous.terms),
    ...Object.keys(terms),
    ...Object.keys(next.terms),
  ])) {
    const held = terms[key]
    const untouched = held === undefined || held.length === 0 || same(held, previous.terms[key])
    const suggested = next.terms[key]
    // A feature overrules the tool type even where somebody set it: see above.
    if (!untouched && !(OVERRULED.has(key) && suggested !== undefined)) {
      continue
    }
    if (suggested) {
      terms[key] = suggested
    } else if (untouched) {
      delete terms[key]
    }
  }
  for (const key of Object.keys(next.terms)) {
    if (terms[key] === undefined || terms[key].length === 0) {
      terms[key] = next.terms[key]
    }
  }
  for (const key of new Set([...Object.keys(previous.ranges), ...Object.keys(ranges)])) {
    const held = ranges[key]
    const untouched = held === undefined || same(held, previous.ranges[key])
    if (!untouched && !OVERRULED_RANGES.has(key)) {
      continue
    }
    if (next.ranges[key]) {
      ranges[key] = next.ranges[key]
    } else {
      delete ranges[key]
    }
  }
  for (const key of Object.keys(next.ranges)) {
    if (ranges[key] === undefined) {
      ranges[key] = next.ranges[key]
    }
  }
  // With no feature, the two the feature owns go back to saying nothing.
  for (const key of OVERRULED_RANGES) {
    if (next.ranges[key] === undefined) {
      delete ranges[key]
    }
  }
  return { ...query, terms, ranges }
}
