import type { PartFeature } from '@toolpath/part-contracts'
import { toolCollisions, type CatalogTool } from '@toolpath/catalog-data'
import { FIELDS, defaultsFor, sheetOf, type Sheet } from './feature-defaults'
import {
  KNOBS,
  RULES,
  TOOL_NUMBERS,
  TOOL_WORDS,
  knobValue,
  ruleCovers,
  rulesFor,
  type Adjustment,
  type Knob,
  type Rule,
  type Term,
  type Test,
} from './rules'

/**
 * One tool against one feature, through the rules sheet.
 *
 * The stations, in the engine's order: the **type** table (the defaults
 * sheet's `tool types` — a form the feature does not consider is out), then
 * every applicable row of `rules.csv` — a `must` removes, a `should` warns, a
 * `prefer` demotes — and the `rank` rows become a key the list is sorted by.
 * Every failure names its rule and its numbers, which is what the list prints.
 *
 * **A rule that cannot be read stands down.** A tool with no tip angle is not
 * judged on its tip angle; a feature with no fillet is not judged on one. That
 * is the engine's `Inf` bound, and the only honest answer to a number nobody
 * stated. `best <field>` is read in a second pass over the tools that no
 * `must` removed, so "2×D longer than the best" is measured against tools
 * that are actually usable.
 *
 * Pure: a feature, a part, tools and the sheets in, verdicts out. Nothing here
 * knows about the page, which is why the whole thing is testable with eight
 * made-up tools and one pocket.
 */

export interface Reason {
  readonly rule: Rule | null
  /** In the words the list shows: `diameter 12.00 > 10.00 widest tool diameter`. */
  readonly text: string
  /**
   * How far off, as a share of the bound — 0.2 is twenty per cent over or
   * under. Only a bound has one; a wrong type or a wrong word is not "close".
   */
  readonly shortfall?: number
}

export interface Verdict {
  readonly tool: CatalogTool
  readonly removed: ReadonlyArray<Reason>
  readonly warned: ReadonlyArray<Reason>
  readonly demoted: ReadonlyArray<Reason>
  /** One number per rank row, in the sheet's order; smaller is better. */
  readonly key: ReadonlyArray<number>
  /** What each rank row read off this tool, for the list's summary line. */
  readonly readings: ReadonlyArray<string>
}

export type Standing = 'fits' | 'warned' | 'demoted' | 'removed'

/**
 * A warning outranks a demotion: a `should` is a geometric fact somebody has
 * to override (the engine's "tools with warnings"), a `prefer` is a
 * preference (its "compatible, not preferred"). Read the other way round on
 * 2026-08-29, tools over the tightest corner sat among the merely
 * not-preferred and, being wider, sorted above the ones that fit it.
 */
export const standingOf = (verdict: Verdict): Standing =>
  verdict.removed.length > 0
    ? 'removed'
    : verdict.warned.length > 0
      ? 'warned'
      : verdict.demoted.length > 0
        ? 'demoted'
        : 'fits'

/** The unit a number is in, for whoever words it. */
export type NumberUnit = 'mm' | 'deg' | 'ratio' | 'count' | '%'

/** How a number is worded in a reason or a reading; the default is plain millimetres. */
export type Format = (value: number, unit: NumberUnit) => string

export interface JudgeOptions {
  readonly rules?: ReadonlyArray<Rule>
  readonly knobs?: ReadonlyArray<Knob>
  /** Words the numbers in the person's unit; the page passes one, tests use the default. */
  readonly format?: Format
}

const EPSILON = 1e-6
/** How close an `=` with no stated tolerance has to be, in the field's unit. */
const EQUAL_WITHIN = 1e-3

export const plainFormat: Format = (value) =>
  Number.isInteger(value) ? String(value) : value.toFixed(2)

const unitOf = (field: string): NumberUnit => TOOL_NUMBERS[field]?.unit ?? 'mm'

const knobOf = (name: string, knobs: ReadonlyArray<Knob>): Knob | undefined =>
  knobs.find((knob) => knob.name === name)

