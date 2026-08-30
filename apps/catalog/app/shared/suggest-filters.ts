import type { PartFeature } from '@toolpath/part-contracts'
import { MILLING_FORMS, type ToolForm } from '@toolpath/catalog-data'
import { defaultsFor, sheetOf } from './feature-defaults'
import type { ToolQuery } from './filter'
import { rightSideOf } from './judge'
import { KNOBS, RULES, rulesFor, type Knob, type Rule } from './rules'

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
 * Only rows that name `*` as their tool types, only `must`, only bounds that
 * can be read off this feature — and never one relative to the other tools.
 * Later rows tighten earlier ones on the same side, never loosen them.
 */
export const rangesFromRules = (
  feature: PartFeature,
  partFeatures: ReadonlyArray<PartFeature>,
  rules: ReadonlyArray<Rule> = RULES.rules,
  knobs: ReadonlyArray<Knob> = KNOBS.knobs,
): Record<string, Bound> => {
  const sheet = sheetOf(feature, partFeatures)
  const ranges: Record<string, Bound> = {}
  for (const rule of rulesFor(feature, partFeatures, rules)) {
    const { test } = rule
    if (
      rule.stage !== 'tool' ||
      rule.level !== 'must' ||
      test.kind !== 'bound' ||
      test.base.kind === 'best' ||
      !rule.toolTypes.includes('*')
    ) {
      continue
    }
    const code = CODES[test.field]
    const value = rightSideOf(test, sheet, knobs)
    if (code === undefined || value === null) {
      continue
    }
    const held = ranges[code] ?? {}
    const bound = rounded(value)
    if (test.operator === '<=' || test.operator === '<' || test.operator === '=') {
      held.max = held.max === undefined ? bound : Math.min(held.max, bound)
    }
    if (test.operator === '>=' || test.operator === '>' || test.operator === '=') {
      held.min = held.min === undefined ? bound : Math.max(held.min, bound)
    }
    ranges[code] = held
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
 * The filters a feature suggests, folded onto what is already set.
 *
 * **A suggestion the last feature made is not somebody's answer.** Only filling
 * blanks looked right until a hole was clicked and then a pocket: the drill the
 * hole suggested was no longer blank, so the pocket suggested nothing and the
 * list stayed full of drills. So a value that is still exactly what the last
 * feature suggested is replaced, and a value that is anything else — typed,
 * ticked, or cleared — is left alone.
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
  for (const key of new Set([...Object.keys(previous.terms), ...Object.keys(terms)])) {
    const held = terms[key]
    const untouched = held === undefined || held.length === 0 || same(held, previous.terms[key])
    if (!untouched) {
      continue
    }
    if (next.terms[key]) {
      terms[key] = next.terms[key]
    } else {
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
    if (!untouched) {
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
  return { ...query, terms, ranges }
}
