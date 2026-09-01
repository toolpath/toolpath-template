import type { PartFeature } from '@toolpath/part-contracts'
import { TOOL_FORMS, isToolForm, shankOf, type CatalogTool } from '@toolpath/catalog-data'
import { FIELDS, featureKey, parseCondition, sheetOf, type Condition } from './feature-defaults'
import knobsCsv from './knobs.csv?raw'
import rulesCsv from './rules.csv?raw'

/**
 * The rules sheet: Toolpath's tool matching, in a file a person edits.
 *
 * `rules.csv` says, one row per rule, what happens to a tool for a feature;
 * `knobs.csv` holds every number a rule names, once, with where it came from.
 * Both sit beside this file and are meant to be edited by hand — the guide is
 * `docs/RULES.md`, and the engine they were seeded from is written out in
 * `docs/ENGINE-TOOL-MATCHING.md`.
 *
 * **The sheets are the source; this file only reads them.** The vocabulary a
 * rule may use — tool fields, feature fields, holder fields, knobs, tool types,
 * levels — is declared here, and `rules.test.ts` checks the committed sheets
 * against it, so a typo fails the gate rather than silently judging nothing.
 *
 * Columns of `rules.csv`, in order:
 *
 * - `feature` — a kernel feature type, or a pattern with `*`: `*Hole`,
 *   `Through*`, `*` for every feature.
 * - `when` — a condition, the same ones `feature-defaults.csv` uses. Blank
 *   means always.
 * - `tool types` — the forms the row applies to, `;`-separated, `*` for all,
 *   `*end mill` for every end mill; or `full shank` / `reduced shank`, which
 *   take a tool by its shank rather than its form.
 * - `for` — blank or `tool` for a rule about the tool; `holder` for a rule
 *   about the stack once a tool is chosen.
 * - `rule` — one of three shapes, below.
 * - `level` — `must`, `should`, `prefer`, or `rank`.
 * - `note` — why, for the next editor.
 *
 * Three shapes of rule:
 *
 * - **a bound**: `diameter <= largest tool diameter - corner clearance` —
 *   a tool field, an operator, a feature field or knob or number, and at most
 *   one `+` or `-` adjustment that is a knob or a number. A `%` knob is a
 *   share of the feature field. `best L/D` is the best value among the tools
 *   that passed every `must`.
 * - **an is**: `form is drill`, `shank is reduced`, `brand is not Kennametal`.
 * - **a rank**: `L/D smallest`, `gauge length longest`, `corner radius
 *   closest to floor fillet radius`, `diameter largest up to 90 % of largest
 *   tool diameter`, `form in order chamfer mill; ball end mill` (listed first
 *   is best, unlisted last). Rank rows are
 *   read top to bottom; a row for the feature beats a `*` row.
 *
 * This module parses and selects. Judging a tool against the selected rules is
 * `judge.ts`, so the grammar can be tested without a catalog.
 */

export const LEVELS = ['must', 'should', 'prefer', 'rank'] as const
export type Level = (typeof LEVELS)[number]

export const STAGES = ['tool', 'holder'] as const
export type Stage = (typeof STAGES)[number]

export type Operator = '<=' | '>=' | '=' | '<' | '>'

/* ---------------------------------------------------------------- knobs -- */

/**
 * `×D` is a multiple of the tool's own diameter — the way a shop states a
 * length that scales with the cutter (Paul, 2026-09-01).
 */
export type KnobUnit = 'mm' | 'deg' | '%' | 'ratio' | '×D'

export interface Knob {
  readonly name: string
  readonly value: number
  readonly unit: KnobUnit
  readonly note: string
}

export interface SheetProblem {
  readonly line: number
  readonly message: string
}

const KNOB_UNITS: ReadonlyArray<KnobUnit> = ['mm', 'deg', '%', 'ratio', '×D']

