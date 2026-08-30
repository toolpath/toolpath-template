import { Badge, Card, Checkbox } from '@toolpath/ui'
import type { PartFeature, PublicInspectionReport } from '@toolpath/part-contracts'
import { directionLabel, featureSummary } from '@toolpath/part-contracts/report'
import { classNames } from '@toolpath/domain/class-names'

export interface FeaturePickerProps {
  readonly report: PublicInspectionReport
  /** What each feature already has mapped, so the list shows the work so far. */
  readonly mapped?: (featureTag: string) => { rough: boolean; finish: boolean }
  /** The machining direction in scope, or null for the whole part. */
  readonly direction: string | null
  readonly onDirection: (direction: string | null) => void
  readonly selected: ReadonlySet<string>
  readonly onToggle: (featureTag: string) => void
}

const directionKey = (feature: PartFeature): string => directionLabel(feature.machiningDirection)

/**
 * Picking features the way the DFM app does: scope to one machining direction,
 * then select within it.
 *
 * Direction first, because it is the decision a setup is built around — a tool
 * that cuts three features from one side is one operation, and the same three
 * features from three sides are three fixtures. Selecting across directions is
 * allowed, and the tool list simply narrows further.
 */
export const FeaturePicker = ({
  report,
  direction,
  onDirection,
  selected,
  onToggle,
  mapped,
}: FeaturePickerProps) => {
  const directions = [...new Set(report.features.map(directionKey))].sort()
  const shown = report.features.filter(
    (feature) => direction === null || directionKey(feature) === direction,
  )

  return (
    <Card className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xs font-semibold tracking-wide text-zinc-400 uppercase">
          Machining direction
        </h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={direction === null}
            onClick={() => onDirection(null)}
            className={classNames(
              'rounded border px-2 py-1 text-xs',
              direction === null
                ? 'border-primary text-zinc-100'
                : 'border-zinc-800 text-zinc-400 hover:text-zinc-200',
            )}
          >
            Whole part
          </button>
          {directions.map((each) => (
            <button
              key={each}
              type="button"
              aria-pressed={direction === each}
              onClick={() => onDirection(each)}
              className={classNames(
                'rounded border px-2 py-1 text-xs',
                direction === each
                  ? 'border-primary text-zinc-100'
                  : 'border-zinc-800 text-zinc-400 hover:text-zinc-200',
              )}
            >
              {each}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <h2 className="text-2xs font-semibold tracking-wide text-zinc-400 uppercase">
          Features ({shown.length})
        </h2>
        <ul className="flex flex-col">
          {shown.map((feature) => {
            const summary = featureSummary(feature)
            return (
              <li key={feature.featureTag}>
                <label className="flex items-center gap-2 py-1 text-sm">
                  <Checkbox
                    name={`feature-${feature.featureTag}`}
                    size="sm"
                    checked={selected.has(feature.featureTag)}
                    onChange={() => onToggle(feature.featureTag)}
                  />
                  <span className="text-zinc-200">{summary.type}</span>
                  {summary.headline ? (
                    <span className="font-mono text-xs text-zinc-500">{summary.headline}</span>
                  ) : null}
                  <span className="ml-auto flex items-center gap-1">
                    {mapped?.(feature.featureTag).rough ? (
                      <Badge variant="success" size="sm">
                        R
                      </Badge>
                    ) : null}
                    {mapped?.(feature.featureTag).finish ? (
                      <Badge variant="info" size="sm">
                        F
                      </Badge>
                    ) : null}
                    <Badge variant="secondary" size="sm">
                      {directionKey(feature)}
                    </Badge>
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      </div>
    </Card>
  )
}