const featureValue = (name: string, sheet: Sheet): number | null => {
  const value = FIELDS[name]?.read(sheet)
  return typeof value === 'number' ? value : null
}

const termValue = (
  term: Term,
  sheet: Sheet,
  knobs: ReadonlyArray<Knob>,
  best: ReadonlyMap<string, number>,
): number | null => {
  switch (term.kind) {
    case 'feature':
      return featureValue(term.name, sheet)
    case 'knob':
      return knobOf(term.name, knobs)?.value ?? null
    case 'number':
      return term.value
    case 'best':
      return best.get(term.field) ?? null
  }
}

/** The amount an adjustment adds, in the base's unit: a `%` is a share of the base. */
const adjustmentAmount = (
  adjust: Adjustment,
  base: number,
  knobs: ReadonlyArray<Knob>,
): number | null => {
  if (adjust.term.kind === 'number') {
    return adjust.term.percent ? (base * adjust.term.value) / 100 : adjust.term.value
  }
  const knob = knobOf(adjust.term.name, knobs)
  if (!knob) {
    return null
  }
  return knob.unit === '%' ? (base * knob.value) / 100 : knob.value
}

const termName = (term: Term): string => {
  switch (term.kind) {
    case 'feature':
    case 'knob':
      return term.name
    case 'number':
      return plainFormat(term.value, 'mm')
    case 'best':
      return `best ${term.field}`
  }
}

/**
 * What a bound holds the tool's number against, resolved for this feature —
 * or null where it cannot be: the number the quick filters are set to.
 */
export const rightSideOf = (
  test: Extract<Test, { kind: 'bound' }>,
  sheet: Sheet,
  knobs: ReadonlyArray<Knob>,
  best: ReadonlyMap<string, number> = new Map(),
): number | null => {
  const base = termValue(test.base, sheet, knobs, best)
  if (base === null) {
    return null
  }
  if (!test.adjust) {
    return base
  }
  const amount = adjustmentAmount(test.adjust, base, knobs)
  return amount === null ? null : base + test.adjust.sign * amount
}

/** True, false, or null where the rule stands down. */
const bound = (
  test: Extract<Test, { kind: 'bound' }>,
  tool: CatalogTool,
  sheet: Sheet,
  knobs: ReadonlyArray<Knob>,
  best: ReadonlyMap<string, number>,
  format: Format,
): { pass: boolean; text: string; shortfall: number } | null => {
  const unit = unitOf(test.field)
  const fmt = (value: number) => format(value, unit)
  const left = TOOL_NUMBERS[test.field]?.read(tool) ?? null
  const base = termValue(test.base, sheet, knobs, best)
  if (left === null || base === null) {
    return null
  }
  let right = base
  let tolerance: number | null = null
  if (test.adjust) {
    const amount = adjustmentAmount(test.adjust, base, knobs)
    if (amount === null) {
      return null
    }
    right = base + test.adjust.sign * amount
    tolerance = Math.abs(amount)
  }
  const pass = (() => {
    switch (test.operator) {
      case '<=':
        return left <= right + EPSILON
      case '>=':
        return left >= right - EPSILON
      case '<':
        return left < right - EPSILON
      case '>':
        return left > right + EPSILON
      case '=':
        // `tip angle = chamfer included angle + tolerance` reads as "within";
        // a plain `=` is exact to a thousandth.
        return tolerance !== null
          ? Math.abs(left - base) <= tolerance + EPSILON
          : Math.abs(left - right) <= EQUAL_WITHIN
    }
  })()
  const adjustLabel = test.adjust
    ? test.adjust.term.kind === 'knob'
      ? test.adjust.term.name
      : `${plainFormat(test.adjust.term.value, 'mm')}${test.adjust.term.percent ? ' %' : ''}`
    : ''
  const against = !test.adjust
    ? // A bare number names itself: "tip angle 140 is not 180", never "180 180".
      test.base.kind === 'number'
      ? fmt(right)
      : `${fmt(right)} ${termName(test.base)}`
    : test.operator === '='
      ? `${fmt(base)} ± ${fmt(tolerance ?? 0)} (${termName(test.base)}, ${adjustLabel})`
      : `${fmt(right)} (${termName(test.base)} ${test.adjust.sign > 0 ? '+' : '−'} ${adjustLabel})`
  const word = pass
    ? 'ok'
    : test.operator === '='
      ? 'is not'
      : test.operator === '<=' || test.operator === '<'
        ? 'over'
        : 'under'
  const shortfall = pass ? 0 : Math.abs(left - right) / Math.max(Math.abs(right), 1e-9)
  return { pass, text: `${test.field} ${fmt(left)} ${word} ${against}`, shortfall }
}