const cells = (line: string): Array<string> => {
  const out: Array<string> = []
  let cell = ''
  let quoted = false
  for (const char of line) {
    if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      out.push(cell.trim())
      cell = ''
    } else {
      cell += char
    }
  }
  out.push(cell.trim())
  return out
}

const rowsOf = (
  csv: string,
  expected: ReadonlyArray<string>,
): {
  rows: Array<{ at: number; cell: (name: string) => string }>
  problems: Array<SheetProblem>
} => {
  const problems: Array<SheetProblem> = []
  const lines = csv.split(/\r?\n/)
  const header = cells(lines[0] ?? '').map((each) => each.toLowerCase())
  for (const name of expected) {
    if (!header.includes(name)) {
      problems.push({ line: 1, message: `The header is missing a "${name}" column.` })
    }
  }
  if (problems.length > 0) {
    return { rows: [], problems }
  }
  const rows = lines.flatMap((line, index) => {
    if (index === 0 || line.trim() === '') {
      return []
    }
    const row = cells(line)
    return [{ at: index + 1, cell: (name: string) => row[header.indexOf(name)] ?? '' }]
  })
  return { rows, problems }
}

/** The knobs sheet, parsed and checked: every problem names its line. */
export const parseKnobs = (csv: string): { knobs: Array<Knob>; problems: Array<SheetProblem> } => {
  const { rows, problems } = rowsOf(csv, ['knob', 'value', 'unit', 'note'])
  const knobs: Array<Knob> = []
  for (const { at, cell } of rows) {
    const name = cell('knob').toLowerCase()
    const value = Number(cell('value'))
    const unit = cell('unit')
    if (name === '') {
      problems.push({ line: at, message: 'No knob named.' })
      continue
    }
    if (knobs.some((knob) => knob.name === name)) {
      problems.push({ line: at, message: `"${name}" is named twice.` })
      continue
    }
    if (cell('value') === '' || !Number.isFinite(value)) {
      problems.push({ line: at, message: `"${cell('value')}" is not a number.` })
      continue
    }
    if (!KNOB_UNITS.includes(unit as KnobUnit)) {
      problems.push({
        line: at,
        message: `"${unit}" is not a unit. Use one of ${KNOB_UNITS.join(', ')}.`,
      })
      continue
    }
    knobs.push({ name, value, unit: unit as KnobUnit, note: cell('note') })
  }
  return { knobs, problems }
}

/* ----------------------------------------------------------- vocabulary -- */

/**
 * What a rule may say about a tool, by the name the sheet uses.
 *
 * Numbers come off the catalog's geometry; the two words come off what the
 * dataset derived; `shank` is the catalog's own reading of the shoulder.
 */
export interface ToolNumber {
  readonly unit: 'mm' | 'deg' | 'ratio' | 'count'
  readonly read: (tool: CatalogTool) => number | null
}

const geometry =
  (code: string) =>
  (tool: CatalogTool): number | null =>
    tool.geometry[code] ?? null

export const TOOL_NUMBERS: Readonly<Record<string, ToolNumber>> = {
  diameter: { unit: 'mm', read: geometry('DC') },
  'flute length': { unit: 'mm', read: geometry('LCF') },
  'length below holder': { unit: 'mm', read: geometry('LBH') },
  'overall length': { unit: 'mm', read: geometry('OAL') },
  'L/D': { unit: 'ratio', read: geometry('LD') },
  'corner radius': { unit: 'mm', read: geometry('RE') },
  /**
   * How far the flutes reach past the tool's own corner: `LCF − RE`.
   *
   * A cut with nothing under it is taken past the bottom, and what has to
   * clear that overshoot is the **corner**, not the tip — Justin Mimbs' note
   * on reach curves: the analysis adds the tool's corner radius on top of the
   * overcut. Written as a field rather than as a second term on the rule
   * because a bound takes one adjustment, and because "how much flute is
   * below the corner" is the length somebody is actually measuring. A flat
   * end has no corner, so it reads its whole flute length and the rule means
   * for it exactly what it meant before.
   */
  'flute length past the corner': {
    unit: 'mm',
    read: (tool) => {
      const flutes = tool.geometry.LCF
      return flutes === undefined ? null : flutes - (tool.geometry.RE ?? 0)
    },
  },
  flutes: { unit: 'count', read: geometry('NOF') },
  'tip angle': { unit: 'deg', read: geometry('SIG') },
  'shank diameter': { unit: 'mm', read: geometry('SFDM') },
  'shoulder length': { unit: 'mm', read: geometry('shoulder-length') },
  'shoulder diameter': { unit: 'mm', read: geometry('shoulder-diameter') },
}

