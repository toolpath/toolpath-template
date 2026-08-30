import type { PartFeature, PublicInspectionReport } from '@toolpath/part-contracts'
import { KindIcon } from './feature-icons'
import { duration, partSummary } from '../shared/part-summary'
import { directionLabel } from '@toolpath/part-contracts/report'
import { directionCss } from '../shared/direction-colors'
import { moveThroughList } from '@toolpath/domain/list-keys'
import { Heading } from './heading'
import type { FeatureScore } from '../shared/feature-score'
import { ScoreBadge } from './score-badge'
import type { Unit } from '@toolpath/domain/units'

const Count = ({ label, value }: { label: string; value: string | number }) => (
  <div className="flex items-baseline justify-between gap-4 py-1">
    <span className="text-zinc-400">{label}</span>
    <span className="font-medium tabular-nums text-zinc-100">{value}</span>
  </div>
)

/**
 * What the Engine found, before anybody has clicked anything.
 *
 * The first question of a report is what is in it, and this answers it in the
 * order it gets asked: how much geometry, which ways up, what kinds of feature,
 * and how long it took to say so.
 */
export const PartSummary = ({
  report,
  features,
  activeDirection,
  onPickDirection,
  expandedType,
  onExpandType,
  focusedTag,
  candidateTags,
  onChoose,
  onHover,
  unit,
  onUnit,
  query,
  onQuery,
  scores,
}: {
  report: PublicInspectionReport
  /** The features to list, already filtered by whatever search is running. */
  features: readonly PartFeature[]
  activeDirection: number | null
  onPickDirection: (index: number) => void
  expandedType: string | null
  onExpandType: (type: string | null) => void
  focusedTag: string | null
  candidateTags: readonly string[]
  onChoose: (featureTag: string) => void
  onHover: (featureTags: string[]) => void
  unit: Unit
  onUnit: (unit: Unit) => void
  query: string
  onQuery: (query: string) => void
  /** How hard each feature is, where the rules had anything to say. */
  scores: ReadonlyMap<string, FeatureScore>
}) => {
  const summary = partSummary(report, activeDirection)

  return (
    <div className="p-3 text-xs">
      {/* One button, not two. There are exactly two units and a machinist works
          in one of them all day, so this shows what you are reading in and
          pressing it reads in the other. */}
      <div className="mb-2 flex items-center justify-between gap-4">
        <Heading>Geometry</Heading>
        <button
          type="button"
          aria-label={`Units: ${unit}. Switch to ${unit === 'mm' ? 'in' : 'mm'}`}
          title={`Reading in ${unit} — click for ${unit === 'mm' ? 'in' : 'mm'}`}
          onClick={() => onUnit(unit === 'mm' ? 'in' : 'mm')}
          className="shrink-0 rounded border border-zinc-700 bg-transparent px-2 py-0.5 text-2xs font-medium text-zinc-400 transition hover:bg-zinc-950/60 hover:text-zinc-100"
        >
          {unit}
        </button>
      </div>
      <Count label="Features" value={summary.features} />
      <Count label="Regions" value={summary.regions} />
      <Count label="Triangles" value={summary.triangles.toLocaleString()} />
      <Count label="Points" value={summary.points.toLocaleString()} />

      <Heading>Machining directions</Heading>
      <div className="flex flex-wrap gap-1">
        {summary.directions.map((direction) => (
          <button
            key={direction.index}
            type="button"
            aria-pressed={activeDirection === direction.index}
            title={`Only features cut from ${direction.label}`}
            onClick={() => onPickDirection(direction.index)}
            className={`flex items-center gap-1.5 rounded border px-1.5 py-0.5 transition ${
              activeDirection === direction.index
                ? 'border-info bg-info/20 text-info'
                : 'border-zinc-800 text-zinc-300 hover:border-zinc-600'
            }`}
          >
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full"
              style={{ background: directionCss(direction.index) }}
            />
            {direction.label}
            <span className="tabular-nums text-zinc-500">{direction.features}</span>
          </button>
        ))}
      </div>

      <Heading>Candidate features</Heading>
      <label className="sr-only" htmlFor="feature-search">
        Search features
      </label>
      <input
        id="feature-search"
        type="search"
        value={query}
        onChange={(event) => onQuery(event.target.value)}
        placeholder="Search type, direction, or tag"
        className="mb-1 w-full rounded border border-zinc-700 bg-transparent px-2 py-1 text-2xs text-zinc-200 outline-none placeholder:text-zinc-500 focus-visible:ring-1 focus-visible:ring-info"
      />
      <ul
        data-keynav="types"
        onKeyDown={(event) =>
          moveThroughList(event, {
            onOpen: (type) => onExpandType(type),
            onClose: () => onExpandType(null),
          })
        }
      >
        {summary.types.map((entry) => {
          const open = expandedType === entry.type
          // The list of a type lives under its own count, so the count is the
          // way in rather than a number beside a list somewhere else.
          const ofType = open
            ? features.filter((feature) => feature.featureType === entry.type)
            : []

          return (
            <li key={entry.type}>
              <button
                type="button"
                data-row={entry.type}
                aria-expanded={open}
                onClick={() => onExpandType(open ? null : entry.type)}
                className={`flex w-full items-baseline gap-2 rounded px-1 py-1 text-left transition ${
                  open ? 'bg-zinc-950/60 text-zinc-100' : 'text-zinc-300 hover:bg-zinc-950/60'
                }`}
              >
                <span aria-hidden="true" className="w-2 text-zinc-500">
                  {open ? '▾' : '▸'}
                </span>
                <span className="text-zinc-500">
                  <KindIcon featureType={entry.type} kind="Other" />
                </span>
                <span className="flex-1">{entry.label}</span>
                {entry.inDirection === null ? null : (
                  <span className="text-2xs text-info">
                    {entry.inDirection} from {summary.directions[activeDirection ?? 0]?.label}
                  </span>
                )}
                <span className="font-medium tabular-nums">{entry.features}</span>
              </button>

              {open ? (
                <ul className="mb-1 ml-3 border-l border-zinc-800">
                  {ofType.length === 0 ? (
                    <li className="px-2 py-1 text-2xs text-zinc-500">
                      None match the current search.
                    </li>
                  ) : (
                    ofType.map((feature) => {
                      const chosen = feature.featureTag === focusedTag
                      return (
                        <li key={feature.featureTag}>
                          <button
                            type="button"
                            data-row={feature.featureTag}
                            aria-pressed={chosen}
                            onMouseEnter={() => onHover([feature.featureTag])}
                            onMouseLeave={() => onHover([])}
                            // Arrowing onto a row reads it on the right and
                            // lights it on the part. Moving a highlight that
                            // then has to be pressed is two gestures for one
                            // question, and the question is "what is this".
                            onFocus={() => onChoose(feature.featureTag)}
                            onBlur={() => onHover([])}
                            onClick={() => onChoose(feature.featureTag)}
                            className={`flex w-full items-center gap-2 rounded-r px-2 py-1 text-left text-2xs transition ${
                              chosen
                                ? 'bg-info/15 text-info'
                                : candidateTags.includes(feature.featureTag)
                                  ? 'bg-warning/10 text-zinc-200'
                                  : 'text-zinc-400 hover:bg-zinc-950/60'
                            }`}
                          >
                            <span className="flex-1 truncate font-mono">
                              {feature.featureTag.slice(-6)}
                            </span>
                            <span className="text-zinc-500">
                              {directionLabel(feature.machiningDirection)}
                            </span>
                            <ScoreBadge score={scores.get(feature.featureTag)} />
                          </button>
                        </li>
                      )
                    })
                  )}
                </ul>
              ) : null}
            </li>
          )
        })}
      </ul>

      <Heading>Timing</Heading>
      <Count label="Download" value={duration(summary.timing.download)} />
      <Count label="Analysis" value={duration(summary.timing.analysis)} />
      <Count label="Total" value={duration(summary.timing.total)} />
    </div>
  )
}
