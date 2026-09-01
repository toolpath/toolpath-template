import { useState } from 'react'
import { CaretDownIcon, CursorClickIcon, InfoIcon } from '@phosphor-icons/react'
import type { PartFeature } from '@toolpath/part-contracts'
import {
  STRIP_LABELS,
  measurements,
  stripMeasurements,
} from '@toolpath/part-contracts/measurements'
import { classNames } from '@toolpath/domain/class-names'
import { ThreadPicker } from './thread-picker'
import type { HoleMode, ThreadSpec } from 'shared/threads'
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
  /**
   * Everything else the clicked face could be cut as.
   *
   * They were a box of their own beside this one; Paul's call (2026-08-31):
   * one box, and the alternatives behind the name itself. Empty until a face
   * is clicked.
   */
  readonly candidates?: ReadonlyArray<PartFeature>
  readonly onRead?: (featureTag: string) => void
  /** The colour each one's arrow wears, for the swatch beside it. */
  readonly colourOf?: (feature: PartFeature) => string | null
  /** Which way up each is cut from, so the panel knows when there is a choice. */
  readonly directionOf?: (feature: PartFeature) => number | null
  /** Whether the reading was named rather than guessed by the click. */
  readonly chose?: boolean
  /**
   * Hole mode: what this hole is threaded for, and how to say otherwise.
   *
   * Only where the reading is a hole; the box grows the question rather than
   * opening one of its own (Paul, 2026-08-31).
   */
  readonly thread?: {
    readonly holeDiameter: number
    readonly mode: HoleMode
    readonly spec: ThreadSpec | null
    readonly onChange: (choice: { mode: HoleMode; spec: ThreadSpec | null }) => void
  }
  /**
   * The other thing to do with a part that has just been opened: read every
   * hole at once. Offered only while nothing is selected, because it is an
   * alternative to selecting rather than a thing to do afterwards (Paul,
   * 2026-08-31).
   */
  readonly allHoles?: {
    readonly on: boolean
    readonly holes: number
    readonly onToggle: () => void
  }
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
/**
 * A way up as its own colour: the same one its arrow wears on the part.
 *
 * The colour is handed in rather than looked up, because looking one up means
 * importing `@toolpath/viewer`, and that installs camera controls against a
 * DOM at import time — too much to drag in for a dot.
 */
const Swatch = ({ colour, hidden = false }: { colour: string | null; hidden?: boolean }) => (
  <span
    aria-hidden="true"
    className={classNames(
      'size-2 shrink-0 rounded-full border border-zinc-700',
      hidden && 'opacity-0',
    )}
    style={colour === null ? undefined : { background: colour, borderColor: colour }}
  />
)

export const SelectionPanel = ({
  feature,
  features,
  regions,
  unit,
  siblings,
  onInfo,
  candidates = [],
  onRead,
  directionOf,
  colourOf,
  chose = true,
  thread,
  allHoles,
}: SelectionPanelProps) => {
  const [listing, setListing] = useState(false)
  const ways = new Set(
    candidates.flatMap((each) => {
      const at = directionOf?.(each) ?? null
      return at === null || at < 0 ? [] : [at]
    }),
  )
  /**
   * More than one way up and nobody has said which: the field asks rather
   * than answering. The reading underneath is still the click's best guess —
   * it is what the tool list is for — but the panel does not pretend it is a
   * decision (Paul, 2026-08-31).
   */
  const asking = ways.size > 1 && !chose
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
            {candidates.length > 1 && onRead ? (
              <span className="relative min-w-0 flex-1">
                <button
                  type="button"
                  aria-expanded={listing}
                  aria-label="What this face reads as"
                  onClick={() => setListing((was) => !was)}
                  className="focus-visible:ring-info/60 flex w-full items-center gap-1.5 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 text-left focus-visible:ring-1 focus-visible:outline-none"
                >
                  <Swatch colour={colourOf?.(feature) ?? null} hidden={asking} />
                  <span
                    className={classNames(
                      'min-w-0 flex-1 truncate text-sm font-semibold',
                      asking ? 'text-info' : 'text-zinc-100',
                    )}
                  >
                    {asking ? 'Select a direction' : row.type}
                  </span>
                  <CaretDownIcon aria-hidden="true" className="shrink-0 text-zinc-500" />
                </button>
                {listing ? (
                  <ul className="absolute top-full left-0 z-30 mt-1 max-h-64 w-max min-w-full overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 py-0.5 shadow-xl">
                    {candidates.map((each) => (
                      <li key={each.featureTag}>
                        <button
                          type="button"
                          aria-pressed={each.featureTag === feature.featureTag}
                          onClick={() => {
                            onRead(each.featureTag)
                            setListing(false)
                          }}
                          className={classNames(
                            'flex w-full items-center gap-2 px-2 py-1 text-left text-xs',
                            each.featureTag === feature.featureTag && !asking
                              ? 'bg-info/15 text-zinc-100'
                              : 'text-zinc-300 hover:bg-zinc-900',
                          )}
                        >
                          <Swatch colour={colourOf?.(each) ?? null} />
                          <span className="min-w-0 flex-1 truncate">
                            {featureRow({ feature: each, features, regions, unit }).type}
                          </span>
                          <span className="text-2xs shrink-0 font-mono text-zinc-500">
                            {featureRow({ feature: each, features, regions, unit }).direction}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </span>
            ) : (
              <span className="truncate text-sm font-semibold text-zinc-100">{row.type}</span>
            )}
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
        ) : allHoles && allHoles.holes > 0 ? (
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <span className="min-w-0 flex-1 text-xs text-zinc-500">
              {allHoles.on ? 'Reading every hole on the part' : 'Click a face on the part'}
            </span>
            <button
              type="button"
              aria-pressed={allHoles.on}
              onClick={allHoles.onToggle}
              className={classNames(
                'text-2xs focus-visible:ring-info/60 shrink-0 rounded border px-2 py-0.5 transition focus-visible:ring-1 focus-visible:outline-none',
                allHoles.on
                  ? 'border-info/60 bg-info/15 text-info'
                  : 'border-zinc-700 text-zinc-300 hover:border-zinc-600 hover:text-zinc-100',
              )}
            >
              {allHoles.on ? 'Done' : `Select all ${String(allHoles.holes)} holes`}
            </button>
          </span>
        ) : (
          <span className="text-xs text-zinc-500">
            Click a face on the part — again to cycle its readings
          </span>
        )}
      </div>

      {/* Two ways to say the same thing, and the arrows are the one that says
       *which way up* — so the field points at them (Paul, 2026-08-31). */}
      {ways.size > 1 ? (
        <p className="text-2xs text-zinc-500">click an arrow for machining direction</p>
      ) : null}

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

      {/* Hole mode: a hole is drawn as a hole whether or not it is threaded,
          so the panel asks (Paul, 2026-08-31). */}
      {thread ? (
        <ThreadPicker
          holeDiameter={thread.holeDiameter}
          mode={thread.mode}
          spec={thread.spec}
          onChange={thread.onChange}
          unit={unit}
        />
      ) : null}
    </div>
  )
}