export const TOOL_WORDS: Readonly<Record<string, (tool: CatalogTool) => string | null>> = {
  form: (tool) => tool.form,
  shank: shankOf,
  brand: (tool) => tool.brand,
}

/**
 * What a rule may say about the stack, once a tool is chosen.
 *
 * These are read by the holder stage of `judge.ts` from an assembly and its
 * sweep against the feature's reach curve; they are named here so the sheet
 * can be checked without one.
 */
export const HOLDER_NUMBERS: Readonly<Record<string, { readonly unit: 'mm' | '%' | 'count' }>> = {
  stickout: { unit: 'mm' },
  'gauge length': { unit: 'mm' },
  'held share': { unit: '%' },
  'radial clearance': { unit: 'mm' },
  'axial clearance': { unit: 'mm' },
  'collet series': { unit: 'count' },
  'nose diameter': { unit: 'mm' },
}

/* ---------------------------------------------------------------- rules -- */

/** The right-hand side of a bound: what the tool's number is held against. */
export type Term =
  | { readonly kind: 'feature'; readonly name: string }
  | { readonly kind: 'knob'; readonly name: string }
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'best'; readonly field: string }

export interface Adjustment {
  readonly sign: 1 | -1
  readonly term:
    | { readonly kind: 'knob'; readonly name: string }
    | { readonly kind: 'number'; readonly value: number; readonly percent: boolean }
}

export type Test =
  | {
      readonly kind: 'bound'
      readonly field: string
      readonly operator: Operator
      readonly base: Term
      readonly adjust: Adjustment | null
    }
  | { readonly kind: 'is'; readonly field: string; readonly not: boolean; readonly value: string }
  | {
      readonly kind: 'rank'
      readonly field: string
      readonly direction: 'smallest' | 'largest'
      /** `largest up to 90 % of largest tool diameter`: past the cap, tools tie. */
      readonly capPercent: number | null
      readonly capOf: string | null
    }
  /**
   * `corner radius closest to floor fillet radius`, `diameter closest to
   * largest tool diameter - corner clearance`, or `… closest to 90 % of …`.
   */
  | {
      readonly kind: 'rank'
      readonly field: string
      readonly direction: 'closest'
      readonly to: string
      readonly toPercent: number
      readonly adjust: Adjustment | null
    }
  /** `form in order chamfer mill; ball end mill`: listed first is best, unlisted last. */
  | {
      readonly kind: 'rank'
      readonly field: string
      readonly direction: 'order'
      readonly order: ReadonlyArray<string>
    }

export interface Rule {
  readonly line: number
  /** The feature pattern as written: `*Hole`, `Pocket`, `*`. */
  readonly feature: string
  readonly when: string
  readonly condition: Condition
  /** Tool-type patterns as written: `drill`, `*end mill`, `*`. */
  readonly toolTypes: ReadonlyArray<string>
  readonly stage: Stage
  readonly level: Level
  readonly test: Test
  readonly text: string
  readonly note: string
}

const escape = (piece: string): string => piece.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** `*` matches anything; each piece between stars is matched as written, after `plain`. */
const globOf = (pattern: string, plain: (piece: string) => string): RegExp =>
  new RegExp(
    `^${pattern
      .split('*')
      .map((piece) => escape(plain(piece)))
      .join('.*')}$`,
  )

