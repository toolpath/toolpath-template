import { InfoIcon } from '@phosphor-icons/react'
import { Tooltip } from '@toolpath/ui'
import { bandCss } from '../shared/bands'
import { formatMetric, ruleLimits } from '../shared/rule-text'
import type { Band, FeatureVerdict, Rule, RuleResult } from '../shared/rules'
import { bandName, readEveryRule, scoreFeature } from '../shared/rules'
import type { MetricId, PartContext } from '../shared/metrics'
import { PART_METRICS, metricFormula, metricQuantity, metricSources } from '../shared/metrics'
import type { PartFeature } from '../shared/contracts'
import type { Unit } from '../shared/units'

/**
 * Where a number came from: the arithmetic, then the datasheet fields behind it
 * and what each held.
 *
 * This is the whole argument for showing the Engine's own measurements. A
 * verdict saying "milling L/D is 7.1" cannot be checked; one saying `zMax − zMin`
 * 50.80 over `facts.cd.terminalCornerRadius` × 2 can be argued with — and
 * argued with against the raw datasheet sitting in the same panel.
 */
const Working = ({
  feature,
  metric,
  part,
  unit,
}: {
  feature: PartFeature
  metric: MetricId
  part: PartContext
  unit: Unit
}) => {
  const formula = metricFormula(metric, feature, part)
  const readings = metricSources(metric, feature, part)

  if (readings.length === 0) return null

  // A source is a raw datasheet field, and for a ratio or a count it is *not*
  // in the metric's own units — the inputs to an L/D are two lengths, and
  // printing them as "6.35:1" states a unit the Engine never reported. Where
  // the metric is itself a length, an area or an angle its sources share that,
  // so they can be shown in it.
  const quantity = metricQuantity(metric)
  const sourceUnit = quantity === 'ratio' || quantity === 'count' ? undefined : metric

  return (
    <span className="flex flex-col gap-1">
      {formula ? <span className="font-mono text-2xs">{formula}</span> : null}
      {readings.map((reading) => (
        <span key={`${reading.path}-${reading.note ?? ''}`} className="flex flex-col">
          <span className="flex items-baseline justify-between gap-3">
            <code className="text-2xs">{reading.path}</code>
            <span className="shrink-0 text-2xs tabular-nums">
              {reading.value === null ? '—' : formatMetric(reading.value, sourceUnit, unit)}
            </span>
          </span>
          {reading.note ? <span className="text-2xs opacity-80">{reading.note}</span> : null}
        </span>
      ))}
    </span>
  )
}

/** The bands the rule judges by, with the one this measurement landed in marked. */
const Limits = ({ rule, band, unit }: { rule: Rule; band: Band | null; unit: Unit }) => {
  const limits = ruleLimits(rule, unit)

  if (limits.length === 0) return null

  return (
    <span className="flex flex-col gap-0.5">
      {limits.map((limit) => (
        <span
          key={limit.band}
          className={`flex items-baseline justify-between gap-3 text-2xs ${
            limit.band === band ? 'font-semibold' : 'opacity-70'
          }`}
        >
          <span>{limit.name}</span>
          <span className="tabular-nums">{limit.range}</span>
        </span>
      ))}
    </span>
  )
}

/**
 * Everything behind one rule's verdict, in one hover.
 *
 * Three things, in the order somebody asks them: what the rule is for, how its
 * number was arrived at, and where that number fell among the limits.
 *
 * A second's delay, deliberately: these sit at the end of every row, and a
 * tooltip that fires on the way past is one that fires by accident.
 */
const RuleWorking = ({
  feature,
  part,
  result,
  unit,
}: {
  feature: PartFeature
  part: PartContext
  result: RuleResult
  unit: Unit
}) => (
  <span className="flex max-w-72 flex-col gap-1.5">
    <span>{result.rule.note}</span>

    {/* A rule written as a sum reads several measurements at once, so its own
        arithmetic is the answer rather than any one metric's. */}
    {result.rule.expression ? (
      <span className="font-mono text-2xs">{result.rule.expression}</span>
    ) : result.rule.type === 'baseline' ? null : (
      <Working feature={feature} metric={result.rule.metric} part={part} unit={unit} />
    )}

    <Limits band={result.band} rule={result.rule} unit={unit} />
  </span>
)

