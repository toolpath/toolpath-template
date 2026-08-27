import { Fragment, memo, useState, type ReactNode } from 'react'
import type { Vec3 } from '@toolpath/api'

import { Heading } from './heading'
import { panelButtonClass } from './panel-button'
import { GENERATOR_ICONS } from './panel-icons'
import { FaceCount } from './face-count'
import { PassButtons } from './pass-buttons'
import { ReadingRow, readingRowClass } from './reading-row'
import { directionCss } from 'shared/direction-colors'
import { directionLabel } from 'shared/report'
import { LockIcon, LockOpenIcon } from '@phosphor-icons/react'
import type { FeatureVerdict } from 'shared/rules'
import { typeLabel } from 'shared/part-summary'
import { isMade } from 'shared/make-feature'
import { moveThroughList } from 'shared/list-keys'
import { groupHoles } from 'shared/hole-groups'
import { planCoverage, setupGroups, uncutFaces, unreachableFaces } from 'shared/plan-summary'
import { GENERATORS, PICKS_WAYS_UP, type Generator } from 'shared/generate'
import type { PartFeature } from 'shared/contracts'
import type { FeatureScore } from 'shared/feature-score'
import type { PartFaces, Pass, SetupPlan } from 'shared/setups'
import { PASSES, cutState, cutsFrom, faceCounts } from 'shared/setups'
import { type FacePart, facesOf } from 'shared/faces'
import { formatArea, type Unit } from 'shared/units'
import { rowAttributes } from 'shared/row-nav'
import { usePartView } from './part-view'

/**
 * The mapping, as a plan: what is held, what each way up cuts, what is left.
 *
 * The left column of the picker's Directions page. Read top to bottom it is the
 * argument the page exists to settle — how much of the part is accounted for,
 * which orientations account for it, and what nothing has claimed yet.
 *
 * The **confirmed directions** here are not the Engine's candidate list. A
 * direction appears once somebody has put work on it: candidates are what the
 * part offers, setups are what has been decided, and showing the two as one list
 * is how a plan starts looking like it made decisions nobody made.
 */

const percent = (value: number): string => `${Math.round(value * 100)}%`

/** Nothing left. The shape "done" has everywhere else. */
const Done = () => (
  <svg
    aria-hidden="true"
    className="size-3.5 shrink-0 text-success"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth={2}
    viewBox="0 0 16 16"
  >
    <path d="M3.5 8.5l3 3 6-7" />
  </svg>
)

const CoverageBar = ({ label, mapped }: { label: string; mapped: number }) => (
  <div className="flex items-center gap-2">
    <span className="w-12 shrink-0 text-2xs font-semibold uppercase tracking-wider text-ink-dim">
      {label}
    </span>
    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-ground">
      <span
        className="block h-full rounded-full bg-success transition-[width]"
        style={{ width: `${String(mapped * 100)}%` }}
      />
    </span>
    <span className="w-9 shrink-0 text-right text-2xs tabular-nums text-ink-body">
      {percent(mapped)}
    </span>
  </div>
)

/**
 * One reading's faces, under its row.
 *
 * The level below a reading, read rather than edited: which faces it covers,
 * what each one is, and **which passes hold it**. Editing them is Edit Feature's
 * job, one press away on the same row — this is for the question that comes
 * first, which is "what is actually in this thing".
 *
 * Only for a row that is one reading. A group of identical holes expands to its
 * holes instead: two expanders on one row is one too many, and "the faces of
 * sixteen holes" is not a list anybody wants.
 */