/** Whether a feature type is one the row names: `*Hole` takes `BlindHole` and `ThroughHole`. */
export const featureMatches = (pattern: string, featureType: string): boolean =>
  globOf(pattern, featureKey).test(featureKey(featureType))

/** The two words a `tool types` cell may use for the shank rather than the form. */
export const SHANK_PATTERNS = ['full shank', 'reduced shank'] as const

/** Whether a tool form is one the row names: `*end mill` takes every end mill. */
export const toolTypeMatches = (pattern: string, form: string): boolean =>
  globOf(pattern, (piece) => piece.trim().toLowerCase()).test(form.toLowerCase())

/**
 * Whether one `tool types` pattern takes this tool: its form, or — for
 * `full shank` / `reduced shank` — its shank. A tool whose shank cannot be
 * told (no shoulder stated) is taken by neither shank word.
 *
 * A pattern may be written **`not <pattern>`**, which takes every tool the
 * pattern does not. It exists because a rule that holds for everything except
 * one kind of tool could otherwise only be written by naming every other kind
 * — and the first one that needed it was the diameter cap, which every tool
 * obeys except a drill, whose own band is the bore plus the oversize knob
 * (Paul, 2026-08-31: "drill oversize can and should widen the band").
 */
export const patternCovers = (pattern: string, tool: CatalogTool): boolean => {
  const word = pattern.trim().toLowerCase()
  const negated = word.startsWith('not ')
  if (negated) {
    return !patternCovers(word.slice(4), tool)
  }
  if (word === 'full shank' || word === 'reduced shank') {
    const shank = shankOf(tool)
    return shank !== null && word === `${shank} shank`
  }
  return toolTypeMatches(pattern, tool.form)
}

/**
 * Whether a pattern takes a tool **form**, without a tool to ask.
 *
 * What a feature's defaults row lists is forms, so this is how a rule is
 * checked against the set of tools a feature considers. The shank words are
 * about one tool rather than a form, so no form is covered by them: a rule
 * written on the shank is never universal, which is the conservative answer.
 */
export const patternCoversForm = (pattern: string, form: string): boolean => {
  const word = pattern.trim().toLowerCase()
  if (word.startsWith('not ')) {
    return !patternCoversForm(word.slice(4), form)
  }
  if ((SHANK_PATTERNS as ReadonlyArray<string>).includes(word)) {
    return false
  }
  return toolTypeMatches(word, form)
}

const knownTerm = (raw: string, knobs: ReadonlyArray<Knob>): Term | null => {
  const text = raw.trim()
  const number = Number(text)
  if (text !== '' && Number.isFinite(number)) {
    return { kind: 'number', value: number }
  }
  const best = /^best\s+(.+)$/i.exec(text)
  if (best) {
    const field = best[1]!.trim()
    return field in TOOL_NUMBERS ? { kind: 'best', field } : null
  }
  if (text in FIELDS) {
    return { kind: 'feature', name: text }
  }
  if (knobs.some((knob) => knob.name === text.toLowerCase())) {
    return { kind: 'knob', name: text.toLowerCase() }
  }
  return null
}

const knownAdjustment = (
  sign: 1 | -1,
  raw: string,
  knobs: ReadonlyArray<Knob>,
): Adjustment | null => {
  const text = raw.trim()
  const percent = /^(-?\d+(?:\.\d+)?)\s*%$/.exec(text)
  if (percent) {
    return { sign, term: { kind: 'number', value: Number(percent[1]), percent: true } }
  }
  const number = Number(text)
  if (text !== '' && Number.isFinite(number)) {
    return { sign, term: { kind: 'number', value: number, percent: false } }
  }
  if (knobs.some((knob) => knob.name === text.toLowerCase())) {
    return { sign, term: { kind: 'knob', name: text.toLowerCase() } }
  }
  return null
}

