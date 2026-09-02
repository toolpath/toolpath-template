import type { PartFeature } from '@toolpath/part-contracts'
import type { CatalogTool } from '@toolpath/catalog-data'
import { plainFormat, type Format, type Verdict } from './judge'
import { RULES, rulesFor, type Rule } from './rules'
import { shortfallOf, type ThreadReach } from './hole-mode'

/**
 * What the matching says about a tool, **column by column**.
 *
 * The list used to explain itself in prose beside the row. Paul's call
 * (2026-08-31): the table is the tools, and the explanation belongs on the
 * number it is about — a tick on the fields the rules read and passed, and
 * the field that failed in red, in three words.
 *
 * Which fields were read is a property of the *feature*, not of the tool: the
 * sheet's rows for this feature name them, and every tool in the list was
 * judged against the same ones. Whether one passed is a property of the tool.
 */

/** The geometry column each rule field is written in. */
const CODES: Readonly<Record<string, string>> = {
  diameter: 'DC',
  'flute length': 'LCF',
  'flute length past the corner': 'LCF',
  'length below holder': 'LBH',
  'overall length': 'OAL',
  'L/D': 'LD',
  'corner radius': 'RE',
  flutes: 'NOF',
  'tip angle': 'SIG',
  'shank diameter': 'SFDM',
  'shoulder length': 'shoulder-length',
  'shoulder diameter': 'shoulder-diameter',
}

export type Mark =
  | {
      readonly ok: true
      /**
       * A number the column is worth reading with, not a fault.
       *
       * A drill in a hole is chosen on how far off the hole it is, and that
       * distance is not on the tool or on the feature — it is between them
       * (Paul, 2026-08-31). Shown in the column it is about, in the plain
       * colour of a fact.
       */
      readonly note?: string
      /**
       * A tick, in the colour of a caution.
       *
       * A bull nose in a pocket the model draws sharp **passes** once the
       * floor radius allowed is turned up to admit it — but it still leaves
       * that radius, and a plain green tick would say the floor comes out
       * sharp. Orange says "allowed, and here is what you allowed" (Paul,
       * 2026-08-31).
       */
      readonly caution?: string
    }
  /**
   * Why it did not, in two words, with the rule's own sentence behind it —
   * and **which kind of rule said so**.
   *
   * Neither is written into the row: the table hangs both on one glyph beside
   * the number, in the mark's own colour, and shows them on hover (Paul,
   * 2026-09-02: "it is writing out too large — it should be red text, red x
   * icon with hover over to show that").
   *
   * A `must` is a fact about the geometry and the tool is not shown; a
   * `should` is a caution and the tool is. Painting them the same made a tool
   * of exactly the right size read as rejected: it passes "no wider than the
   * tightest corner" and only trips "stay 5 % under it" (Paul, 2026-08-31:
   * "why is this tool diameter too large? Is it because it's a perfect
   * match?" — it was).
   */
  | {
      readonly ok: false
      readonly level: 'must' | 'should'
      readonly why: string
      readonly detail: string
    }

/**
 * The tool types this feature cautions about, and why — the sheet's own
 * words, not a list of somebody's.
 *
 * A bull nose on a floor the model draws sharp leaves its radius in the
 * corner; the sheet says so as a `should` on the corner radius, naming the
 * types it applies to. Read from there so that a sheet edit moves this with
 * it, and so "whatever tool leaves a radius" stays whatever the sheet says
 * it is (Paul, 2026-08-31).
 */
export const cautionedTypes = (
  feature: PartFeature,
  part: ReadonlyArray<PartFeature>,
  rules: ReadonlyArray<Rule> = RULES.rules,
): { readonly note: string; readonly values: ReadonlyArray<string> } | null => {
  const values = new Set<string>()
  let note = ''
  for (const rule of rulesFor(feature, part, rules)) {
    if (
      rule.stage !== 'tool' ||
      rule.level !== 'should' ||
      rule.test.kind !== 'bound' ||
      rule.test.field !== 'corner radius'
    ) {
      continue
    }
    for (const type of rule.toolTypes) {
      if (type !== '*') {
        values.add(type)
      }
    }
    note = note === '' ? rule.note : note
  }
  return values.size === 0
    ? null
    : { note: note === '' ? 'leaves a radius on this floor' : note, values: [...values] }
}

/** The geometry columns this feature's rules actually read. */
export const testedCodes = (
  feature: PartFeature,
  part: ReadonlyArray<PartFeature>,
  rules: ReadonlyArray<Rule> = RULES.rules,
): ReadonlySet<string> => {
  const codes = new Set<string>()
  for (const rule of rulesFor(feature, part, rules)) {
    if (rule.stage !== 'tool' || rule.test.kind === 'rank') {
      continue
    }
    const code = CODES[rule.test.field]
    if (code !== undefined) {
      codes.add(code)
    }
  }
  return codes
}

/**
 * Two words for a bound that did not hold — for a `must`, which is a refusal.
 *
 * The reason itself says the numbers — "diameter 12 over 10 largest tool
 * diameter" — and the cell already shows the number, so what is missing is
 * which way it is wrong.
 */
