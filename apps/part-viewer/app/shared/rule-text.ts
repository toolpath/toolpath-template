import { METRICS, type MetricId, metricQuantity } from './metrics'
import type { Band, FeatureVerdict, Rule } from './rules'
import { bandName, bandRank, bandRanges, rangeSpectrum } from './rules'
import type { PartFeature } from './contracts'
import { directionLabel, featureSummary } from './report'
import { MODEL_UNIT, type Unit, convertArea, convertLength, decimalsFor } from './units'

/**
 * Rule verdicts, in words.
 *
 * Kept apart from the components so the same wording and the same rounding are
 * used wherever a verdict appears, and so what a rule says can be tested
 * without rendering anything.
 */

/**
 * A measurement in the unit being read, with what it is.
 *
 * Rules are stored in millimetres whatever the shop that wrote them was
 * thinking, so this is where a number becomes inches. Ratios, counts and angles
 * convert to nothing: a 5:1 pocket is 5:1 in any shop, and a chamfer is 45° in
 * both.
 */
export function formatMetric(
  value: number | null,
  metric: MetricId | undefined,
  unit: Unit,
): string {
  if (value === null) return '—'

  // A number whose metric is unknown is a raw datasheet field — the inputs to a
  // ratio, say. Rounding one of those to a ratio's single decimal turns 6.35
  // into 6.3 and quietly loses what the Engine actually reported, so it is
  // shown as it stands with any float noise trimmed off the end.
  if (metric === undefined) return String(Number(value.toFixed(3)))

  const shown = toDisplay(value, metric, unit).toFixed(displayDecimals(metric, unit))
  const suffix = unitSuffix(metric, unit)

  return suffix === '°' ? `${shown}°` : suffix ? `${shown} ${suffix}` : shown
}

/** One band of a rule, and the span of measurements that lands in it. */
export interface RuleLimit {
  readonly band: Band
  /** What this shop calls the band. */
  readonly name: string
  /** The span, in the unit being read. */
  readonly range: string
}

/**
 * Where each band of a rule begins and ends, for showing what a measurement was
 * judged against.
 *
 * Both open ends read as infinity, as the feature picker's do. The bottom of a
 * scale is arguably zero — no measurement a rule reads goes below it — but the
 * two apps are read side by side by the same people, and a band that says
 * something different in each is worse than a band that says ∞ at a floor
 * nothing reaches.
 */
export function ruleLimits(
  rule: Rule,
  unit: Unit,
  names?: Partial<Record<Band, string>>,
): RuleLimit[] {
  if (rule.type !== 'threshold' && rule.type !== 'range') return []

  const edge = (value: number | null) =>
    value === null ? '∞' : formatMetric(value, rule.metric, unit)

  return (rule.type === 'threshold' ? bandRanges(rule) : rangeSpectrum(rule))
    .filter((span) => span.reachable)
    .map((span) => ({
      band: span.band,
      name: bandName(span.band, names, rule.bandNames),
      range: `${edge(span.from)} – ${edge(span.to)}`,
    }))
}

/** What a rule applies to, in words rather than a list of twenty type names. */
export function ruleAudience(rule: Rule): string {
  if (rule.featureTypes.length === 0) return 'every feature'
  if (rule.featureTypes.length > 4) return `${rule.featureTypes.length} feature types`

  return rule.featureTypes.map((type) => type.replaceAll('_', ' ')).join(', ')
}

/** What a rule reads, named as the panel names it. */
export function ruleReads(rule: Rule): string {
  if (rule.expression) return rule.expression
  if (rule.type === 'baseline') return 'the kind of feature it is'

  return METRICS.find((metric) => metric.id === rule.metric)?.label ?? rule.metric ?? ''
}

/**
 * A stored number as it is typed and read.
 *
 * Rules are stored in millimetres whatever the shop that wrote them was
 * thinking, so this pair is the only place a threshold becomes inches and the
 * only place a typed number becomes millimetres again. Getting them out of step
 * is how an inch shop's 0.125 quietly becomes 0.125 mm.
 *
 * Ratios, counts and angles convert to nothing: a 5:1 pocket is 5:1 in any
 * shop, and a chamfer is 45° in both.
 */
export function toDisplay(value: number, metric: MetricId | undefined, unit: Unit): number {
  const quantity = metricQuantity(metric)

  if (quantity === 'length') return convertLength(value, MODEL_UNIT, unit)
  if (quantity === 'area') return convertArea(value, MODEL_UNIT, unit)

  return value
}

export function fromDisplay(value: number, metric: MetricId | undefined, unit: Unit): number {
  const quantity = metricQuantity(metric)

  if (quantity === 'length') return convertLength(value, unit, MODEL_UNIT)
  if (quantity === 'area') return convertArea(value, unit, MODEL_UNIT)

  return value
}

/** What to write after a threshold box, or nothing where the number is bare. */
export function unitSuffix(metric: MetricId | undefined, unit: Unit): string {
  switch (metricQuantity(metric)) {
    case 'length':
      return unit
    case 'area':
      return `${unit}²`
    case 'angle':
      return '°'
    // A ratio and a count are bare. ":1" reads well in a sentence and badly in
    // a box, where it eats the room the number needs.
    default:
      return ''
  }
}

/**
 * How many decimals a measurement is worth showing at.
 *
 * A length gets the precision its unit deserves — three decimals in inches, two
 * in millimetres, both about a thousandth of an inch. A ratio gets one, because
 * nobody argues about the second decimal of a 5:1 pocket, and a count gets
 * none.
 */
export function displayDecimals(metric: MetricId | undefined, unit: Unit): number {
  switch (metricQuantity(metric)) {
    case 'length':
    case 'area':
      return decimalsFor(unit)
    case 'count':
      return 0
    default:
      return 1
  }
}

/** One feature a rule bit on, as its row reads. */
export interface RuleHit {
  readonly tag: string
  readonly band: Band
  readonly label: string
  /** The kernel's own name for the type, which is what picks its drawing. */
  readonly featureType: string
  readonly direction: string
  readonly regions: number
}

/**
 * Which features each rule bit on, worst first.
 *
 * The question a shop asks of a limit is not "what does it say" but "what did
 * it cost me", and that is answerable only against the part in front of them.
 * Sorted by band and then by weight of the reading, so the top of each list is
 * the feature that limit is worst about.
 */
export function ruleHits(
  verdicts: readonly FeatureVerdict[],
  features: readonly PartFeature[],
): Map<string, RuleHit[]> {
  const byTag = new Map(features.map((feature) => [feature.featureTag, feature]))
  const hits = new Map<string, RuleHit[]>()

  for (const verdict of verdicts) {
    const feature = byTag.get(verdict.tag)

    if (!feature) continue

    for (const result of verdict.results) {
      const found = hits.get(result.rule.id) ?? []

      found.push({
        tag: verdict.tag,
        band: result.band,
        label: featureSummary(feature).type,
        featureType: feature.featureType,
        direction: directionLabel(feature.machiningDirection),
        regions: feature.regionIdxs.length,
      })
      hits.set(result.rule.id, found)
    }
  }

  for (const found of hits.values()) {
    found.sort((a, b) => bandRank(b.band) - bandRank(a.band))
  }

  return hits
}