const BOUND = /^(.+?)\s*(<=|>=|=|<|>)\s*(.+)$/
const ADJUSTED = /^(.+?)\s+([+\-−])\s+(.+)$/
const IS = /^(form|shank|brand)\s+is\s+(not\s+)?(.+)$/i
const RANK =
  /^(.+?)\s+(smallest|largest|shortest|longest)(?:\s+up to\s+(\d+(?:\.\d+)?)\s*%\s+of\s+(.+))?$/i
const CLOSEST = /^(.+?)\s+closest to\s+(?:(\d+(?:\.\d+)?)\s*%\s+of\s+)?(.+)$/i
const ORDER = /^(form|shank|brand)\s+in order\s+(.+)$/i

const numbersFor = (stage: Stage): Readonly<Record<string, unknown>> =>
  stage === 'holder' ? HOLDER_NUMBERS : TOOL_NUMBERS

/** Parses one `rule` cell for one stage, or explains why it cannot. */
export const parseTest = (
  raw: string,
  stage: Stage,
  knobs: ReadonlyArray<Knob>,
): { test: Test } | { error: string } => {
  const text = raw.trim().replace(/\s+/g, ' ')
  const numbers = numbersFor(stage)
  const fieldList = Object.keys(numbers).join(', ')

  const order = ORDER.exec(text)
  if (order) {
    if (stage === 'holder') {
      return { error: `"${text}" is about a tool; this row is for the holder.` }
    }
    const field = order[1]!.toLowerCase()
    const values = order[2]!
      .split(';')
      .map((each) => each.trim())
      .filter(Boolean)
    const unknown = field === 'form' ? values.find((value) => !isToolForm(value)) : undefined
    if (unknown) {
      return {
        error: `"${unknown}" is not a tool type. Known: ${TOOL_FORMS.map((each) => each.value).join(', ')}.`,
      }
    }
    return { test: { kind: 'rank', field, direction: 'order', order: values } }
  }

  const closest = CLOSEST.exec(text)
  if (closest) {
    const field = closest[1]!.trim()
    const target = closest[3]!.trim()
    if (!(field in numbers)) {
      return { error: `"${field}" is not a ${stage} field. Known: ${fieldList}.` }
    }
    const adjusted = ADJUSTED.exec(target)
    const to = (adjusted ? adjusted[1]! : target).trim()
    if (!(to in FIELDS)) {
      return { error: `"${to}" is not a feature field. Known: ${Object.keys(FIELDS).join(', ')}.` }
    }
    let adjust: Adjustment | null = null
    if (adjusted) {
      adjust = knownAdjustment(adjusted[2] === '+' ? 1 : -1, adjusted[3]!, knobs)
      if (!adjust) {
        return { error: `"${adjusted[3]!.trim()}" is not a knob, a number, or a percentage.` }
      }
    }
    return {
      test: {
        kind: 'rank',
        field,
        direction: 'closest',
        to,
        toPercent: closest[2] === undefined ? 100 : Number(closest[2]),
        adjust,
      },
    }
  }

  const rank = RANK.exec(text)
  if (rank) {
    const field = rank[1]!.trim()
    const word = rank[2]!.toLowerCase()
    const capOf = rank[4]?.trim() ?? null
    if (!(field in numbers)) {
      return { error: `"${field}" is not a ${stage} field. Known: ${fieldList}.` }
    }
    if (capOf !== null && !(capOf in FIELDS)) {
      return { error: `"${capOf}" is not a feature field.` }
    }
    return {
      test: {
        kind: 'rank',
        field,
        direction: word === 'smallest' || word === 'shortest' ? 'smallest' : 'largest',
        capPercent: rank[3] === undefined ? null : Number(rank[3]),
        capOf,
      },
    }
  }

  const is = IS.exec(text)
  if (is) {
    if (stage === 'holder') {
      return { error: `"${text}" is about a tool; this row is for the holder.` }
    }
    const field = is[1]!.toLowerCase()
    const value = is[3]!.trim()
    if (field === 'form' && !isToolForm(value)) {
      return {
        error: `"${value}" is not a tool type. Known: ${TOOL_FORMS.map((each) => each.value).join(', ')}.`,
      }
    }
    if (field === 'shank' && value !== 'reduced' && value !== 'full') {
      return { error: `A shank is "reduced" or "full", not "${value}".` }
    }
    return { test: { kind: 'is', field, not: is[2] !== undefined, value } }
  }

  const bound = BOUND.exec(text)
  if (bound) {
    const field = bound[1]!.trim()
    const operator = bound[2] as Operator
    const right = bound[3]!.trim()
    if (!(field in numbers)) {
      return { error: `"${field}" is not a ${stage} field. Known: ${fieldList}.` }
    }
    const adjusted = ADJUSTED.exec(right)
    const baseText = adjusted ? adjusted[1]! : right
    const base = knownTerm(baseText, knobs)
    if (!base) {
      return {
        error: `"${baseText.trim()}" is not a feature field, a knob, a number, or "best <tool field>".`,
      }
    }
    let adjust: Adjustment | null = null
    if (adjusted) {
      adjust = knownAdjustment(adjusted[2] === '+' ? 1 : -1, adjusted[3]!, knobs)
      if (!adjust) {
        return { error: `"${adjusted[3]!.trim()}" is not a knob, a number, or a percentage.` }
      }
    }
    return { test: { kind: 'bound', field, operator, base, adjust } }
  }

  return {
    error: `"${text}" is not a rule. Write a bound ("diameter <= largest tool diameter"), an is ("form is drill"), or a rank ("L/D smallest").`,
  }
}

