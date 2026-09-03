import { type UnitSystem } from '@toolpath/tool-support'
import { useState } from 'react'

import { bandCss } from 'shared/bands'
import { formatMetric } from 'shared/rule-text'
import type { RulesSummary, WorstReading } from 'shared/rules-summary'
import type { Band } from 'shared/rules'
import { BANDS, bandName } from 'shared/rules'
import { Heading } from './heading'
import { KindIcon } from './feature-icons'
import { rowAttributes } from 'shared/row-nav'

/** How many of the worst readings the panel draws before it offers the rest. */
const SHOWN = 6

/**
 * What this set makes of this part, before any of the detail.
 *
 * The question somebody arrives with is "how does this part look under my
 * limits", which used to be answerable only by reading fourteen rules and
 * adding them up. Every number here is a press that finds what it counts — a
 * summary that cannot be followed back into the list below it is a summary to
 * be taken on trust.
 */
export const RulesSummaryPanel = ({
  summary,
  band,
  unit,
  onPickBand,
  onChoose,
  onHover,
}: {
  summary: RulesSummary
  /** The band being filtered to, where one is. */
  band: Band | null
  unit: UnitSystem
  onPickBand: (band: Band | null) => void
  onChoose: (tag: string) => void
  onHover: (tags: Array<string>) => void
}) => {
  const [all, setAll] = useState(false)

  /*
   * Six, then the rest on request.
   *
   * It was cut to six with nothing saying so, which made "the worst of it" a
   * list that could not be argued past — a part with nine things wrong showed
   * six and said nothing about the other three.
   */
  const shown = all ? summary.worst : summary.worst.slice(0, SHOWN)

  return (
    <section>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-3xl font-bold leading-none text-ink tabular-nums">
          {summary.score}
        </span>
        <span className="text-2xs text-ink-muted">across {summary.readings} readings</span>
      </div>

      <ul className="mt-2">
        {BANDS.map((each) => (
          <li key={each}>
            <button
              aria-pressed={band === each}
              className={`flex w-full items-center gap-2 rounded px-1 py-0.5 text-left transition ${
                band === each ? 'bg-info/15' : 'hover:bg-ground/60'
              } ${summary.counts[each] === 0 ? 'opacity-40' : ''}`}
              // A count nobody can act on is a fact printed at somebody.
              onClick={() => onPickBand(band === each ? null : each)}
              // Named in words: `Easy 3` read as a score, and the press has to
              // say it opens onto the three rather than counting them.
              aria-label={`${bandName(each)} — ${String(summary.counts[each])} ${
                summary.counts[each] === 1 ? 'feature' : 'features'
              }`}
              type="button"
            >
              <span
                aria-hidden="true"
                className="size-1.5 shrink-0 rounded-full"
                style={{ background: bandCss(each) }}
              />
              <span className="flex-1 text-ink-body">{bandName(each)}</span>
              <span className="font-medium tabular-nums text-ink">{summary.counts[each]}</span>
            </button>

            {/*
              The features behind the count, under the count.
              
              Pressing `3 rats` used to narrow the rule list far below and leave
              this row looking the same, so the answer arrived somewhere the eye
              was not. The three are here, each with what cost it on the right —
              the count says how much trouble there is, and the rules beside a
              feature say what to argue with about it.
            */}
            {band === each ? (
              <ul className="mb-1 ml-3 border-l border-edge" onMouseLeave={() => onHover([])}>
                {summary.byBand[each].map((feature) => (
                  <li key={feature.tag}>
                    <button
                      className="flex w-full items-center gap-2 rounded py-0.5 pl-2 pr-1 text-left text-2xs text-ink-muted transition hover:bg-ground/60"
                      {...rowAttributes(feature.tag)}
                      onClick={() => onChoose(feature.tag)}
                      onFocus={() => onChoose(feature.tag)}
                      onMouseEnter={() => onHover([feature.tag])}
                      type="button"
                    >
                      <span className="shrink-0 text-ink-dim">
                        <KindIcon featureType={feature.featureType} kind="Other" />
                      </span>
                      <span className="min-w-0 flex-1 truncate">{feature.label}</span>
                      {/*
                        The rules that cost it, heaviest trouble first — two of
                        them, because a row is a row. The rest are one press
                        away in the list below.
                      */}
                      <span className="flex shrink-0 items-center gap-1">
                        {feature.rules.slice(0, 2).map((rule) => (
                          <span
                            key={rule.name}
                            className="truncate rounded px-1 text-3xs font-semibold"
                            style={{
                              background: `${bandCss(rule.band)}22`,
                              color: bandCss(rule.band),
                            }}
                            title={`${rule.name} — ${bandName(rule.band)}, weight ${String(rule.weight)}`}
                          >
                            {rule.name}
                          </span>
                        ))}
                      </span>
                    </button>
                  </li>
                ))}
                {summary.byBand[each].length === 0 ? (
                  <li className="py-0.5 pl-2 text-2xs text-ink-faint">
                    Nothing mapped landed here.
                  </li>
                ) : null}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="mt-2 flex items-baseline gap-2 px-1">
        <span className="flex-1 text-ink-muted">Rules that spoke</span>
        {/* A rule that never fired is not a rule that passed. */}
        <span className="font-medium tabular-nums text-ink">
          {summary.spoke} of {summary.rules}
        </span>
      </div>

      {summary.worst.length === 0 ? null : (
        <>
          <Heading>Worst of it</Heading>
          <ul onMouseLeave={() => onHover([])}>
            {shown.map((reading) => (
              <li key={`${reading.tag}-${reading.rule}`}>
                <WorstRow onChoose={onChoose} onHover={onHover} reading={reading} unit={unit} />
              </li>
            ))}
          </ul>
          {summary.worst.length > SHOWN ? (
            <button
              type="button"
              onClick={() => setAll((shownAll) => !shownAll)}
              className="mt-0.5 px-1 text-2xs font-medium text-ink-dim transition hover:text-ink-strong"
            >
              {all ? 'Show fewer' : `Show all ${String(summary.worst.length)}`}
            </button>
          ) : null}
        </>
      )}
    </section>
  )
}

const WorstRow = ({
  reading,
  unit,
  onChoose,
  onHover,
}: {
  reading: WorstReading
  unit: UnitSystem
  onChoose: (tag: string) => void
  onHover: (tags: Array<string>) => void
}) => (
  <button
    className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-2xs text-ink-body hover:bg-ground/60"
    {...rowAttributes(reading.tag)}
    onClick={() => onChoose(reading.tag)}
    onFocus={() => onChoose(reading.tag)}
    onMouseEnter={() => onHover([reading.tag])}
    type="button"
  >
    <span
      aria-hidden="true"
      className="size-1.5 shrink-0 rounded-full"
      style={{ background: bandCss(reading.band) }}
    />
    <span className="shrink-0 text-ink-dim">
      <KindIcon featureType={reading.featureType} kind="Other" />
    </span>
    <span className="shrink-0 truncate">{reading.label}</span>
    {/* Which limit cost it, because the next question is always that. */}
    <span className="min-w-0 flex-1 truncate text-ink-dim">{reading.rule}</span>
    <span className="shrink-0 tabular-nums text-ink-muted">
      {reading.value === null ? '' : formatMetric(reading.value, reading.metric, unit)}
    </span>
  </button>
)
