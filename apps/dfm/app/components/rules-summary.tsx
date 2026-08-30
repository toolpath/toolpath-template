import { bandCss } from '../shared/bands'
import { formatMetric } from '../shared/rule-text'
import type { RulesSummary, WorstReading } from '../shared/rules-summary'
import type { Band } from '../shared/rules'
import { BANDS, bandName } from '../shared/rules'
import type { Unit } from '@toolpath/domain/units'
import { Heading } from './heading'
import { KindIcon } from './feature-icons'

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
  unit: Unit
  onPickBand: (band: Band | null) => void
  onChoose: (tag: string) => void
  onHover: (tags: string[]) => void
}) => (
  <section>
    <div className="flex items-baseline gap-2">
      <span className="font-display text-3xl font-bold leading-none text-zinc-100 tabular-nums">
        {summary.score}
      </span>
      <span className="text-2xs text-zinc-400">across {summary.readings} readings</span>
    </div>

    <ul className="mt-2">
      {BANDS.map((each) => (
        <li key={each}>
          <button
            aria-pressed={band === each}
            className={`flex w-full items-center gap-2 rounded px-1 py-0.5 text-left transition ${
              band === each ? 'bg-info/15' : 'hover:bg-zinc-950/60'
            } ${summary.counts[each] === 0 ? 'opacity-40' : ''}`}
            // A count nobody can act on is a fact printed at somebody.
            onClick={() => onPickBand(band === each ? null : each)}
            type="button"
          >
            <span
              aria-hidden="true"
              className="size-1.5 shrink-0 rounded-full"
              style={{ background: bandCss(each) }}
            />
            <span className="flex-1 text-zinc-300">{bandName(each)}</span>
            <span className="font-medium tabular-nums text-zinc-100">{summary.counts[each]}</span>
          </button>
        </li>
      ))}
    </ul>

    <div className="mt-2 flex items-baseline gap-2 px-1">
      <span className="flex-1 text-zinc-400">Rules that spoke</span>
      {/* A rule that never fired is not a rule that passed. */}
      <span className="font-medium tabular-nums text-zinc-100">
        {summary.spoke} of {summary.rules}
      </span>
    </div>

    {summary.worst.length === 0 ? null : (
      <>
        <Heading>Worst of it</Heading>
        <ul onMouseLeave={() => onHover([])}>
          {summary.worst.map((reading) => (
            <li key={`${reading.tag}-${reading.rule}`}>
              <WorstRow onChoose={onChoose} onHover={onHover} reading={reading} unit={unit} />
            </li>
          ))}
        </ul>
      </>
    )}
  </section>
)

const WorstRow = ({
  reading,
  unit,
  onChoose,
  onHover,
}: {
  reading: WorstReading
  unit: Unit
  onChoose: (tag: string) => void
  onHover: (tags: string[]) => void
}) => (
  <button
    className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-2xs text-zinc-300 hover:bg-zinc-950/60"
    data-row={reading.tag}
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
    <span className="shrink-0 text-zinc-500">
      <KindIcon featureType={reading.featureType} kind="Other" />
    </span>
    <span className="shrink-0 truncate">{reading.label}</span>
    {/* Which limit cost it, because the next question is always that. */}
    <span className="min-w-0 flex-1 truncate text-zinc-500">{reading.rule}</span>
    <span className="shrink-0 tabular-nums text-zinc-400">
      {reading.value === null ? '' : formatMetric(reading.value, reading.metric, unit)}
    </span>
  </button>
)