/** The rules sheet, parsed and checked against the knobs: every problem names its line, and a row with a problem is dropped. */
export const parseRules = (
  csv: string,
  knobs: ReadonlyArray<Knob>,
): { rules: Array<Rule>; problems: Array<SheetProblem> } => {
  const { rows, problems } = rowsOf(csv, [
    'feature',
    'when',
    'tool types',
    'for',
    'rule',
    'level',
    'note',
  ])
  const rules: Array<Rule> = []
  for (const { at, cell } of rows) {
    const feature = cell('feature')
    if (feature === '') {
      problems.push({ line: at, message: 'No feature named.' })
      continue
    }
    const parsed = parseCondition(cell('when'))
    if ('error' in parsed) {
      problems.push({ line: at, message: parsed.error })
      continue
    }
    const toolTypes = cell('tool types')
      .split(';')
      .map((each) => each.trim())
      .filter(Boolean)
    if (toolTypes.length === 0) {
      problems.push({ line: at, message: 'No tool types named; use * for all of them.' })
      continue
    }
    const unknownType = toolTypes
      // `not drill` is the `drill` pattern, read the other way round.
      .map((pattern) =>
        pattern.toLowerCase().startsWith('not ') ? pattern.slice(4).trim() : pattern,
      )
      .find(
        (pattern) =>
          !pattern.includes('*') &&
          !isToolForm(pattern) &&
          !(SHANK_PATTERNS as ReadonlyArray<string>).includes(pattern.toLowerCase()),
      )
    if (unknownType) {
      problems.push({
        line: at,
        message: `"${unknownType}" is not a tool type. Known: ${TOOL_FORMS.map((each) => each.value).join(', ')}.`,
      })
      continue
    }
    const forCell = cell('for').toLowerCase()
    const stage: Stage | null =
      forCell === '' || forCell === 'tool' ? 'tool' : forCell === 'holder' ? 'holder' : null
    if (stage === null) {
      problems.push({
        line: at,
        message: `"${cell('for')}" is not a stage. Leave it blank, or write "holder".`,
      })
      continue
    }
    const level = cell('level').toLowerCase()
    if (!(LEVELS as ReadonlyArray<string>).includes(level)) {
      problems.push({
        line: at,
        message: `"${cell('level')}" is not a level. Use one of ${LEVELS.join(', ')}.`,
      })
      continue
    }
    const test = parseTest(cell('rule'), stage, knobs)
    if ('error' in test) {
      problems.push({ line: at, message: test.error })
      continue
    }
    if ((test.test.kind === 'rank') !== (level === 'rank')) {
      problems.push({
        line: at,
        message:
          level === 'rank'
            ? 'A rank row needs a rank rule: "… smallest", "… largest", "… closest to …" or "form in order …".'
            : `A rank rule needs the level "rank", not "${level}".`,
      })
      continue
    }
    rules.push({
      line: at,
      feature,
      when: cell('when'),
      condition: parsed.condition,
      toolTypes,
      stage,
      level: level as Level,
      test: test.test,
      text: cell('rule').trim(),
      note: cell('note'),
    })
  }
  return { rules, problems }
}