const is = (
  test: Extract<Test, { kind: 'is' }>,
  tool: CatalogTool,
): { pass: boolean; text: string } | null => {
  const word = TOOL_WORDS[test.field]?.(tool) ?? null
  if (word === null) {
    return null
  }
  const pass = (word === test.value) !== test.not
  return {
    pass,
    text: `${test.field} is ${word}${pass ? '' : `, wanted ${test.not ? 'not ' : ''}${test.value}`}`,
  }
}

/** One rank row's component of the key, and what it read. Unreadable is last. */
const rank = (
  test: Extract<Test, { kind: 'rank' }>,
  tool: CatalogTool,
  sheet: Sheet,
  format: Format,
  knobs: ReadonlyArray<Knob>,
): { key: number; reading: string } => {
  if (test.direction === 'order') {
    const word = TOOL_WORDS[test.field]?.(tool) ?? ''
    const at = test.order.findIndex((value) => value.toLowerCase() === word.toLowerCase())
    return { key: at === -1 ? test.order.length : at, reading: word }
  }
  const value = TOOL_NUMBERS[test.field]?.read(tool) ?? null
  const fmt = (each: number) => format(each, unitOf(test.field))
  if (value === null) {
    return { key: Number.POSITIVE_INFINITY, reading: `${test.field} —` }
  }
  if (test.direction === 'closest') {
    const feature = featureValue(test.to, sheet)
    if (feature === null) {
      return { key: Number.POSITIVE_INFINITY, reading: `${test.field} ${fmt(value)}` }
    }
    let to = (feature * test.toPercent) / 100
    let target = test.toPercent === 100 ? test.to : `${String(test.toPercent)} % of ${test.to}`
    if (test.adjust) {
      const amount = adjustmentAmount(test.adjust, to, knobs)
      if (amount === null) {
        return { key: Number.POSITIVE_INFINITY, reading: `${test.field} ${fmt(value)}` }
      }
      to += test.adjust.sign * amount
      target = `${target} ${test.adjust.sign > 0 ? '+' : '−'} ${
        test.adjust.term.kind === 'knob'
          ? test.adjust.term.name
          : `${plainFormat(test.adjust.term.value, 'mm')}${test.adjust.term.percent ? ' %' : ''}`
      }`
    }
    const off = value - to
    return {
      key: Math.abs(off),
      reading:
        Math.abs(off) <= EQUAL_WITHIN
          ? `${test.field} ${fmt(value)} = ${target}`
          : `${test.field} ${fmt(value)}, ${fmt(Math.abs(off))} ${off < 0 ? 'under' : 'over'} ${target}`,
    }
  }
  if (test.direction === 'smallest') {
    return { key: value, reading: `${test.field} ${fmt(value)}` }
  }
  let capped = value
  if (test.capPercent !== null && test.capOf !== null) {
    const of = featureValue(test.capOf, sheet)
    if (of !== null) {
      capped = Math.min(value, (of * test.capPercent) / 100)
    }
  }
  return { key: -capped, reading: `${test.field} ${fmt(value)}` }
}

interface Pass {
  readonly removed: Array<Reason>
  readonly warned: Array<Reason>
  readonly demoted: Array<Reason>
}

