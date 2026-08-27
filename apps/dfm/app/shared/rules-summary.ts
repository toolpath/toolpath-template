import type { PartFeature } from './contracts'
import { featureSummary } from './report'
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

/**
 * One feature in a band, with what put it there.
 *
 * The band counts are per **feature** — a feature's own band, not one per
 * reading — so pressing `3 rats` has to answer with three features. The rules
 * beside each are the ones that cost it, worst first: the count says how much
 * trouble there is and this says what to argue with about it.
 */
export interface BandFeature {
  readonly tag: string
  readonly label: string
  readonly featureType: string
  readonly rules: readonly { readonly name: string; readonly band: Band; readonly weight: number }[]
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
  /** Every reading that cost something, worst first — the panel draws a few. */
  readonly worst: readonly WorstReading[]
  /** The features behind each band's count, so pressing one can show them. */
  readonly byBand: Readonly<Record<Band, readonly BandFeature[]>>
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
export const rulesSummary = (
  verdicts: readonly FeatureVerdict[],
  features: readonly PartFeature[],
  rules: readonly Rule[],
): RulesSummary => {
  /*
   * **Only the features handed in**, all the way through.
   *
   * The score and the band counts were computed over every verdict while the
   * worst list was filtered to these — two answers to one question, and the
   * visible one was the wrong one: the headline never moved as the plan
   * changed, and read the same on a part with nothing mapped as on a part
   * mapped end to end.
   */
  const byTag = new Map(features.map((feature) => [feature.featureTag, feature]))
  const judged = verdicts.filter((verdict) => byTag.has(verdict.tag))

  const part = scorePart(judged)
  const spoke = new Set<string>()
  const readings: WorstReading[] = []

  for (const verdict of judged) {
    const feature = byTag.get(verdict.tag)
    if (!feature) continue

    for (const result of verdict.results) {
      spoke.add(result.rule.id)

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

  /*
   * Worst band first, and **all of them**.
   *
   * It was cut to six here, which made "the worst of it" a list that could not
   * be argued past: a part with nine things wrong showed six and said nothing
   * about the rest. How many to draw is a question about a panel, so the panel
   * decides — it shows six and offers the rest.
   */
  const worst = [...readings]
    .filter((reading) => bandRank(reading.band) >= bandRank('meh'))
    .sort((a, b) => bandRank(b.band) - bandRank(a.band))

  /*
   * The features behind each count, with what cost them.
   *
   * Built here rather than in the panel because it is the same walk that
   * produced the counts — two walks over the same verdicts is how a list comes
   * to disagree with the number above it.
   */
  const byBand: Record<Band, BandFeature[]> = {
    easy: [],
    alright: [],
    meh: [],
    rats: [],
    'no go': [],
  }

  for (const verdict of judged) {
    const feature = byTag.get(verdict.tag)
    if (!feature || !verdict.band) continue

    byBand[verdict.band].push({
      tag: verdict.tag,
      label: featureSummary(feature).type,
      featureType: feature.featureType,
      // Worst band first, then the heaviest rule: weight is how a shop said
      // which arguments matter.
      rules: [...verdict.results]
        .sort((a, b) => bandRank(b.band) - bandRank(a.band) || b.rule.weight - a.rule.weight)
        .map((result) => ({
          name: result.rule.name,
          band: result.band,
          weight: result.rule.weight,
        })),
    })
  }

  return {
    score: Math.round(part.score * 100),
    readings: readings.length,
    counts: part.counts,
    spoke: spoke.size,
    rules: rules.filter((rule) => rule.enabled).length,
    worst,
    byBand,
  }
}

/** Which features a rule's readings landed on, once the filters have had a say. */
export const costlyCount = (hits: readonly { band: Band }[]): number => {
  return hits.filter((hit) => bandRank(hit.band) >= bandRank('meh')).length
}

/** The worst band a rule handed out, which is how hard it is being on this part. */
export const worstOf = (hits: readonly { band: Band }[]): Band | null => {
  return hits.reduce<Band | null>(
    (worst, hit) => (worst === null || bandRank(hit.band) > bandRank(worst) ? hit.band : worst),
    null,
  )
}
