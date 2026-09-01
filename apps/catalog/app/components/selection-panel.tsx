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
import {
  HOLE_MODES,
  THREAD_READS,
  type HoleMode,
  type ThreadRead,
  type ThreadSpec,
} from 'shared/threads'
import type { HoleSummary } from 'shared/hole-mode'
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
    /** What every hole on the part comes to, for the mode that reads them together. */
    readonly summary?: HoleSummary | null
    /**
     * Threading every size that reads as one, in a press.
     *
     * **In the box rather than over the table** (Paul, 2026-09-01): it is a
     * thing to say about the *part* — how this shop's CAD draws a tapped hole
     * — and the box is where the part is described.
     */
    readonly threads?: {
      readonly read: ThreadRead
      readonly onRead: (read: ThreadRead) => void
      readonly mode: HoleMode
      readonly onMode: (mode: HoleMode) => void
      /** How many sizes would be threaded, out of how many there are. */
      readonly would: number
      readonly sizes: number
      readonly onApply: () => void
      /** How many were threaded by the last press, until something changes. */
      readonly applied: number | null
    }
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

  const summary = allHoles?.summary ?? null
  /** A length in the page's unit, with the unit said once at the end of the range. */
  const bare = (millimetres: number): string =>
    convertLength(millimetres, MODEL_UNIT, unit).toFixed(decimalsFor(unit))
  const span = (from: number, to: number): string =>
    from === to ? `${bare(from)} ${unit}` : `${bare(from)} – ${bare(to)} ${unit}`
  const ratio = (from: number, to: number): string =>
    from === to ? from.toFixed(1) : `${from.toFixed(1)} – ${to.toFixed(1)}`

  return (
    <div className="flex flex-col gap-1.5 p-2">
      <h4 className="text-2xs flex items-center gap-1.5 font-semibold tracking-wide text-zinc-500 uppercase">
        <span className="text-zinc-600">
          <CursorClickIcon />
        </span>
        Features
      </h4>

      {/*
        **The two ways to read a part, side by side and named** (Paul,
        2026-09-01). Reading every hole at once used to be a button inside the
        selected-feature field, which put an alternative to selecting inside
        the thing it is an alternative to. It is a mode, so it is a mode
        switch, and it is the first thing in the box.
      */}
      {allHoles && allHoles.holes > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="text-2xs tracking-wide text-zinc-500">Mode:</span>
          <div className="grid grid-cols-2 gap-1">
            {(
              [
                [false, 'Select Feature'],
                [true, `All Holes`],
              ] as const
            ).map(([holes, label]) => (
              <button
                key={label}
                type="button"
                aria-pressed={allHoles.on === holes}
                onClick={() => {
                  if (allHoles.on !== holes) {
                    allHoles.onToggle()
                  }
                }}
                className={classNames(
                  'focus-visible:ring-info/60 rounded border px-2 py-1.5 text-sm transition focus-visible:ring-1 focus-visible:outline-none',
                  allHoles.on === holes
                    ? 'border-info/60 bg-info/15 text-info'
                    : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200',
                )}
              >
                {label}
                {holes ? (
                  <span className="ml-1.5 text-zinc-500">{String(allHoles.holes)}</span>
                ) : null}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Every hole at once: what the part asks for, rather than what one hole does. */}
      {allHoles?.on && summary ? (
        <dl className="flex flex-col gap-1 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2 py-1.5">
          <div className="flex items-baseline gap-1.5">
            <dd className="font-mono text-sm text-zinc-100">{String(summary.holes)}</dd>
            <dt className="text-2xs text-zinc-500">
              holes{summary.sizes === summary.holes ? '' : ` · ${String(summary.sizes)} sizes`}
            </dt>
          </div>
          {(
            [
              ['diameter', 'diameter', span(summary.diameter.min, summary.diameter.max)],
              ['featureDepth', 'depth', span(summary.depth.min, summary.depth.max)],
              ['ld', 'L/D needed', ratio(summary.ld.min, summary.ld.max)],
            ] as const
          ).map(([icon, label, value]) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className="shrink-0 text-zinc-600">
                <MeasurementIcon measurement={icon} />
              </span>
              <dd className="font-mono text-xs text-zinc-100">{value}</dd>
              <dt className="text-2xs text-zinc-500">{label}</dt>
            </div>
          ))}
        </dl>
      ) : null}

      {allHoles?.on && allHoles.threads ? (
        <div className="text-2xs flex flex-col gap-1 rounded-lg border border-zinc-800 px-2 py-1.5 text-zinc-400">
          <span className="font-semibold tracking-wide text-zinc-500 uppercase">
            Automatically apply threads
          </span>
          <label className="flex items-center justify-between gap-2">
            Modeled hole diameter:
            <select
              aria-label="Modeled hole diameter"
              value={allHoles.threads.read}
              onChange={(event) => allHoles.threads?.onRead(event.target.value as ThreadRead)}
              className="focus-visible:ring-info/60 min-w-0 flex-1 rounded border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 text-zinc-100 focus-visible:ring-1 focus-visible:outline-none"
            >
              {THREAD_READS.map((each) => (
                <option key={each} value={each}>
                  {each}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center justify-between gap-2">
            Type:
            <select
              aria-label="Type of tap"
              value={allHoles.threads.mode}
              onChange={(event) => allHoles.threads?.onMode(event.target.value as HoleMode)}
              className="focus-visible:ring-info/60 min-w-0 flex-1 rounded border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 text-zinc-100 focus-visible:ring-1 focus-visible:outline-none"
            >
              {HOLE_MODES.filter((each) => each !== 'plain').map((each) => (
                <option key={each} value={each}>
                  {each}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={allHoles.threads.would === 0}
            onClick={allHoles.threads.onApply}
            className="focus-visible:ring-info/60 border-info/50 text-info hover:border-info/80 hover:bg-info/10 rounded border px-2 py-1 font-semibold transition focus-visible:ring-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:border-zinc-900 disabled:text-zinc-700"
          >
            Apply to {String(allHoles.threads.would)} of {String(allHoles.threads.sizes)}
          </button>
          {allHoles.threads.applied === null ? null : (
            <span className="text-info">
              {allHoles.threads.applied === 0
                ? 'no size reads as a thread that way'
                : `threaded ${String(allHoles.threads.applied)} ${allHoles.threads.applied === 1 ? 'size' : 'sizes'}`}
            </span>
          )}
        </div>
      ) : null}

      {/*
        In all-holes mode the box is the summary and nothing else: a field that
        says "click a face" under a mode that reads every hole is an
        instruction for the other mode.
      */}
      {allHoles?.on ? null : (
        <>
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
          ) : null}
        </>
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
