import type { ReachCurve } from '@toolpath/part-contracts'
import {
  clearance,
  colletsFor,
  holdBand,
  holderCanTake,
  holdersToShow,
  matchesFilters,
  seriesSize,
  stickoutLimits,
  type CatalogTool,
  type Collet,
  type Collision,
  type HoldBand,
  type Holder,
  type HolderFilters,
  type Margins,
  type StickoutPolicy,
} from '@toolpath/catalog-data'
import { KNOBS, knobValue, type Knob } from './rules'

/**
 * Every way to hold one tool for one feature, each pulled out as far as it
 * needs, graded, and the first that works recommended.
 *
 * Paul's rule (2026-08-29): find the holders that work and stand the tool out
 * to the length the feature needs — the flutes plus what the holder needs to
 * clear the part by the room asked for. Whether a stack *works* is then two
 * facts: nothing collides at that stickout, and enough of the tool is left in
 * the holder (`holdBand`). A stack that clears with a good hold is
 * recommended over one with a medium hold; a stack that collides at any
 * stickout the tool allows, or holds too little, is listed last and says why.
 *
 * The order among stacks that work is still `holdersFor`'s — smallest collet
 * series, shortest gauge — until the holder rank rows are rethought.
 */
export type Grade = HoldBand

export interface HolderOption {
  readonly holder: Holder
  /** The collet drawn and checked with it: the closest to on-size, or none for a bore. */
  readonly collet: Collet | null
  /**
   * True for a collet chuck whose series the crib stocks no collet of.
   *
   * **Offered, and never a fit claim.** Such a holder grips nothing as it
   * stands, so it is listed last, never recommended, and excluded from
   * {@link canBeHeld} — but it is *listed*, because "why is my ER16 chuck not
   * here" is the question hiding it creates, and the answer is a purchase
   * order rather than a fact about the tool. `seriesUnstocked` in
   * `@toolpath/catalog-data` draws the distinction this reports.
   */
  readonly unstocked: boolean
  /** The length to set the tool up at, or null where the tool states no flutes. */
  readonly stickout: number | null
  /** What the holder needs to clear the part by the margins, or null without a reach curve. */
  readonly required: number | null
  /**
   * The stickouts that work for this feature, mm: from the greater of the
   * flutes (or the neck) and what the holder needs to clear, up to what
   * leaves the good hold in. `min` above `max` means nothing clears — the
   * holder needs more than the tool allows. Paul (2026-08-30): a range whose
   * low end collides is not a range.
   */
  readonly range: { readonly min: number; readonly max: number | null } | null
  readonly band: HoldBand | null
  /** Null where there is no reach curve to check against. */
  readonly clears: boolean | null
  readonly collisions: ReadonlyArray<Collision>
  readonly grade: Grade
  readonly recommended: boolean
}

export interface HoldThresholds {
  /** Share of the overall length held that is good — and the stickout's ceiling. */
  readonly good: number
  /** Share held below which the assembly is not compatible. */
  readonly least: number
  /** The shortest stickout worth setting up, mm. */
  readonly leastStickout: number
  /** The increment the default stickout lands on, mm, by the tool's unit system. */
  readonly step: { readonly inch: number; readonly metric: number }
}

/** The knobs the holder stage reads by name — settings, not rule rows — and which knob each is. */
export const SETTING_KNOBS = {
  good: 'good hold',
  least: 'least hold',
  leastStickout: 'least stickout',
  inchStep: 'stickout step',
  metricStep: 'metric stickout step',
} as const

/** The thresholds as the sheet has them. */
export const thresholdsFrom = (knobs: ReadonlyArray<Knob> = KNOBS.knobs): HoldThresholds => ({
  good: (knobValue(SETTING_KNOBS.good, knobs) ?? 33) / 100,
  least: (knobValue(SETTING_KNOBS.least, knobs) ?? 25) / 100,
  leastStickout: knobValue(SETTING_KNOBS.leastStickout, knobs) ?? 0,
  step: {
    inch: knobValue(SETTING_KNOBS.inchStep, knobs) ?? 0,
    metric: knobValue(SETTING_KNOBS.metricStep, knobs) ?? 0,
  },
})

/** The same thresholds as the stickout policy `stickoutLimits` takes. */
export const policyOf = (thresholds: HoldThresholds): StickoutPolicy => ({
  heldShare: thresholds.good,
  least: thresholds.leastStickout,
  step: thresholds.step,
})

const GRADE_ORDER: Record<Grade, number> = { good: 0, medium: 1, bad: 2 }