const judgeAgainst = (
  rules: ReadonlyArray<Rule>,
  tool: CatalogTool,
  sheet: Sheet,
  knobs: ReadonlyArray<Knob>,
  best: ReadonlyMap<string, number>,
  only: (rule: Rule) => boolean,
  format: Format,
): Pass => {
  const out: Pass = { removed: [], warned: [], demoted: [] }
  for (const rule of rules) {
    if (rule.stage !== 'tool' || rule.level === 'rank' || !only(rule) || !ruleCovers(rule, tool)) {
      continue
    }
    const result: { pass: boolean; text: string; shortfall?: number } | null =
      rule.test.kind === 'bound'
        ? bound(rule.test, tool, sheet, knobs, best, format)
        : rule.test.kind === 'is'
          ? is(rule.test, tool)
          : null
    if (result === null || result.pass) {
      continue
    }
    const shortfall = result.shortfall
    const reason: Reason = {
      rule,
      text: `${result.text} — ${rule.note || rule.text}`,
      ...(shortfall === undefined ? {} : { shortfall }),
    }
    if (rule.level === 'must') {
      out.removed.push(reason)
    } else if (rule.level === 'should') {
      out.warned.push(reason)
    } else {
      out.demoted.push(reason)
    }
  }
  return out
}

const readsBest = (rule: Rule): boolean =>
  rule.test.kind === 'bound' && rule.test.base.kind === 'best'

/** Every tool judged against one feature on one part. */
export const judgeTools = (
  tools: ReadonlyArray<CatalogTool>,
  feature: PartFeature,
  partFeatures: ReadonlyArray<PartFeature>,
  { rules = RULES.rules, knobs = KNOBS.knobs, format = plainFormat }: JudgeOptions = {},
): Array<Verdict> => {
  const sheet = sheetOf(feature, partFeatures)
  const applicable = rulesFor(feature, partFeatures, rules)
  const types = defaultsFor(feature, partFeatures)?.toolTypes ?? []
  const margins = {
    radial: knobValue('radial holder clearance', knobs) ?? 0,
    axial: knobValue('axial holder clearance', knobs) ?? 0,
  }

  // Pass one: the type table, the tool's own body against the part, and
  // every rule that reads nothing relative.
  const first = tools.map((tool) => {
    const pass = judgeAgainst(
      applicable,
      tool,
      sheet,
      knobs,
      new Map(),
      (rule) => !readsBest(rule),
      format,
    )
    if (types.length > 0 && !types.includes(tool.form)) {
      pass.removed.unshift({
        rule: null,
        text: `${tool.form} is not a type this feature considers (${types.join(', ')})`,
      })
    }
    // Built in, like the type table, because no row can say it: the reach
    // curve swept against the shank and neck, which sit where they sit at
    // every stickout. Paul (2026-08-30): a tool whose shank rubs the wall
    // above the flutes is not compatible and is not shown — find longer
    // flutes or a reduced shank.
    // A tool already rejected by a must-rule cannot become usable because it
    // also collides with the part. Avoid the expensive sweep in that case; the
    // first rejection is sufficient for the catalog result.
    const rub =
      pass.removed.length === 0 && sheet.curve
        ? toolCollisions(tool, sheet.curve, margins)[0]
        : undefined
    if (rub) {
      const short = rub.needs - rub.height
      pass.removed.push({
        rule: null,
        text: `${rub.part} rubs the wall above the flutes by ${format(short, 'mm')} — no stickout clears it; longer flutes or a reduced shank would`,
        shortfall: short / Math.max(rub.needs, 1e-9),
      })
    }
    return { tool, pass }
  })

  // The best of each field among what survived, for the relative rules.
  const best = new Map<string, number>()
  for (const rule of applicable) {
    if (rule.test.kind === 'bound' && rule.test.base.kind === 'best') {
      const field = rule.test.base.field
      const values = first
        .filter(({ pass }) => pass.removed.length === 0)
        .map(({ tool }) => TOOL_NUMBERS[field]?.read(tool) ?? null)
        .filter((value): value is number => value !== null)
      if (values.length > 0) {
        best.set(field, Math.min(...values))
      }
    }
  }

  const ranks = applicable.filter(
    (rule): rule is Rule & { test: Extract<Test, { kind: 'rank' }> } =>
      rule.stage === 'tool' && rule.test.kind === 'rank',
  )

  return first.map(({ tool, pass }) => {
    const second = judgeAgainst(applicable, tool, sheet, knobs, best, readsBest, format)
    const ranked = ranks
      .filter((rule) => ruleCovers(rule, tool))
      .map((rule) => rank(rule.test, tool, sheet, format, knobs))
    return {
      tool,
      removed: [...pass.removed, ...second.removed],
      warned: [...pass.warned, ...second.warned],
      demoted: [...pass.demoted, ...second.demoted],
      key: ranked.map((each) => each.key),
      readings: ranked.map((each) => each.reading),
    }
  })
}

