import { Button, Combobox, IconButton, cn } from '@toolpath/ui'
import { InfoIcon } from '@phosphor-icons/react'
import type { PartFeature } from '@toolpath/part-contracts'
import {
  STRIP_LABELS,
  measurements,
  stripMeasurements,
} from '@toolpath/part-contracts/measurements'
import { ThreadPicker } from './thread-picker'
import type { HoleMode, ThreadSpec } from 'shared/threads'
import { type UnitSystem } from '@toolpath/tool-support'
import { defaultsFor, readingText, readingsFor } from 'shared/feature-defaults'
import { featureRow } from 'shared/feature-rows'
import { KindIcon, MeasurementIcon } from './feature-icons'
import { CatalogComboboxButton } from './catalog-combobox-button'

export interface SelectionPanelProps {
  /** The reading on screen, or nothing while the part is untouched. */
  readonly feature: PartFeature | null
  /** Every feature on the part, so depth can be measured from its top. */
  readonly features: ReadonlyArray<PartFeature>
  readonly regions: ReadonlyArray<{ idx: number; shapeKind: string }>
  readonly unit: UnitSystem
  /**
   * What a reading is called, where the route can say.
   *
   * **A thread is part of the name** (Paul, 2026-09-08: "once a thread is
   * selected, anywhere that feature is used should show the new name"). The
   * panel named a reading off `featureRow` and the list named it through the
   * route's `nameOf`, so the row said `#4-40 UNC Blind Hole` and the panel
   * above it said `Blind Hole` about the same hole. The thread is kept per
   * feature by the route, so the route is the only place that can answer this;
   * without one, the kernel's own kind stands in.
   */
  readonly nameOf?: (featureTag: string) => string
  /**
   * Identical holes on the part, this one included.
   *
   * **It is a count of the part, not of this reading** (Paul, 2026-09-09).
   * Until then a hole *stood for* its siblings — every path through
   * `part-interaction` expanded it — so the badge said how many features the
   * row would hold. A hole is asked about on its own now, and the number is
   * what makes {@link SelectionPanelProps.identical} worth offering.
   */
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
   * The offer to ask about every identical hole at once, where there are some.
   *
   * **Grouping identical holes is a GROUP rule** (Paul, 2026-09-09: "In Add
   * Feature, I should be able to select a single hole. The Add Feature Dialog
   * should warn me there are other identical holes and ask if I want to add
   * them in a group"). So the panel states the fact and offers both answers:
   * taking it switches to the group editor with all of them in, and *Just this
   * hole* puts the offer away for this reading and leaves an individual
   * feature to be added.
   *
   * Absent for a lone hole, for anything that is not a hole, and while a group
   * is already being built — there is nothing left to offer there.
   */
  readonly identical?: {
    /** How many, this one included: the number the press names. */
    readonly count: number
    readonly onGroup: () => void
    readonly onDismiss: () => void
  }
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
    className={cn('size-2 shrink-0 rounded-full border border-zinc-700', hidden && 'opacity-0')}
    style={colour === null ? undefined : { background: colour, borderColor: colour }}
  />
)

export const SelectionPanel = ({
  feature,
  nameOf,
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
  identical,
  thread,
}: SelectionPanelProps) => {
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

  /** What one reading is called — the route's rule, or the kernel's kind. */
  const named = (each: PartFeature): string =>
    nameOf?.(each.featureTag) ?? featureRow({ feature: each, features, regions, unit }).type

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

  return (
    <div className="flex flex-col gap-1.5">
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
            ? 'border-info/60 bg-info/15 flex items-center gap-2 rounded-lg border px-2 py-1.5'
            : 'flex items-center gap-2 rounded-lg border border-dashed border-zinc-800 px-2 py-1.5'
        }
      >
        {row && feature ? (
          <>
            <span className="shrink-0 text-zinc-400">
              <KindIcon featureType={feature.featureType} kind={row.type} />
            </span>
            {candidates.length > 1 && onRead ? (
              <div className="min-w-0 flex-1">
                <Combobox
                  items={candidates}
                  value={feature}
                  onValueChange={(next) => {
                    if (next !== null) {
                      onRead(next.featureTag)
                    }
                  }}
                  itemToStringLabel={(each) => (asking ? 'Select a direction' : named(each))}
                  size="sm"
                  variant="ghost"
                >
                  <CatalogComboboxButton
                    label="What this face reads as"
                    placeholder="Select a direction"
                  />
                  <Combobox.Popover>
                    <Combobox.List>
                      {candidates.map((each) => (
                        <Combobox.Item key={each.featureTag} value={each}>
                          <Swatch colour={colourOf?.(each) ?? null} />
                          <span className="min-w-0 flex-1 truncate">{named(each)}</span>
                          <span className="text-2xs shrink-0 font-mono text-zinc-500">
                            {featureRow({ feature: each, features, regions, unit }).direction}
                          </span>
                          <Combobox.ItemIndicator />
                        </Combobox.Item>
                      ))}
                    </Combobox.List>
                  </Combobox.Popover>
                </Combobox>
              </div>
            ) : (
              <span className="truncate text-sm font-semibold text-zinc-100">{named(feature)}</span>
            )}
            {siblings > 1 ? (
              <span
                className="text-2xs shrink-0 rounded bg-zinc-800 px-1 py-0.5 font-semibold text-zinc-300"
                title={`${String(siblings)} identical holes on this part — same diameter, depth and way up. This is one of them.`}
              >
                ×{siblings}
              </span>
            ) : null}
            <span className="text-2xs ml-auto shrink-0 font-mono text-zinc-500">
              {row.direction}
            </span>
            <IconButton
              size="md"
              variant="muted"
              aria-label={`What Toolpath measured about ${named(feature)}`}
              title="Everything Toolpath measured"
              onClick={onInfo}
              className="shrink-0 rounded p-0.5 text-zinc-500 hover:text-zinc-200"
            >
              <InfoIcon />
            </IconButton>
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

      {/*
        **The offer, not the grouping** (Paul, 2026-09-09). A hole used to be
        kept with its identical siblings whatever was being asked, so a bolt
        circle could not be asked about one hole at a time; the grouping is a
        group's rule now and this is where it is offered. Both answers are
        here — taking it opens the group editor with all of them in it, and
        *Just this hole* leaves the individual feature the footer will add.
      */}
      {identical ? (
        <div className="border-info/40 bg-info/10 flex flex-col gap-1.5 rounded border px-2 py-1.5">
          <p className="text-2xs text-zinc-300">
            {identical.count - 1 === 1
              ? 'One other hole on this part is identical'
              : `${String(identical.count - 1)} other holes on this part are identical`}{' '}
            — same diameter, depth and way up.
          </p>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="secondary" onClick={identical.onGroup}>
              Add all {identical.count} as a group
            </Button>
            <Button size="sm" variant="muted" onClick={identical.onDismiss}>
              Just this hole
            </Button>
          </div>
        </div>
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
              <dd className="font-mono text-xs text-zinc-100">{readingText(each, unit)}</dd>
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