/**
 * "This part does not fit the machine" is true of every feature on it and
 * actionable from none of them, so a part-wide rule is left off the feature.
 */
const isPartWide = (rule: Rule): boolean =>
  rule.type !== 'baseline' && PART_METRICS.has(rule.metric)

/**
 * What the rules made of this feature, and what they read to decide.
 *
 * Two lists, and the second is the reason this is worth building: the rules
 * that spoke, and the rules that **stayed silent**. A rule that agreed and a
 * rule that never ran read identically on a feature that scored well, and with
 * a datasheet as sparse as the Engine's that difference is most of the answer.
 * Somebody looking at a feature that came out easy wants to know whether the
 * rules they care about agreed or simply never looked.
 */
export const RuleVerdict = ({
  feature,
  rules,
  verdict,
  unit,
  part,
}: {
  feature: PartFeature
  rules: readonly Rule[]
  verdict: FeatureVerdict
  unit: Unit
  /**
   * The same part context the verdict was judged with — or reach would be shown
   * here as one number and judged as another.
   */
  part: PartContext
}) => {
  const score = scoreFeature(verdict)
  const results = verdict.results.filter((result) => !isPartWide(result.rule))
  const readings = readEveryRule(
    rules.filter((rule) => !isPartWide(rule)),
    feature.featureType,
    verdict.metrics,
  )
  const silent = readings.filter((reading) => reading.band === null)

  return (
    <section className="mt-4 border-t border-zinc-800 pt-3">
      <h3 className="text-2xs font-bold uppercase tracking-wider text-zinc-500">Difficulty</h3>

      <div className="mt-1.5 flex items-center gap-2">
        <span
          className="rounded px-1.5 py-0.5 text-2xs font-semibold text-zinc-950"
          style={{ background: bandCss(verdict.band) }}
        >
          {verdict.band === null ? 'unjudged' : bandName(verdict.band)}
        </span>
        {score === null ? null : (
          <span className="text-2xs text-zinc-400">
            scores{' '}
            <span className="font-semibold tabular-nums text-zinc-100">
              {(score * 100).toFixed(0)}
            </span>{' '}
            across {results.length} {results.length === 1 ? 'rule' : 'rules'}
          </span>
        )}
      </div>

      {results.length === 0 ? (
        <p className="mt-1.5 text-2xs text-zinc-400">
          No rule reached this feature. That is not the same as easy — every rule and what it read
          is below.
        </p>
      ) : (
        <ul className="mt-1.5 flex flex-col gap-1">
          {results.map((result) => (
            <li
              key={result.rule.id}
              className="border-l-2 pl-2"
              style={{ borderColor: bandCss(result.band) }}
            >
              <div className="flex items-baseline gap-1.5 text-xs">
                <span className="min-w-0 shrink truncate text-zinc-300">{result.rule.name}</span>

                {/* The working is a hover away rather than under every row:
                    printed under all sixteen it tripled the height of the panel
                    and made the verdicts the minority of what was on screen. */}
                <Tooltip
                  delay={700}
                  side="left"
                  tip={<RuleWorking feature={feature} part={part} result={result} unit={unit} />}
                >
                  <button
                    aria-label={`How ${result.rule.name} is worked out`}
                    className="shrink-0 text-zinc-500 hover:text-zinc-200"
                    type="button"
                  >
                    <InfoIcon className="size-3" />
                  </button>
                </Tooltip>

                <span aria-hidden="true" className="min-w-2 flex-1" />

                <span className="shrink-0 tabular-nums text-zinc-400">
                  {result.rule.type === 'baseline'
                    ? bandName(result.band)
                    : formatMetric(result.value, result.rule.metric, unit)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {silent.length === 0 ? null : (
        <details className="mt-2">
          <summary className="cursor-pointer text-2xs text-zinc-500 underline decoration-dotted">
            {silent.length} {silent.length === 1 ? 'rule' : 'rules'} said nothing
          </summary>
          <ul className="mt-1 flex flex-col gap-0.5">
            {silent.map((reading) => (
              <li
                key={reading.rule.id}
                className="flex items-baseline justify-between gap-2 text-2xs text-zinc-500"
              >
                <span className="min-w-0 truncate">{reading.rule.name}</span>
                <span className="shrink-0">{reading.silence}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