/** Rank keys compared left to right, the first that differs deciding. */
export const compareKeys = (a: ReadonlyArray<number>, b: ReadonlyArray<number>): number => {
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const left = a[index] ?? Number.POSITIVE_INFINITY
    const right = b[index] ?? Number.POSITIVE_INFINITY
    if (left !== right) {
      return left < right ? -1 : 1
    }
  }
  return 0
}

const STANDING_ORDER: Record<Standing, number> = { fits: 0, demoted: 1, warned: 2, removed: 3 }

/**
 * The list order: what fits, then what was demoted, then what was warned —
 * each in rank order, and in the order they arrived where the ranks tie.
 * Removed tools are not in it; {@link removedFrom} has them.
 */
export const orderVerdicts = (verdicts: ReadonlyArray<Verdict>): Array<Verdict> =>
  verdicts
    .map((verdict, index) => ({ verdict, index, standing: STANDING_ORDER[standingOf(verdict)] }))
    .filter((each) => each.standing < STANDING_ORDER.removed)
    .sort(
      (a, b) =>
        a.standing - b.standing || compareKeys(a.verdict.key, b.verdict.key) || a.index - b.index,
    )
    .map((each) => each.verdict)

export const removedFrom = (verdicts: ReadonlyArray<Verdict>): Array<Verdict> =>
  verdicts.filter((verdict) => verdict.removed.length > 0)

/**
 * The verdicts of several features on one tool, folded into one.
 *
 * A tool for several features is removed if any feature removes it; warned and
 * demoted are the union; the key is the first feature's, which is the one the
 * person is looking at.
 */
export const foldVerdicts = (perFeature: ReadonlyArray<ReadonlyArray<Verdict>>): Array<Verdict> => {
  const [head, ...rest] = perFeature
  if (!head) {
    return []
  }
  return head.map((verdict, index) => {
    const others = rest
      .map((verdicts) => verdicts[index])
      .filter((each): each is Verdict => each !== undefined)
    return {
      ...verdict,
      removed: [...verdict.removed, ...others.flatMap((each) => each.removed)],
      warned: [...verdict.warned, ...others.flatMap((each) => each.warned)],
      demoted: [...verdict.demoted, ...others.flatMap((each) => each.demoted)],
    }
  })
}

/**
 * The removed tools that came closest, worst-miss first among the near ones.
 *
 * "Closest to eligible" is a tool every `must` failed by a number — a wrong
 * type is not close to anything — ranked by its worst shortfall. It is what
 * the list shows, marked incompatible and saying why, when fewer than the
 * wanted number of tools fit.
 */
export const closestMisses = (verdicts: ReadonlyArray<Verdict>, count: number): Array<Verdict> =>
  verdicts
    .filter(
      (verdict) =>
        verdict.removed.length > 0 &&
        verdict.removed.every((reason) => reason.shortfall !== undefined),
    )
    .map((verdict) => ({
      verdict,
      miss: Math.max(...verdict.removed.map((reason) => reason.shortfall ?? 0)),
    }))
    .sort((a, b) => a.miss - b.miss)
    .slice(0, Math.max(0, count))
    .map((each) => each.verdict)
