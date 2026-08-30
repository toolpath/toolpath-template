import { CursorClickIcon, InfoIcon } from '@phosphor-icons/react'
import type { PartFeature } from '@toolpath/part-contracts'
import {
  STRIP_LABELS,
  measurements,
  stripMeasurements,
} from '@toolpath/part-contracts/measurements'
import { convertLength, decimalsFor, MODEL_UNIT, type Unit } from '@toolpath/domain/units'
import { defaultsFor, readingsFor, type Reading } from 'shared/feature-defaults'
import { featureRow } from 'shared/feature-rows'
import { KindIcon, MeasurementIcon } from './feature-icons'

export interface SelectionPanelProps {
  /** The reading on screen, or nothing while the part is untouched. */
  readonly feature: PartFeature | null
  /** Every feature on the part, so depth can be measured from its top. */
  readonly features: ReadonlyArray<PartFeature>
  readonly regions: ReadonlyArray<{ idx: number; shapeKind: string }>
  readonly unit: Unit
  /** Identical holes this one stands for, so the field can say how many. */
  readonly siblings: number
  readonly onInfo: () => void
}

/**
 * The feature being asked about, and the numbers a tool is chosen against.
 *
 * **One line each.** The measurements were tiles in a grid, which read well and
 * cost half the panel — and the panel's job is to get somebody to a tool, not
 * to display a feature. Glyph, number, label, along a row: the same four
 * numbers in a fifth of the height.
 *
 * They are `stripMeasurements` — the handful the DFM application puts above its
 * own table, chosen because they are what a tool is picked with. Everything
 * else Toolpath measured is behind the ⓘ.
 */
export const SelectionPanel = ({
  feature,
  features,
  regions,
  unit,
  siblings,
  onInfo,
}: SelectionPanelProps) => {
  const rows = feature ? measurements({ feature, features, regions, unit }) : []
  const row = feature ? featureRow({ feature, features, regions, unit }) : null

  /**
   * What the strip shows is the datasheet's to say.
   *
   * `feature-defaults.csv` names, per kind of feature, the fields worth seeing
   * in priority order — and which of them the tool list is filtered by. Where
   * the sheet has no row, the DFM application's own strip stands in, plus the
   * L/D, so an unknown feature still says something.
   */
  const sheet = feature ? defaultsFor(feature, features) : null
  const readings = feature && sheet ? readingsFor(feature, features, sheet.show) : []
  const strip = (() => {
    if (readings.length > 0 || !feature) {
      return []
    }
    const kept = stripMeasurements(rows)
    if (kept.some((each) => each.key === 'ld')) {
      return kept
    }
    const ld = rows.find((each) => each.key === 'ld')
    return ld ? [...kept, ld] : kept
  })()

  const shown = (reading: Reading): string => {
    if (typeof reading.value === 'string') {
      return reading.value
    }
    switch (reading.unit) {
      case 'mm':
        return `${convertLength(reading.value, MODEL_UNIT, unit).toFixed(decimalsFor(unit))} ${unit}`
      case 'deg':
        return `${reading.value.toFixed(1)}°`
      case 'ratio':
        return reading.value.toFixed(2)
      default:
        return String(reading.value)
    }
  }

  return (
    <div className="flex flex-col gap-1.5 p-2">
      <h4 className="text-2xs flex items-center gap-1.5 font-semibold tracking-wide text-zinc-500 uppercase">
        <span className="text-zinc-600">
          <CursorClickIcon />
        </span>
        Feature
      </h4>

      {/* **The field is drawn before it has an answer.** An empty panel that
          fills in later makes the page jump the first time somebody clicks the
          part, and — worse — gives no sign that a click on the part is what it
          is waiting for. So the field is here from the start, saying what to
          do, and picking a feature fills it rather than creating it. */}
      <div
        role="status"
        aria-label="Selected feature"
        className={
          row && feature
            ? 'flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2 py-1.5'
            : 'flex items-center gap-2 rounded-lg border border-dashed border-zinc-800 px-2 py-1.5'
        }
      >
        {row && feature ? (
          <>
            <span className="shrink-0 text-zinc-400">
              <KindIcon featureType={feature.featureType} kind={row.type} />
            </span>
            <span className="truncate text-sm font-semibold text-zinc-100">{row.type}</span>
            {siblings > 1 ? (
              <span
                className="text-2xs shrink-0 rounded bg-zinc-800 px-1 py-0.5 font-semibold text-zinc-300"
                title={`${String(siblings)} identical holes — same diameter, depth and way up`}
              >
                ×{siblings}
              </span>
            ) : null}
            <span className="text-2xs ml-auto shrink-0 font-mono text-zinc-500">
              {row.direction}
            </span>
            <button
              type="button"
              aria-label={`What Toolpath measured about ${row.type}`}
              title="Everything Toolpath measured"
              onClick={onInfo}
              className="shrink-0 rounded p-0.5 text-zinc-500 hover:text-zinc-200"
            >
              <InfoIcon />
            </button>
          </>
        ) : (
          <span className="text-xs text-zinc-500">
            Click a face on the part — again to cycle its readings
          </span>
        )}
      </div>

      {/* The measurement row keeps its height while it is empty, for the same
          reason: the panel below it should not move when a feature is picked. */}
      {readings.length > 0 ? (
        <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1">
          {readings.map((each) => (
            <div
              key={each.name}
              className="flex items-center gap-1.5"
              title="Read off the datasheet; what filters the tool list is the rules sheet's"
            >
              <span className="shrink-0 text-zinc-600">
                <MeasurementIcon measurement={each.icon} />
              </span>
              <dd className="font-mono text-xs text-zinc-100">{shown(each)}</dd>
              <dt className="text-2xs text-zinc-500">{each.name}</dt>
            </div>
          ))}
        </dl>
      ) : strip.length > 0 ? (
        <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1">
          {strip.map((each) => (
            <div
              key={each.key}
              className="flex items-center gap-1.5"
              // Every number says where it came from: one a shop cannot trace
              // is one they have to take on faith.
              title={each.note ? `${each.from} — ${each.note}` : each.from}
            >
              <span className="shrink-0 text-zinc-600">
                <MeasurementIcon measurement={each.key} />
              </span>
              <dd className="font-mono text-xs text-zinc-100">{each.value}</dd>
              <dt className="text-2xs text-zinc-500">{STRIP_LABELS[each.key] ?? each.label}</dt>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-2xs px-1 text-zinc-700" aria-hidden="true">
          Depth, reach and the largest tool that fits appear here.
        </p>
      )}
    </div>
  )
}
