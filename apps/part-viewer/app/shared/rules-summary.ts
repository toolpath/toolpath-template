import type { PartFeature } from './contracts'
import { directionLabel, featureSummary } from './report'
import type { Band, FeatureVerdict, Rule } from './rules'
import { BANDS, bandRank, scorePart } from './rules'

/** One reading a rule made, named well enough to find the feature again. */
export interface WorstReading {
  readonly tag: string
  readonly band: Band
  readonly label: string
  readonly featureType: string
  readonly rule: string
  readonly value: number | null
  readonly metric: Rule['metric']
}

export interface RulesSummary {
  /** 0–100 over every reading in the plan. */
  readonly score: number
  /** How many readings there were: one per rule that spoke about one feature. */
  readonly readings: number
  readonly counts: Record<Band, number>
  /** How many rules had anything to say, of how many are in force. */
  readonly spoke: number
  readonly rules: number
  /** The readings that cost the most, worst first. */
  readonly worst: readonly WorstReading[]
}

/**
 * What this set makes of this part, before any of the detail.
 *
 * The question somebody arrives with is "how does this part look under my
 * limits", and it used to be answerable only by reading fourteen rules and
 * adding them up. Every number here is a count of something findable — a
 * summary that cannot be followed back into the list below it is a summary to
 * be taken on trust.
 */
export function rulesSummary(
  verdicts: readonly FeatureVerdict[],
  features: readonly PartFeature[],
  rules: readonly Rule[],
  /** How many of the worst readings to name. */
  worstCount = 6,
): RulesSummary {
  const part = scorePart(verdicts)
  const byTag = new Map(features.map((feature) => [feature.featureTag, feature]))
  const spoke = new Set<string>()
  const readings: WorstReading[] = []

  for (const verdict of verdicts) {
    const feature = byTag.get(verdict.tag)

    for (const result of verdict.results) {
      spoke.add(result.rule.id)

      if (!feature) continue

      readings.push({
        tag: verdict.tag,
        band: result.band,
        label: featureSummary(feature).type,
        featureType: feature.featureType,
        rule: result.rule.name,
        value: result.value,
        metric: result.rule.metric,
      })
    }
  }

  // Worst band first, and within a band the rule that counts for most: the top
  // of this list is what to argue with, and weight is how a shop said which
  // arguments matter.
  const worst = [...readings]
    .filter((reading) => bandRank(reading.band) >= bandRank('meh'))
    .sort((a, b) => bandRank(b.band) - bandRank(a.band))
    .slice(0, worstCount)

  return {
    score: Math.round(part.score * 100),
    readings: readings.length,
    counts: part.counts,
    spoke: spoke.size,
    rules: rules.filter((rule) => rule.enabled).length,
    worst,
  }
}

/** Which features a rule's readings landed on, once the filters have had a say. */
export function costlyCount(hits: readonly { band: Band }[]): number {
  return hits.filter((hit) => bandRank(hit.band) >= bandRank('meh')).length
}

/** The worst band a rule handed out, which is how hard it is being on this part. */
export function worstOf(hits: readonly { band: Band }[]): Band | null {
  return hits.reduce<Band | null>(
    (worst, hit) => (worst === null || bandRank(hit.band) > bandRank(worst) ? hit.band : worst),
    null,
  )
}

export const EMPTY_COUNTS: Record<Band, number> = Object.fromEntries(
  BANDS.map((band) => [band, 0]),
) as Record<Band, number>