const FaceLines = ({
  feature,
  report,
  plan,
  showingPass,
  unit,
  onHover,
}: {
  feature: PartFeature
  report: FacePart
  plan: SetupPlan
  showingPass: Pass
  unit: Unit
  onHover: (tags: Array<string>) => void
}) => (
  <ul className="ml-5 flex flex-col border-l border-edge">
    {facesOf(report, plan, feature, showingPass).map((row) => (
      <li
        key={row.idx}
        className="flex items-center gap-2 py-0.5 pl-2 text-2xs text-ink-dim"
        onMouseEnter={() => onHover([feature.featureTag])}
      >
        <span className="flex-1 truncate">Face {row.idx}</span>
        {row.added ? (
          <span
            className="shrink-0 rounded bg-proposed/20 px-1 font-semibold text-proposed"
            title="Added to this reading by hand — the Engine did not report it here"
          >
            added
          </span>
        ) : null}
        <span className="shrink-0">{row.shape}</span>
        <span className="shrink-0 tabular-nums">{formatArea(row.area, unit)}</span>
        {/* Which passes hold it — the same pips the editor draws, and the same
            question: a face roughed here and finished elsewhere is a second
            setup, and the count alone does not say so. */}
        <span className="flex shrink-0 items-center gap-0.5">
          {PASSES.map((pass) => (
            <span
              key={pass}
              title={`${pass === 'rough' ? 'Roughed' : 'Finished'} ${
                row.passes.includes(pass) ? 'here' : 'somewhere else, or not at all'
              }`}
              className={`grid size-3.5 place-items-center rounded-sm font-bold ${
                row.passes.includes(pass)
                  ? 'bg-info/25 text-info'
                  : 'border border-edge text-ink-faint'
              }`}
            >
              {pass === 'rough' ? 'R' : 'F'}
            </span>
          ))}
        </span>
      </li>
    ))}
  </ul>
)

/**
 * How many faces this reading has given up, in whichever pass holds it here.
 *
 * The panel is not a per-pass view — a setup row lists what it cuts, roughing
 * and finishing together — so the count is the worst of the two: a reading that
 * gave a face up for roughing is not cutting it for roughing, and the row has to
 * say so even if finishing still has it.
 */