/** One holder for this tool at this feature: pulled out as far as it needs, and graded. */
const optionFor = (
  tool: CatalogTool,
  holder: Holder,
  collets: ReadonlyArray<Collet>,
  curve: ReachCurve | null,
  margins: Margins,
  thresholds: HoldThresholds,
): HolderOption => {
  const collet = colletsFor(tool, holder, collets)[0] ?? null
  const probe =
    curve === null
      ? null
      : clearance({ tool, holder, collet, stickout: 0, maxStickout: null }, curve, margins)
  const required = probe?.requiredStickout ?? null
  const limits = stickoutLimits(tool, collet, required, policyOf(thresholds))
  const stickout = limits?.default ?? null
  const band = stickout === null ? null : holdBand(tool, stickout, thresholds)
  const check =
    curve === null || stickout === null
      ? null
      : clearance({ tool, holder, collet, stickout, maxStickout: null }, curve, margins)
  const clears = check === null ? null : check.clears
  const grade: Grade = clears === false ? 'bad' : (band ?? 'medium')
  return {
    holder,
    collet,
    stickout,
    required,
    range:
      limits === null
        ? null
        : { min: Math.max(limits.min, required ?? limits.min), max: limits.max },
    band,
    clears,
    collisions: check?.collisions ?? [],
    grade,
    unstocked: false,
    recommended: false,
  }
}

/**
 * Whether an unstocked chuck is worth offering for this tool at all.
 *
 * **The series' nominal size as a loose bound** — an ER16 closes on 10 mm, not
 * 16, and inventing the real capacity table here would be a clamping claim made
 * up on the spot. Its whole job is to keep a 25 mm shank out of an ER11 chuck,
 * where offering it would be absurd enough to read as a claim that it fits.
 */
const withinSeries = (tool: CatalogTool, holder: Holder): boolean => {
  const shank = tool.geometry.SFDM
  if (shank === undefined) {
    return false
  }
  const bound = seriesSize(holder.colletSeries)
  return bound === null || shank <= bound
}

export const holderOptions = (
  tool: CatalogTool,
  holders: ReadonlyArray<Holder>,
  collets: ReadonlyArray<Collet>,
  filters: HolderFilters,
  curve: ReachCurve | null,
  margins: Margins,
  thresholds: HoldThresholds,
): Array<HolderOption> => {
  const shown = holdersToShow(tool, holders, collets, filters)
  const options = shown.holding.map((holder) =>
    optionFor(tool, holder, collets, curve, margins, thresholds),
  )
  const ordered = options
    .map((option, index) => ({ option, index }))
    .sort((a, b) => GRADE_ORDER[a.option.grade] - GRADE_ORDER[b.option.grade] || a.index - b.index)
    .map((each) => each.option)
  /**
   * The chucks the crib has no collet for, after everything that grips.
   *
   * They are graded like the rest — the stack is drawn and checked with no
   * collet in it, which is what a shop would be looking at — but they sort
   * below every stocked holder whatever that grading says, because a holder
   * that cannot grip today is not competing with one that can.
   */
  const unstocked = shown.unstocked
    .filter((holder) => withinSeries(tool, holder))
    .map((holder) => ({
      ...optionFor(tool, holder, collets, curve, margins, thresholds),
      unstocked: true,
    }))
  const first = ordered[0]
  const graded =
    first && first.grade !== 'bad'
      ? ordered.map((option) => (option === first ? { ...option, recommended: true } : option))
      : ordered
  return [...graded, ...unstocked]
}

/**
 * Whether the crib can put this tool to the feature at all — the question
 * `canBeHeld` answers, asked without building every option: it stops at the
 * first holder that works. Asked of every tool that fits, on every change of
 * the clearances, so the short-circuit is what keeps the page quick.
 */
export const holdable = (
  tool: CatalogTool,
  holders: ReadonlyArray<Holder>,
  collets: ReadonlyArray<Collet>,
  filters: HolderFilters,
  curve: ReachCurve | null,
  margins: Margins,
  thresholds: HoldThresholds,
): boolean =>
  holders.some(
    (holder) =>
      matchesFilters(holder, filters) &&
      holderCanTake(tool, holder, collets) &&
      optionFor(tool, holder, collets, curve, margins, thresholds).grade !== 'bad',
  )

/**
 * Whether the crib can put this tool to the feature at all: at least one
 * holder that grips its shank, clears the part at a stickout the tool
 * allows, and keeps at least the least hold. Paul's rule (2026-08-29, again
 * 2026-08-30): a tool with no such holder is not shown in the list — it is
 * counted, not offered.
 */
export const canBeHeld = (options: ReadonlyArray<HolderOption>): boolean =>
  options.some((option) => !option.unstocked && option.grade !== 'bad')

/** Why a stack is graded as it is, in a few words for the list — and nothing when it is fine. */
export const describeGrade = (option: HolderOption): string => {
  // Said before anything geometric: a chuck with no collet in the crib holds
  // nothing, whatever the drawn stack clears.
  if (option.unstocked) {
    return option.holder.colletSeries === null
      ? 'the crib stocks no collet for it'
      : `the crib stocks no ${option.holder.colletSeries} collet`
  }
  if (option.clears === false) {
    const first = option.collisions[0]
    if (first?.part === 'shank' || first?.part === 'neck') {
      // The tool's own body, above the flutes: no stickout moves it.
      return `${first.part} rubs the wall above the flutes — no stickout clears it; longer flutes or a reduced shank would`
    }
    return first ? `${first.part} collides with the part` : 'collides with the part'
  }
  // Within the range is simply held, and says nothing — Paul's call: the hold
  // is worth a word only when it is bad.
  return option.band === 'bad' ? 'too little of the tool in the holder' : ''
}