const shortly = (rule: Rule | null, text: string): string => {
  if (rule === null || rule.test.kind !== 'bound') {
    return text.split(' — ')[0] ?? text
  }
  const over = rule.test.operator === '<=' || rule.test.operator === '<'
  const under = rule.test.operator === '>=' || rule.test.operator === '>'
  return over ? 'too large' : under ? 'too small' : 'wrong'
}

/**
 * What a caution has to say in the table, or nothing.
 *
 * **A tool that fits is not marked.** The `must` rows decide fit, and a
 * `should` is a preference the ranking already acts on: a ⌀0.125 in in a
 * pocket whose largest tool is ⌀0.127 in passes "no wider than the tightest
 * corner" and only trips "stay 5 % under it", and calling that *tight*
 * described a tool that fits as a problem (Paul, 2026-08-31: "we shouldn't be
 * showing any of the tight messages — if the tool is equal to or smaller than
 * the largest tool diameter for the pocket, it fits").
 *
 * The one caution that says something the geometry does not is the corner
 * radius: a bull nose standing in for a flat end leaves its own radius on a
 * floor the model draws sharp, and that is a number somebody decides on. So
 * that one speaks — on the glyph beside the value, which is where every mark's
 * words go since 2026-09-02.
 */
const cautionSays = (
  rule: Rule | null,
  said: {
    readonly leaves: number | null
    readonly point: number | null
    readonly bottom: number | null
  },
  format: Format,
): string | null => {
  if (rule?.test.kind !== 'bound') {
    return null
  }
  if (rule.test.field === 'corner radius' && said.leaves !== null && said.leaves > 0) {
    return `leaves ${format(said.leaves, 'mm')} floor radius`
  }
  /**
   * A drill's point against the bottom it is cutting.
   *
   * The sheet cautions in both directions — a shallower drill leaves a
   * shallower cone, a sharper one leaves a step — and until now the table said
   * nothing at all, because the wording it had ("tight") was meaningless here
   * (Paul, 2026-08-31: "this should warn about tip angle mismatch").
   */
  if (rule.test.field === 'tip angle' && said.point !== null && said.bottom !== null) {
    const off = said.point - said.bottom
    if (Math.abs(off) < 0.05) {
      return null
    }
    return `${format(Math.abs(off), 'deg')} ${off > 0 ? 'shallower' : 'sharper'} than the bottom`
  }
  return null
}

export interface MarkOptions {
  /** Words a number in the person's unit; tests take the default. */
  readonly format?: Format
  /**
   * The tool forms this feature cautions about — `cautionedTypes`' values.
   *
   * One of those forms with a radius that passed leaves that radius on the
   * floor within what the filters allow, and its tick is orange rather than
   * green.
   */
  readonly cautionedForms?: ReadonlyArray<string>
  /**
   * The hole this feature is, in millimetres, where it is one.
   *
   * A drill's diameter column then says how far off the hole it is — the
   * quantity its two rules are written in.
   */
  readonly holeDiameter?: number | null
  /**
   * What that diameter *is*, for the note to name.
   *
   * **A deviation from nothing named is a number nobody can act on** (Paul,
   * 2026-09-01: they should say "Drill Diameter (+0.004 from specified tap
   * drill)"). On a threaded hole the drill is judged against the tap drill the
   * thread wants, not against the bore the model draws, and a bare `+0.004`
   * left somebody working out which.
   */
  readonly measuredFrom?: string
  /**
   * The cone at the bottom of this hole, in degrees, where it has one.
   *
   * A drill's point angle is cautioned against it — a 140° drill in a 118°
   * bottom leaves a shallower cone — and the caution says by how much.
   */
  readonly tipAngle?: number | null
  /**
   * The radius the model draws in the floor, where it draws one.
   *
   * A tool under it does not finish the fillet — it leaves a step somebody
   * has to think about — so its corner radius is ticked in the colour of a
   * caution, and only an exact match is green (Paul, 2026-08-31). Over it is
   * already a refusal: a bigger nose cannot sit in the fillet.
   */
  readonly floorFillet?: number | null
}

/**
 * The mark for each column, for one tool.
 *
 * A column the rules never read gets nothing at all — a tick on a number
 * nobody checked would be a claim the application cannot make.
 */