const SetupsPanelView = ({
  focusedTag,
  onChoose,
  onHover,
  onSetPass,
  onShowFaces,
  onRemoveSetup,
  onGenerate,
  onFillSetup,
  onLockSetup,
  choosing,
  choosingHow,
  showingUncut,
  onShowUncut,
  onClearAll,
}: {
  focusedTag: string | null
  onChoose: (featureTag: string) => void
  onHover: (tags: Array<string>) => void
  onSetPass: (features: ReadonlyArray<PartFeature>, passes: ReadonlyArray<Pass>) => void
  /** Open a reading's faces, in place of the datasheet. */
  onShowFaces: (featureTag: string) => void
  onRemoveSetup: (setupId: string) => void
  onGenerate: (how: Generator) => void
  /** Hold one way up in By direction, and offer what it can still pick up. */
  onFillSetup: (directionIndex: number) => void
  /** Settle a way up, so the offers leave what it cuts alone. */
  onLockSetup: (setupId: string, locked: boolean) => void
  /**
   * The setup chooser, while `from the rules` is asking rather than guessing.
   *
   * Rendered under the generator buttons rather than in place of them: the
   * question is about one of those buttons, and hiding the rest would make
   * cancelling look like leaving the page.
   */
  choosing: ReactNode
  /** Which press has the chooser standing, so that one lights. */
  choosingHow: Generator | null
  /** Whether the mapping panel is showing the faces nothing cuts. */
  showingUncut: boolean
  /** Put them up there, or put them away again. */
  onShowUncut: () => void
  onClearAll: () => void
}) => {
  const { report, features, showingPass, unit, directions, plan, scores, verdicts } = usePartView()

  // Folded by default is wrong — a direction with nothing shown under it reads
  // as empty. So they open, and folding is what somebody does to get one out of
  // the way once they have read it.
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set())
  /** Which hole groups are opened to their own holes. */
  const [openHoles, setOpenHoles] = useState<ReadonlySet<string>>(new Set())
  const toggleHoles = (key: string) => {
    setOpenHoles((current) => {
      const next = new Set(current)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }
  const isFolded = (id: string) => folded.has(id)
  const toggleFold = (id: string) => {
    setFolded((current) => {
      const next = new Set(current)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const coverage = planCoverage(report, features, plan)
  const groups = setupGroups(report, features, directions, plan, verdicts)
  const left = uncutFaces(report, features, plan)
  const unreachable = unreachableFaces(report, features)

  /*
   * What is not cut yet, in words, for the tooltip.
   *
   * The faces no reading reaches from any way up are named **apart** from the
   * count rather than inside it: no arrangement can close that gap, so counting
   * it against the plan makes a finished one look incomplete for something
   * nobody can fix here.
   */
  const said = [
    left.length === 0
      ? 'Every face the Engine found a reading for is cut'
      : `${String(left.length)} of ${String(report.regions.length)} faces have no way up in the roughing pass`,
    unreachable.length > 0
      ? `${String(unreachable.length)} of those have no reading from any way up — the Engine reported nothing that reaches them`
      : null,
  ]
    .filter((line) => line !== null)
    .join('. ')

  return (
    <aside
      className="flex size-full min-h-0 flex-col overflow-y-auto bg-ground px-4 py-3 text-xs"
      onMouseLeave={() => onHover([])}
    >
      {/*
        **Which ways up do I hold**, and it comes first because it is answered
        first — above the bars that measure the answer.

        Folded by default. Four offers that would each replace the whole
        arrangement are the loudest thing on the panel and the least often
        wanted: on any part somebody is already working, the question was
        answered a hundred presses ago. The summary says how many ways up are
        held, so folded it still reports; pressing it is how you start over.

        No border and no box. It sat in a bordered card with its own padding,
        which read as a panel inside the panel — one indent deeper than
        everything around it for no reason anybody could name. It is a heading
        with buttons under it, like the rest of this column.

        `Fill all` is in here too, last and slightly apart. It answers the
        other question — given the ways up you hold, what is the best
        arrangement — and it is the press people reach for straight after one of
        the four above it, so it belongs where they are already looking. It only
        means anything once ways up are held, which is why it is off until they
        are; the fold closes at that same moment, so reaching it again is one
        press on the summary.
      */}
      <details open={groups.length === 0} className="group">
        <summary className="flex cursor-pointer select-none list-none items-center gap-1.5 pb-2 text-2xs font-bold uppercase tracking-wider text-ink-muted transition hover:text-ink-strong">
          <svg
            aria-hidden="true"
            className="size-3 shrink-0 transition-transform group-open:rotate-90"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            viewBox="0 0 16 16"
          >
            <path d="M6 3.5l5 4.5-5 4.5" />
          </svg>
          Generate directions
          {groups.length === 0 ? null : (
            <span className="font-sans font-normal normal-case tracking-normal text-ink-faint">
              — {groups.length} held
            </span>
          )}
        </summary>

        <div className="grid grid-cols-2 gap-2 pb-3">
          {GENERATORS.filter((generator) => PICKS_WAYS_UP.includes(generator.how)).map(
            (generator) => (
              <button
                key={generator.how}
                type="button"
                onClick={() => onGenerate(generator.how)}
                // What each one does, on hover. Four two-line cards were the
                // tallest thing on the panel, describing a question most people
                // have already answered.
                title={generator.note}
                // Lit while its own chooser stands: two of these open one
                // rather than writing a plan, and a question on screen with
                // nothing showing which press asked it is a question people
                // answer twice.
                aria-pressed={generator.how === choosingHow}
                className={`flex items-center gap-1.5 ${panelButtonClass({
                  pressed: generator.how === choosingHow,
                })}`}
              >
                {GENERATOR_ICONS[generator.icon]()}
                <span className="truncate">{generator.name}</span>
              </button>
            ),
          )}

          {GENERATORS.filter((generator) => !PICKS_WAYS_UP.includes(generator.how)).map(
            (generator) => (
              <button
                key={generator.how}
                type="button"
                onClick={() => onGenerate(generator.how)}
                /*
                 * Off until there is something to fill.
                 *
                 * It works the ways up you hold, so with none held its honest
                 * answer is to do nothing — and a button that does nothing reads
                 * as one that failed. The note it used to wear moves to the
                 * tooltip with everything else: beside a one-line button, a
                 * second line of explanation is what made the pair look like two
                 * paragraphs rather than two controls.
                 */
                disabled={groups.length === 0}
                title={
                  groups.length === 0
                    ? 'Hold a way up first — this works the ones you already hold'
                    : generator.note
                }
                className={`flex items-center gap-1.5 ${panelButtonClass()}`}
              >
                {GENERATOR_ICONS[generator.icon]()}
                <span className="flex-1 truncate text-left">{generator.name}</span>
                {/*
                The same tick its neighbour wears, for the same reason: there is
                nothing left to fill. Two buttons about one state, and a state
                that shows on one of them and not the other is two answers.
              */}
                {left.length === 0 && groups.length > 0 ? <Done /> : null}
              </button>
            ),
          )}
        </div>
      </details>

      {/* The chooser stands under the press that opened it, above the bars
          it is about to change. */}
      {choosing}

      <div className="flex items-center justify-between">
        <Heading>Coverage</Heading>
        <button
          type="button"
          onClick={onClearAll}
          disabled={groups.length === 0}
          className={`mb-1 ${panelButtonClass({ tone: 'danger' })}`}
        >
          Clear all
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        {coverage.map((entry) => (
          <CoverageBar
            key={entry.pass}
            label={entry.pass === 'rough' ? 'Rough' : 'Finish'}
            mapped={entry.mapped}
          />
        ))}
      </div>

      {/*
        What is left, under what is done.

        It was at the foot of the panel, a screenful below the bars measuring
        the same thing, which is no place for the one number somebody checks
        after every press.
      */}
      <div className="mt-2 flex flex-col">
        <button
          type="button"
          onClick={onShowUncut}
          aria-pressed={showingUncut}
          /*
           * Everything it used to say, in the tooltip.
           *
           * The button said it in three lines — a sentence for the count, a
           * second for the faces no reading reaches, and a third congratulating
           * anybody who had finished. Under a pair of coverage bars that answer
           * the same question, a button is the wrong place for a paragraph: the
           * figure is the answer, and the rest is there on hover.
           */
          title={said}
          className={`flex items-center justify-between gap-1.5 ${panelButtonClass({
            pressed: showingUncut,
          })}`}
        >
          Not cut yet
          {/*
            Done says itself with a tick, and the rest says itself with a
            figure. Neither needs a sentence — the tick is the shape "nothing
            left" has everywhere else, and `(12)` is the shape a count has.
          */}
          {left.length === 0 ? (
            <Done />
          ) : (
            <span className="shrink-0 tabular-nums text-ink-body">({left.length})</span>
          )}
        </button>
      </div>

      <Heading>Directions</Heading>
      {groups.length === 0 ? (
        <>
          <p className="text-xs leading-5 text-ink-dim">
            {/*
            What the four offers above actually do, in one line each.

            The advice here used to be *press R, F or Both on a reading* — true,
            and the long way round: this panel is where a whole fixturing gets
            decided in one press now, and mapping a feature at a time is the
            other panel's job. So it says what the presses above it are for, and
            leaves that road to the panel that owns it.
          */}
            No features have been mapped to machining directions yet. Open{' '}
            <span className="font-semibold text-ink-body">Generate Directions</span> to
            automatically map features to directions, or use the right hand panel to begin mapping
            manually (by face or by direction).
          </p>
          <ul className="mt-1.5 flex flex-col gap-1 text-2xs leading-4 text-ink-dim">
            {GENERATORS.filter((generator) => PICKS_WAYS_UP.includes(generator.how)).map(
              (generator) => (
                <li key={generator.how} className="flex gap-1.5">
                  <span className="mt-px shrink-0 text-ink-faint">
                    {GENERATOR_ICONS[generator.icon]()}
                  </span>
                  <span>
                    <span className="font-semibold text-ink-body">{generator.name}</span> —{' '}
                    {generator.note}
                  </span>
                </li>
              ),
            )}
            <li className="mt-1 text-ink-faint">
              Or use the panel on the right to map features directly, by selecting faces or by
              direction.
            </li>
          </ul>
        </>
      ) : (
        <ul className="flex flex-col gap-3">
          {groups.map((group) => (
            <li key={group.setup.id} data-setup={group.label}>
              <header className="flex items-center gap-2 border-b border-edge pb-1">
                {/*
                  The row lights everything this way up cuts, for as long as it
                  is the row in hand — hovered or under the keyboard. It stops
                  when focus leaves, so the part is never left explaining a row
                  nobody is on any more.
                */}
                <button
                  type="button"
                  aria-expanded={!isFolded(group.setup.id)}
                  onClick={() => toggleFold(group.setup.id)}
                  onMouseEnter={() => onHover(group.readings.map((f) => f.featureTag))}
                  onMouseLeave={() => onHover([])}
                  onFocus={() => onHover(group.readings.map((f) => f.featureTag))}
                  onBlur={() => onHover([])}
                  title={`${isFolded(group.setup.id) ? 'Show' : 'Hide'} what ${group.label} cuts`}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span aria-hidden="true" className="w-2 shrink-0 text-ink-dim">
                    {isFolded(group.setup.id) ? '▸' : '▾'}
                  </span>
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: directionCss(group.setup.directionIndex) }}
                  />
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink-strong">
                    {group.setup.name}
                  </span>
                </button>
                <span className="shrink-0 text-2xs tabular-nums text-ink-dim">
                  {group.readings.length} · {percent(group.mapped)}
                </span>
                {/*
                  Fill **this** way up, and go and look at what it did.

                  It was one button under the whole list, which is where nobody
                  found it — and it asks a question about a *direction*, so it
                  belongs on the direction. Pressing it fills this setup and
                  opens By direction on it, because the next thing anybody wants
                  is to see what turned up.

                  Off when there is nothing to do: every reading this way up can
                  reach is already mapped, or it can reach none.
                */}
                <button
                  type="button"
                  disabled={group.canInfer === false}
                  onClick={() => onFillSetup(group.setup.directionIndex)}
                  title={
                    group.canInfer === false
                      ? `Nothing left for ${group.label} to pick up`
                      : `Map what ${group.label} can still reach, and show them`
                  }
                  // Grey like every other control on the row. It was in the
                  // info blue, which this app spends on *what is on* — and a
                  // press that is merely available reading as a state that is
                  // active made it the loudest thing in a row it does not lead.
                  className="shrink-0 rounded border border-edge-strong px-1.5 py-0.5 text-2xs font-medium text-ink-muted transition enabled:hover:border-edge-hover enabled:hover:text-ink disabled:cursor-not-allowed disabled:border-edge disabled:text-ink-faint"
                >
                  Fill
                </button>
                {/*
                  A lock, because a generator writes a whole arrangement in one
                  press and used to do it over the top of ten minutes of
                  correcting. Locking says "this is a decision, not a
                  suggestion", and the offers leave it alone.
                */}
                <button
                  type="button"
                  aria-pressed={group.setup.locked === true}
                  onClick={() => onLockSetup(group.setup.id, group.setup.locked !== true)}
                  title={
                    group.setup.locked === true
                      ? `${group.label} is settled — offers leave it alone. Press to unlock.`
                      : `Settle ${group.label}, so offers leave what it cuts alone`
                  }
                  className={`shrink-0 rounded border px-1.5 py-0.5 text-2xs font-medium transition ${
                    group.setup.locked === true
                      ? 'border-info bg-info/20 text-info'
                      : 'border-edge-strong text-ink-dim hover:border-edge-hover hover:text-ink-body'
                  }`}
                >
                  {group.setup.locked === true ? <LockIcon /> : <LockOpenIcon />}
                </button>
                <button
                  type="button"
                  disabled={group.setup.locked === true}
                  onClick={() => onRemoveSetup(group.setup.id)}
                  title={
                    group.setup.locked === true
                      ? `${group.label} is settled — unlock it first`
                      : `Stop holding ${group.label}`
                  }
                  className="shrink-0 rounded border border-edge-strong px-1.5 py-0.5 text-2xs font-medium text-ink-muted transition enabled:hover:border-danger enabled:hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Remove
                </button>
              </header>

              {/* The readings this way up cuts. Walked by the same keyboard the
                  other lists use. */}
              <ul
                className={`mt-1 ml-3 flex-col border-l border-edge ${
                  isFolded(group.setup.id) ? 'hidden' : 'flex'
                }`}
                onKeyDown={(event) => moveThroughList(event)}
              >
                {groupHoles(group.readings).map((holes) => {
                  // Identical holes are one decision and one tool, so one row.
                  const feature = holes.holes[0]!
                  const chosen = feature.featureTag === focusedTag
                  return (
                    <Fragment key={holes.key}>
                      <li
                        className={`flex items-center gap-1 rounded pr-1 ${
                          chosen ? 'bg-info/15' : 'hover:bg-ground/40'
                        }`}
                        /*
                         * A group lights **all** of its holes. It is one decision
                         * over eight bolt-circle holes, so pointing at the row
                         * should show the eight rather than whichever one happens
                         * to lead it.
                         */
                        onMouseEnter={() => onHover(holes.holes.map((h) => h.featureTag))}
                        onMouseLeave={() => onHover([])}
                      >
                        {holes.holes.length > 1 ? (
                          <button
                            type="button"
                            aria-expanded={openHoles.has(holes.key)}
                            title={
                              openHoles.has(holes.key) ? 'Hide these holes' : 'Show these holes'
                            }
                            onClick={() => toggleHoles(holes.key)}
                            className="w-3 shrink-0 text-2xs text-ink-dim transition hover:text-ink-strong"
                          >
                            {openHoles.has(holes.key) ? '▾' : '▸'}
                          </button>
                        ) : (
                          /*
                            One reading: the same triangle opens its **faces**.
                            
                            A group of identical holes expands to its holes, and
                            a single reading has nothing else worth expanding to
                            — so one control, two meanings decided by what the
                            row stands for, rather than two triangles competing
                            for the same three pixels.
                          */
                          <button
                            type="button"
                            aria-expanded={openHoles.has(holes.key)}
                            aria-label={
                              openHoles.has(holes.key)
                                ? `Hide the faces of ${typeLabel(feature.featureType)}`
                                : `Show the faces of ${typeLabel(feature.featureType)}`
                            }
                            title={openHoles.has(holes.key) ? 'Hide its faces' : 'Show its faces'}
                            onClick={() => toggleHoles(holes.key)}
                            className="w-3 shrink-0 text-2xs text-ink-dim transition hover:text-ink-strong"
                          >
                            {openHoles.has(holes.key) ? '▾' : '▸'}
                          </button>
                        )}

                        <button
                          type="button"
                          {...rowAttributes(feature.featureTag)}
                          aria-pressed={chosen}
                          onMouseEnter={() => onHover([feature.featureTag])}
                          onFocus={() => {
                            onChoose(feature.featureTag)
                            onHover(holes.holes.map((h) => h.featureTag))
                          }}
                          onBlur={() => onHover([])}
                          onClick={() => onChoose(feature.featureTag)}
                          className={readingRowClass(chosen)}
                        >
                          <ReadingRow
                            reading={feature}
                            score={scores.get(feature.featureTag)}
                            /*
                             * No way up on the row: these are grouped under a
                             * header that names it, and repeating it cost more
                             * width than the reading itself — on a direction
                             * with no short name it drew `(-0.33, 0.00, 0.95)`
                             * on every line, and `Wall` came out as `W.`.
                             */
                          />
                        </button>
                        <FaceCount
                          {...faceCounts(plan, feature)}
                          onShow={() => onShowFaces(feature.featureTag)}
                        />
                        <PassButtons
                          label={group.label}
                          rough={cutState(plan, feature, 'rough', group.setup)}
                          finish={cutState(plan, feature, 'finish', group.setup)}
                          onSetPass={(passes) => onSetPass(holes.holes, passes)}
                        />
                      </li>
                      {openHoles.has(holes.key) && holes.holes.length === 1 ? (
                        <li>
                          <FaceLines
                            feature={feature}
                            report={{ ...report, features }}
                            plan={plan}
                            showingPass={showingPass}
                            unit={unit}
                            onHover={onHover}
                          />
                        </li>
                      ) : null}
                      {openHoles.has(holes.key) && holes.holes.length > 1
                        ? holes.holes.map((hole) => (
                            <li
                              key={hole.featureTag}
                              className="ml-5 flex items-center gap-2 border-l border-edge py-0.5 pl-2 text-2xs text-ink-dim"
                              onMouseEnter={() => onHover([hole.featureTag])}
                              onMouseLeave={() => onHover(holes.holes.map((h) => h.featureTag))}
                            >
                              <button
                                type="button"
                                {...rowAttributes(hole.featureTag)}
                                onFocus={() => onChoose(hole.featureTag)}
                                onClick={() => onChoose(hole.featureTag)}
                                className="flex-1 truncate text-left font-mono transition hover:text-ink-strong"
                              >
                                {hole.featureTag.slice(-6)}
                              </button>
                              <span className="tabular-nums">{hole.regionIdxs.length}f</span>
                            </li>
                          ))
                        : null}
                    </Fragment>
                  )
                })}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}

/*
 * Memoised, because the page above it re-renders on thirty-odd pieces of state
 * and almost none of them are this panel's. Hovering a face row sets
 * `hoveredFace`, which feeds the part's paint layers and nothing here.
 *
 * Its presses arrive through `useStable`, so they hold one identity and this
 * comparison can actually succeed.
 */
export const SetupsPanel = memo(SetupsPanelView)
