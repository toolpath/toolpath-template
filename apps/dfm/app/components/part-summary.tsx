import { memo } from 'react'
import type { PartFeature, PublicInspectionReport } from 'shared/contracts'
import { KindIcon } from './feature-icons'
import { duration, partSummary } from 'shared/part-summary'
import { directionLabel } from 'shared/report'
import { directionCss } from 'shared/direction-colors'
import { groupHoles } from 'shared/hole-groups'
import type { SetupPlan } from 'shared/setups'
import { coverageOf } from 'shared/setups'
import { directionRows } from 'shared/direction-rows'
import { moveThroughList } from 'shared/list-keys'
import { Heading } from './heading'
import type { FeatureScore } from 'shared/feature-score'
import { ScoreBadge } from './score-badge'
import { keynavAttributes, rowAttributes } from 'shared/row-nav'

const Count = ({ label, value }: { label: string; value: string | number }) => (
  <div className="flex items-baseline justify-between gap-4 py-1">
    <span className="text-ink-muted">{label}</span>
    <span className="font-medium tabular-nums text-ink">{value}</span>
  </div>
)

/**
 * What the Engine found, before anybody has clicked anything.
 *
 * The first question of a report is what is in it, and this answers it in the
 * order it gets asked: how much geometry, which ways up, what kinds of feature,
 * and how long it took to say so.
 */
const PartSummaryView = ({
  report,
  features,
  plan,
  activeDirection,
  onPickDirection,
  expandedType,
  onExpandType,
  focusedTag,
  candidateTags,
  onChoose,
  onHover,
  query,
  onQuery,
  scores,
}: {
  report: PublicInspectionReport
  /** The features to list, already filtered by whatever search is running. */
  features: ReadonlyArray<PartFeature>
  activeDirection: number | null
  /** The mapping so far, so each way up can say what it has been given. */
  plan: SetupPlan
  onPickDirection: (index: number) => void
  expandedType: string | null
  onExpandType: (type: string | null) => void
  focusedTag: string | null
  candidateTags: ReadonlyArray<string>
  onChoose: (featureTag: string) => void
  onHover: (featureTags: Array<string>) => void
  query: string
  onQuery: (query: string) => void
  /** How hard each feature is, where the rules had anything to say. */
  scores: ReadonlyMap<string, FeatureScore>
}) => {
  const summary = partSummary(report, activeDirection)
  const reach = directionRows(report)

  return (
    <div className="p-3 text-xs">
      {/* The unit switch used to sit here, beside this heading. It applies to
          every number on every tab, so it belongs in the header where it is
          reachable from all of them rather than on the one page that happened
          to show it first. */}
      <Heading>Geometry</Heading>
      <Count label="Features" value={summary.features} />
      <Count label="Regions" value={summary.regions} />
      <Count label="Triangles" value={summary.triangles.toLocaleString()} />
      <Count label="Points" value={summary.points.toLocaleString()} />

      <Heading>Machining directions</Heading>
      {/*
        The direction list. Each way up says what it could reach and, once
        something has been mapped to it, what it has actually been given —
        de-duplicated by area, because forty fillets mapped and the face they sit
        on missed is nearly nothing mapped.
      */}
      <ul className="flex flex-col gap-0.5">
        {reach.map((row) => {
          const setup = plan.setups.find((entry) => entry.directionIndex === row.index)
          const mapped = setup ? coverageOf(report, features, plan, 'rough', setup.id) : null
          return (
            <li key={row.index}>
              <button
                type="button"
                data-direction={row.label}
                aria-pressed={activeDirection === row.index}
                title={`Only features cut from ${row.label}`}
                onClick={() => onPickDirection(row.index)}
                className={`grid w-full grid-cols-[auto_1fr_auto_auto] items-center gap-x-2 rounded border px-1.5 py-1 text-left transition ${
                  activeDirection === row.index
                    ? 'border-info bg-info/20 text-info'
                    : 'border-transparent text-ink-body hover:border-edge-strong hover:bg-ground/40'
                }`}
              >
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full"
                  style={{ background: directionCss(row.index) }}
                />
                <span className="font-medium">{row.label}</span>
                <span className="tabular-nums text-ink-dim">{row.features}</span>
                {mapped ? (
                  <span className="tabular-nums text-2xs font-semibold text-info">
                    {Math.round(mapped.mapped * 100)}% mapped
                  </span>
                ) : (
                  <span className="tabular-nums text-2xs text-ink-faint">
                    reaches {Math.round(row.share * 100)}%
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>

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
        className="mb-1 w-full rounded border border-edge-strong bg-transparent px-2 py-1 text-2xs text-ink-strong outline-none placeholder:text-ink-dim focus-visible:ring-1 focus-visible:ring-info"
      />
      <ul
        {...keynavAttributes('types')}
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
                {...rowAttributes(entry.type)}
                aria-expanded={open}
                onClick={() => onExpandType(open ? null : entry.type)}
                className={`flex w-full items-baseline gap-2 rounded px-1 py-1 text-left transition ${
                  open ? 'bg-ground/60 text-ink' : 'text-ink-body hover:bg-ground/60'
                }`}
              >
                <span aria-hidden="true" className="w-2 text-ink-dim">
                  {open ? '▾' : '▸'}
                </span>
                <span className="text-ink-dim">
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
                <ul className="mb-1 ml-3 border-l border-edge">
                  {ofType.length === 0 ? (
                    <li className="px-2 py-1 text-2xs text-ink-dim">
                      None match the current search.
                    </li>
                  ) : (
                    groupHoles(ofType).map((holes) => {
                      // Identical holes are one job: same diameter, depth and
                      // way up. Listing them apart is fifty rows somebody has
                      // to read to find out they are all the same row.
                      const feature = holes.holes[0]!
                      const chosen = feature.featureTag === focusedTag
                      return (
                        <li key={holes.key}>
                          <button
                            type="button"
                            {...rowAttributes(feature.featureTag)}
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
                                  ? 'bg-warning/10 text-ink-strong'
                                  : 'text-ink-muted hover:bg-ground/60'
                            }`}
                          >
                            <span className="flex-1 truncate font-mono">
                              {feature.featureTag.slice(-6)}
                            </span>
                            {holes.holes.length > 1 ? (
                              <span
                                className="rounded bg-raised px-1 font-semibold text-ink-body"
                                title={`${String(holes.holes.length)} identical holes`}
                              >
                                ×{holes.holes.length}
                              </span>
                            ) : null}
                            <span className="text-ink-dim">
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

/*
 * Memoised. The inspector tab's list of what the part has — it is not what a
 * hover on the part or a threshold on the rules tab is about.
 */
export const PartSummary = memo(PartSummaryView)