/* ---------------------------------------------------------- selection -- */

/** The committed sheets. Their problems are the test's to report, not the page's. */
export const KNOBS = parseKnobs(knobsCsv)
export const RULES = parseRules(rulesCsv, KNOBS.knobs)

/** A knob's value, or null when the sheet does not name it. */
export const knobValue = (name: string, knobs: ReadonlyArray<Knob> = KNOBS.knobs): number | null =>
  knobs.find((knob) => knob.name === name.toLowerCase())?.value ?? null

/**
 * The knobs with some values replaced — the clearances entered on the
 * drawing card, so the rules read what the holder sweep reads. A name the
 * sheet does not have is ignored: the sheet says which knobs exist.
 */
export const knobsWith = (
  values: Record<string, number>,
  knobs: ReadonlyArray<Knob> = KNOBS.knobs,
): Array<Knob> => {
  const wanted = new Map(Object.entries(values).map(([name, value]) => [name.toLowerCase(), value]))
  return knobs.map((knob) => {
    const value = wanted.get(knob.name)
    return value === undefined ? knob : { ...knob, value }
  })
}

/**
 * The rows that apply to this feature on this part, in sheet order.
 *
 * Rank rows are the one place order is meaning, and a row written for the
 * feature beats a `*` row: they come first, then the general ones, each set in
 * the order the sheet has them. Everything else keeps sheet order plainly.
 */
export const rulesFor = (
  feature: PartFeature,
  partFeatures: ReadonlyArray<PartFeature>,
  rules: ReadonlyArray<Rule> = RULES.rules,
): Array<Rule> => {
  const facts = sheetOf(feature, partFeatures)
  const applicable = rules.filter(
    (rule) => featureMatches(rule.feature, feature.featureType) && rule.condition(facts),
  )
  const specific = applicable.filter((rule) => rule.level === 'rank' && rule.feature !== '*')
  const general = applicable.filter((rule) => rule.level === 'rank' && rule.feature === '*')
  const tests = applicable.filter((rule) => rule.level !== 'rank')
  return [...tests, ...specific, ...general]
}

/** Whether a rule names this tool's form. */
export const ruleCovers = (rule: Rule, tool: CatalogTool): boolean =>
  rule.toolTypes.some((pattern) => patternCovers(pattern, tool))

/** Every knob a rule names, so a sheet can be checked for knobs nobody uses. */
export const knobsNamed = (rule: Rule): Array<string> => {
  const { test } = rule
  if (test.kind === 'rank' && 'adjust' in test && test.adjust?.term.kind === 'knob') {
    return [test.adjust.term.name]
  }
  if (test.kind !== 'bound') {
    return []
  }
  const names: Array<string> = []
  if (test.base.kind === 'knob') {
    names.push(test.base.name)
  }
  if (test.adjust?.term.kind === 'knob') {
    names.push(test.adjust.term.name)
  }
  return names
}