export const marksFor = (
  verdict: Verdict,
  tested: ReadonlySet<string>,
  {
    format = plainFormat,
    cautionedForms = [],
    holeDiameter = null,
    measuredFrom = 'the hole',
    tipAngle = null,
    floorFillet = null,
  }: MarkOptions = {},
): Record<string, Mark> => {
  const marks: Record<string, Mark> = {}
  for (const code of tested) {
    marks[code] = { ok: true }
  }
  const bore = verdict.tool.geometry.DC
  if (
    marks.DC?.ok === true &&
    holeDiameter !== null &&
    bore !== undefined &&
    verdict.tool.form === 'drill'
  ) {
    const off = bore - holeDiameter
    const shown = format(Math.abs(off), 'mm')
    /*
      **A drill on the size has nothing to say** (Paul, 2026-09-02: "exact
      match drills don't need anything"). It read "±0.000 in from the tap
      drill", which is a deviation of none announced as a deviation. Measured
      by what the column would *print*: a difference too small to show at this
      precision is not one somebody can act on, so the tick stands alone.
    */
    if (Number.parseFloat(shown) !== 0) {
      marks.DC = { ok: true, note: `${off > 0 ? '+' : '−'}${shown} from ${measuredFrom}` }
    }
  }
  /**
   * A drill point that differs from the bottom it cuts, **within tolerance**.
   *
   * The sheet's two point-angle rows only fire past the tolerance knobs — 35°
   * shallower by default — so a 140° drill in a 118° hole passed in silence.
   * It still leaves a shallower cone, and that is a fact worth a second look
   * rather than a fault: an orange tick, saying by how much, exactly as an
   * allowed floor radius does (Paul, 2026-08-31).
   */
  const point = verdict.tool.geometry.SIG
  if (
    marks.SIG?.ok === true &&
    tipAngle !== null &&
    point !== undefined &&
    verdict.tool.form === 'drill' &&
    Math.abs(point - tipAngle) >= 0.05
  ) {
    const off = point - tipAngle
    marks.SIG = {
      ok: true,
      caution: `${format(Math.abs(off), 'deg')} ${off > 0 ? 'shallower' : 'sharper'} than the bottom`,
    }
  }
  const leaves = verdict.tool.geometry.RE
  if (
    marks.RE?.ok === true &&
    leaves !== undefined &&
    leaves > 0 &&
    cautionedForms.includes(verdict.tool.form)
  ) {
    marks.RE = {
      ok: true,
      caution: `leaves ${format(leaves, 'mm')} on the floor, which is allowed`,
    }
  }
  /**
   * A filleted floor: the column reads out the two radii and says nothing
   * more.
   *
   * It wore a caution — an orange tick on every bull nose whose nose is under
   * the model's fillet — and a warning nobody can read is worse than no
   * warning (Paul, 2026-09-01: "I don't know what it means"). A nose that fits
   * the fillet is allowed by the rules and is not a fault; what is worth
   * knowing is which two numbers are being compared, so the mark states them.
   * A nose *over* the fillet is refused outright by the rule that says a
   * bigger nose cannot sit in it, and that refusal has its own red.
   */
  if (
    marks.RE?.ok === true &&
    marks.RE.caution === undefined &&
    floorFillet !== null &&
    floorFillet > 0 &&
    leaves !== undefined &&
    floorFillet - leaves > 0.005
  ) {
    // The column already prints the tool's own radius, so the note is the
    // number it is being read against and nothing more — a cell three words
    // wide cannot hold a sentence (Paul, 2026-09-01).
    marks.RE = { ok: true, note: `in ${format(floorFillet, 'mm')} fillet` }
  }
  // Cautions first, so a rule that rules the tool out has the last word on a
  // column both of them read.
  for (const reason of verdict.warned) {
    const field = reason.rule?.test.kind === 'bound' ? reason.rule.test.field : null
    const code = field === null ? undefined : CODES[field]
    const says = cautionSays(
      reason.rule,
      { leaves: leaves ?? null, point: verdict.tool.geometry.SIG ?? null, bottom: tipAngle },
      format,
    )
    if (code === undefined || says === null) {
      continue
    }
    marks[code] = { ok: false, level: 'should', why: says, detail: reason.text }
  }
  for (const reason of verdict.removed) {
    const field = reason.rule?.test.kind === 'bound' ? reason.rule.test.field : null
    const code = field === null ? undefined : CODES[field]
    if (code === undefined) {
      continue
    }
    marks[code] = {
      ok: false,
      level: 'must',
      why: shortly(reason.rule, reason.text),
      detail: reason.text,
    }
  }
  return marks
}

/**
 * What stops a tap reaching, in the column it is about.
 *
 * The taps had a table of their own, which painted the failing length red and
 * wrote "0.14 in short" beside it. The list is the one table now (Paul,
 * 2026-09-02), and the one table says what is wrong with a row through its
 * marks — so the shortfall is translated into one rather than kept as a second
 * way of saying the same thing.
 *
 * A `must`: nothing that fails to reach the bottom of the hole is a tool for
 * it. Where the tap reaches, there is no mark and the row reads plainly.
 */
export const shortfallMarks = (
  tool: CatalogTool,
  reach: ThreadReach | null,
  format: Format,
): Record<string, Mark> => {
  const missed = shortfallOf(tool, reach)
  if (missed === null) {
    return {}
  }
  return {
    [missed.code]:
      missed.by === null
        ? {
            ok: false,
            level: 'must',
            why: 'fouls the part',
            detail: 'At the stickout this hole needs, the tool runs into the part on the way in.',
          }
        : {
            ok: false,
            level: 'must',
            why: `${format(missed.by, 'mm')} short`,
            detail:
              missed.code === 'LCF'
                ? 'Its threaded length does not reach the bottom of the hole.'
                : 'It does not stand far enough out of the holder to reach the bottom of the hole.',
          },
  }
}
