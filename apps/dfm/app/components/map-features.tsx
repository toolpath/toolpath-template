import { memo, useMemo, useState, type ReactNode } from 'react'
import type { Vec3 } from '@toolpath/api'

import { FaceCount } from './face-count'
import { KindIcon } from './feature-icons'
import { PassButtons } from './pass-buttons'
import { panelButtonClass } from './panel-button'
import { CreateIcon, DirectionIcon, FeatureIcon } from './panel-icons'
import { ScoreBadge } from './score-badge'
import { directionCss } from 'shared/direction-colors'
import { directionLabel } from 'shared/report'
import { cutElsewhere, type FacePart } from 'shared/faces'
import { pluralLabel, typeLabel } from 'shared/part-summary'
import { isMade } from 'shared/make-feature'
import { moveThroughList } from 'shared/list-keys'
import { byDirection, offersFor } from 'shared/map-features'
import { groupAcrossPart, groupHoles, holeDiameter } from 'shared/hole-groups'
import { blockedBy, lockedClaims, settledSetup, setupForReading } from 'shared/plan-actions'
import type { LockedClaims } from 'shared/plan-actions'
import type { UncutFace } from 'shared/plan-summary'
import { PASSES, cutState, directionOf, faceCounts, groupCutState } from 'shared/setups'
import type { PartFaces, Pass, SetupPlan } from 'shared/setups'
import { LockIcon } from '@phosphor-icons/react'
import type { PartFeature } from 'shared/contracts'
import type { FeatureScore } from 'shared/feature-score'
import type { PickMode } from 'shared/pick-mode'
import { CreateFeature } from './create-feature'
import { EMPTY_DRAFT, type Draft, type Touching } from 'shared/make-feature'
import { INFER_SCOPES, type Infer } from 'shared/infer'
import type { Proposal } from 'shared/proposal'
import { formatArea, formatLength, type Unit } from 'shared/units'
import { keynavAttributes, rowAttributes } from 'shared/row-nav'
import { usePartView } from './part-view'

/**
 * Map features — where the mapping is actually done.
 *
 * Two modes, and the toggle decides what a click on the part means *before* the
 * click happens (§3.9). One hidden until after the first click is one discovered
 * by making the wrong kind of click, so it is always on screen.
 *
 * | Mode             | A click on the part                  | This panel shows                     |
 * | ---------------- | ------------------------------------ | ------------------------------------ |
 * | **By direction** | Paints that face into a set          | Which way up would cut that group    |
 * | **By face**      | Picks that face and ranks its owners | What owns the face, each assignable  |
 *
 * Content-sized rather than a resizable panel: a panel group keeps its layout
 * across a child's remount, so the first click's height survived every click
 * after it and three directions of readings arrived in a peephole (§8).
 */
/**
 * What the list underneath is showing — one question, three answers.
 *
 * The two pick modes decide what a click on the part means *before* the click
 * happens (§3.9). **Unmapped** belongs in the same group rather than beside it:
 * it is not a filter laid over a mode, it is a third thing the panel can be
 * doing, and showing it lit while By face also looked lit asked somebody to
 * hold two ideas about one list.
 *
 * **By face is first, because it is where the page opens.** By direction needs
 * a way up held before a click paints anything, and holding one means pressing
 * an arrow — so it cannot be the mode somebody arrives in. A toggle whose
 * pressed button is not the one the eye lands on first reads as though the page
 * started somewhere else and was moved.
 */
const ModeToggle = ({
  mode,
  showingUncut,
  making,
  onMode,
  onMake,
}: {
  mode: PickMode
  /**
   * Whether the uncut list has the panel, in which case none of these is lit.
   *
   * **Not one of the buttons.** It was a fourth here, and it never belonged: the
   * other three answer *how do I want to read the part* and stay answered, while
   * this one is a question about the plan — what is still missing — asked from
   * the coverage bars that measure it, and put down again. Sitting in the toggle
   * it made an exclusive choice out of two different kinds of thing.
   */
  showingUncut: boolean
  /** Whether a reading is being drawn. */
  making: boolean
  onMode: (mode: PickMode) => void
  onMake: () => void
}) => {
  /*
   * One tint for all three, because they are one choice.
   *
   * Unmapped was amber, which is the colour this app uses for a **filter** — a
   * narrowing laid over something else, with a flag saying so. Unmapped is not
   * that: it is the third answer to the question the other two answer, exactly
   * one of them is lit, and giving it its own colour said there were two kinds
   * of thing in a row of three.
   */
  const button = (pressed: boolean, label: string, icon: ReactNode, onClick: () => void) => (
    <button
      key={label}
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`flex items-center gap-1.5 ${panelButtonClass({ pressed })}`}
    >
      {icon}
      {label}
    </button>
  )

  return (
    <div className="flex items-center gap-1" role="group" aria-label="What this list shows">
      {/*
        "By feature", not "by face".
        
        You click a face and you get **features** — every reading that owns it,
        which is the unit the plan is made of and the thing being chosen between.
        The old name described the gesture; this one describes the answer, and
        the answer is what somebody is here for.
      */}
      {button(!showingUncut && !making && mode === 'face', 'By feature', <FeatureIcon />, () =>
        onMode('face'),
      )}
      {button(
        !showingUncut && !making && mode === 'direction',
        'By direction',
        <DirectionIcon />,
        () => onMode('direction'),
      )}
      {/* The one that adds to the part rather than reading it. */}
      {button(making, 'Create', <CreateIcon />, onMake)}
    </div>
  )
}

const Hint = ({ children }: { children: ReactNode }) => (
  <p className="px-1 py-3 text-2xs leading-4 text-ink-dim">{children}</p>
)

/**
 * What this panel can do, shown whenever it has nothing else to say.
 *
 * The same guide in every mode, rather than one line about the mode somebody
 * happens to be in. With nothing picked there is nothing to report, so the
 * space is worth the instruction — and the instruction people need is *which of
 * these three am I meant to be in*, which a hint about the current one cannot
 * answer. The mode being read is marked, so it is still a guide to where you
 * are as well as where else you could be.
 *
 * `Create` is deliberately quiet. It draws a reading the Engine never reported,
 * which is a real answer on a part it misread and the wrong answer nearly
 * everywhere else — a row of three equal offers reads as three equal roads.
 */
const PanelGuide = ({ mode }: { mode: PickMode }) => {
  const rows = [
    {
      key: 'face' as PickMode,
      icon: <FeatureIcon />,
      name: 'By feature',
      note: 'Click a face on the part to see every feature it is part of. Press R, F or Both on one to map it.',
    },
    {
      key: 'direction' as PickMode,
      icon: <DirectionIcon />,
      name: 'By direction',
      note: 'Click a candidate direction arrow, then select faces to list and map everything reachable from it.',
    },
  ]

  return (
    <div className="flex flex-col gap-2 px-1 py-3 text-2xs leading-4 text-ink-dim">
      {rows.map((row) => (
        <p key={row.key} className="flex gap-1.5">
          <span className={`mt-px shrink-0 ${row.key === mode ? 'text-info' : 'text-ink-faint'}`}>
            {row.icon}
          </span>
          <span>
            <span className={`font-semibold ${row.key === mode ? 'text-info' : 'text-ink-body'}`}>
              {row.name}
            </span>{' '}
            — {row.note}
          </span>
        </p>
      ))}

      {/*
        How to change what a feature *is*, which is the thing nobody finds.
        
        The pencil is on every row and opens that reading's faces; the part then
        becomes the control, and a click puts a face in or takes it out. It went
        unmentioned because there was nowhere to mention it — a row is not a
        place for a sentence about rows.
      */}
      <p className="mt-1 border-t border-edge pt-2 text-ink-faint">
        Press the pencil on any row to edit that feature: its faces open below, and clicking a face
        on the part adds it or takes it out.
      </p>

      <p className="text-ink-faint">
        <span className="font-semibold text-ink-dim">Create</span> draws a feature the Engine did
        not report. Rarely needed — try the two above first.
      </p>
    </div>
  )
}

/*
 * Both of these live at module scope on purpose.
 *
 * Defined inside `MapFeaturesPanel` they were a *new component type on every
 * render*, so React unmounted and remounted every row whenever anything
 * changed — and arrowing onto a row reads it, which changes something. Focus
 * was destroyed by the very act of moving it, and the keyboard did nothing at
 * all. Nothing in the types or the tests says so; it only shows up in use.
 */

/**
 * The head of a direction group — and a control, not a caption.
 *
 * Pressing it lights everything that way up would cut of what is in hand, so
 * "what does −Y get me here" is one press rather than reading a column of
 * chips. The pass buttons beside it act on the whole group, and are judged
 * **across** it: where every reading is already roughed there, pressing Rough
 * takes them all off; where some are not, it puts the rest on. Deciding it
 * reading by reading would make one press both assign and unassign.
 */
const GroupHeader = ({
  index,
  label,
  readings,
  trailing,
  plan,
  claims,
  directions,
  highlighted,
  onHighlightDirection,
  onSetPass,
}: {
  index: number
  label: string
  readings: ReadonlyArray<PartFeature>
  trailing?: string
  plan: SetupPlan
  claims: LockedClaims
  directions: ReadonlyArray<Vec3>
  highlighted: number | null
  onHighlightDirection: (index: number, tags: ReadonlyArray<string>) => void
  onSetPass: (features: ReadonlyArray<PartFeature>, passes: ReadonlyArray<Pass>) => void
}) => {
  const state = (pass: Pass) =>
    groupCutState(
      plan,
      readings,
      pass,
      readings[0] ? setupForReading(plan, directions, readings[0]) : null,
    )
  const allRough = state('rough')
  const allFinish = state('finish')
  const tags = readings.map((feature) => feature.featureTag)

  return (
    <header className="flex items-center gap-2 border-b border-edge pb-0.5">
      <button
        type="button"
        /*
         * A way up is a row like any other.
         *
         * Without `data-row` the keyboard walked into a group header and
         * stopped — `moveThroughList` finds rows in the DOM and a header was
         * not one, so arrowing down a list of directions dead-ended at the
         * first. Now the walk runs header, its readings, next header, and
         * landing on a header lights everything that way up would cut, exactly
         * as clicking it does.
         */
        {...rowAttributes(`direction-${String(index)}`)}
        aria-pressed={highlighted === index}
        title={`Light everything ${label} would cut here`}
        onFocus={() => onHighlightDirection(index, tags)}
        onClick={() => onHighlightDirection(index, tags)}
        className={`flex min-w-0 flex-1 items-center gap-2 rounded text-left transition ${
          highlighted === index ? 'text-info' : 'text-ink-strong hover:text-ink'
        }`}
      >
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full"
          style={{ background: directionCss(index) }}
        />
        <span className="flex-1 text-2xs font-semibold">{label}</span>
        <span className="text-2xs tabular-nums text-ink-dim">{trailing ?? readings.length}</span>
      </button>
      <PassButtons
        label={`${label}, all ${String(readings.length)}`}
        rough={allRough}
        finish={allFinish}
        onSetPass={(passes) => onSetPass(readings, passes)}
        blockedBy={(passes) => blockedBy(claims, readings, passes)?.name ?? null}
      />
    </header>
  )
}

/**
 * One hole inside an opened group.
 *
 * The rows the group stands for, and the reason a group opens at all: sixteen
 * identical holes are one decision until somebody wants a different one for the
 * fourteenth. So each carries its own two presses, reads on its own, and lights
 * on its own — `alone`, which is what stops the part answering "this one" by
 * lighting the other fifteen.
 *
 * It says the tag rather than the type: the type is on the row above and the
 * same for all of them, and the last six of the tag is the only thing that
 * tells two of these apart.
 */
const HoleRow = ({
  hole,
  label,
  plan,
  claims,
  directions,
  scores,
  focusedTag,
  onChoose,
  onSetPass,
  onHover,
}: {
  hole: PartFeature
  label: string
  plan: SetupPlan
  claims: LockedClaims
  directions: ReadonlyArray<Vec3>
  scores: ReadonlyMap<string, FeatureScore>
  focusedTag: string | null
  onChoose: (featureTag: string, alone: boolean) => void
  onSetPass: (features: ReadonlyArray<PartFeature>, passes: ReadonlyArray<Pass>) => void
  onHover: (tags: Array<string>) => void
}) => {
  const setup = setupForReading(plan, directions, hole)
  const isFocused = hole.featureTag === focusedTag

  return (
    <li
      className={`flex items-center gap-1 rounded pr-1 ${
        isFocused ? 'bg-info/15' : 'hover:bg-ground/40'
      }`}
      onMouseEnter={() => onHover([hole.featureTag])}
      onMouseLeave={() => onHover([])}
    >
      <button
        type="button"
        {...rowAttributes(hole.featureTag)}
        aria-pressed={isFocused}
        title={`Read this hole on its own — ${hole.featureTag}`}
        onFocus={() => onChoose(hole.featureTag, true)}
        onBlur={() => onHover([])}
        onClick={() => onChoose(hole.featureTag, true)}
        className={`flex min-w-0 flex-1 items-center gap-2 rounded-r py-0.5 pl-6 pr-1 text-left text-2xs transition ${
          isFocused ? 'text-info' : 'text-ink-dim'
        }`}
      >
        <span className="flex-1 truncate font-mono">{hole.featureTag.slice(-6)}</span>
        <span className="shrink-0">{hole.regionIdxs.length}f</span>
        <ScoreBadge score={scores.get(hole.featureTag)} />
      </button>
      <PassButtons
        label={label}
        rough={cutState(plan, hole, 'rough', setup)}
        finish={cutState(plan, hole, 'finish', setup)}
        onSetPass={(passes) => onSetPass([hole], passes)}
        blockedBy={(passes) => blockedBy(claims, [hole], passes)?.name ?? null}
      />
    </li>
  )
}

/**
 * One reading, wherever it is being read — and, where it is a hole, the whole
 * group of identical holes it stands for.
 *
 * **The group is always the row.** Sixteen holes of one diameter, one depth and
 * one way up are one tool and one operation, so the first thing offered is the
 * decision somebody almost always wants: all of them, in one press. Listing
 * them apart is sixteen rows read to discover they are the same row.
 *
 * **And it opens.** "Which sixteen" is a fair question, and so is "all but that
 * one" — a hole under a boss, one that has to be reamed. A group that cannot be
 * opened answers both by making somebody click every hole on the part.
 */
/**
 * Where the ground a reading covers is **already being cut** — as a dot.
 *
 * In By direction the rows are alternatives for one surface, so pressing R or F
 * on a row whose ground another reading holds is **moving work**, not placing
 * it. The row said nothing about that.
 *
 * **A dot in the holder's own colour**, not its name. Two reasons, and the
 * second is the one that decided it:
 *
 * - The direction cycle is already the app's word for "which way up" — on the
 *   arrow, on the row, on the faces it cuts — so a dot says it in the language
 *   already being taught, and costs eight pixels.
 * - A name does not fit. A way up somebody set by hand reads
 *   `(-0.71, 0.71, 0.00)`, and two of those on a row is more text than the row
 *   itself.
 *
 * **One dot when both passes agree**, which is nearly always. Two, marked R and
 * F, only when they genuinely differ — the case worth the extra width, since a
 * surface roughed one way and finished another costs a second setup. The words
 * are in the title.
 *
 * Not shown in By feature: the R and F buttons there already say where each
 * pass is, and this would repeat it.
 */
const ElsewhereFlag = ({
  directions,
  feature,
  plan,
  report,
}: {
  directions: ReadonlyArray<Vec3>
  feature: PartFeature
  plan: SetupPlan
  report: FacePart
}) => {
  const homes = PASSES.map((pass) => {
    const holder = cutElsewhere(report, plan, feature, pass)[0]
    if (!holder) {
      return { pass, index: null, label: null }
    }

    const setup = plan.setups.find((entry) => entry.id === plan.assigned[holder.featureTag]?.[pass])
    const direction = setup ? directionOf(setup, directions) : null

    return {
      pass,
      index: setup?.directionIndex ?? null,
      label: direction ? directionLabel(direction) : (setup?.name ?? null),
    }
  })

  const [rough, finish] = homes
  if (rough?.label === null && finish?.label === null) {
    return null
  }

  const together = rough?.label !== null && rough?.label === finish?.label
  const dot = (index: number | null) => (
    <span
      aria-hidden="true"
      className="size-2 shrink-0 rounded-full ring-1 ring-ground"
      style={{ background: index === null ? '#71717a' : directionCss(index) }}
    />
  )

  /*
   * The whole of it in words, for the tooltip and for anything not reading
   * colour. The dots are the fast answer; this is the one that can be searched,
   * read aloud, and asserted on.
   */
  const said = together
    ? `Already roughed and finished from ${String(rough?.label)} — pressing this moves it`
    : homes
        .map(
          ({ pass, label }) =>
            `${pass === 'rough' ? 'Roughed' : 'Finished'} ${label === null ? 'nowhere yet' : `from ${label}`}`,
        )
        .join(', ')

  return (
    <span className="flex shrink-0 items-center gap-1" title={said}>
      <span className="sr-only">{said}</span>
      {together ? (
        dot(rough?.index ?? null)
      ) : (
        <>
          {homes.map(({ pass, label, index }) =>
            label === null ? null : (
              <span key={pass} className="flex items-center gap-0.5">
                <span className="text-2xs font-semibold text-ink-dim">
                  {pass === 'rough' ? 'R' : 'F'}
                </span>
                {dot(index)}
              </span>
            ),
          )}
        </>
      )}
    </span>
  )
}

/**
 * One uncut face in a sentence — the row's name and its tooltip both.
 *
 * Two readings of the same row: the columns are what the eye scans down, and
 * this is what anything taking it a word at a time gets. Written once so they
 * cannot come to say different things.
 */
const faceSaid = (face: UncutFace, unit: Unit): string => {
  const reach =
    face.from.length === 0
      ? 'no way up reaches it — a gap in the analysis, not in the plan'
      : `${String(face.from.length)} ${face.from.length === 1 ? 'way up' : 'ways up'} could take it`

  return `Face ${String(face.idx)}, ${face.shape}, ${formatArea(face.area, unit)}, ${reach}`
}

const Reading = ({
  feature,
  report,
  flagElsewhere = false,
  siblings = [],
  open = false,
  onToggle,
  unit,
  label,
  inOffer = false,
  trailing,
  plan,
  claims,
  showingPass,
  directions,
  scores,
  focusedTag,
  handed = false,
  onChoose,
  onSetPass,
  onShowFaces,
  onHover,
}: {
  feature: PartFeature
  /** The part, so a row can say where its ground is already cut. */
  report: FacePart
  /**
   * Whether to mark ground another reading already holds.
   *
   * On in By direction, where the rows are alternatives for one surface and a
   * press moves work rather than placing it. Off in By feature, where the R and
   * F buttons already say where each pass is and this would repeat it.
   */
  flagElsewhere?: boolean
  /**
   * Identical holes this row stands for — same diameter, same depth, same way
   * up. One decision and one tool, so one row and one press.
   */
  siblings?: ReadonlyArray<PartFeature>
  /** Whether the group is showing its holes one at a time. */
  open?: boolean
  /** Opens or closes it, by the row's own name. Absent means it cannot open. */
  onToggle?: (key: string) => void
  unit: Unit
  label: string
  inOffer?: boolean
  /** Anything that acts on this row from outside — the offer's prune, so far. */
  trailing?: ReactNode
  /**
   * Whether this reading holds the picked face **by hand** rather than by
   * report.
   *
   * Marked, because an unmarked row would read as the Engine's own answer —
   * which is the one thing it is not.
   */
  handed?: boolean
  plan: SetupPlan
  claims: LockedClaims
  /** Which pass the row's face count is reading. */
  showingPass: Pass
  directions: ReadonlyArray<Vec3>
  scores: ReadonlyMap<string, FeatureScore>
  focusedTag: string | null
  onChoose: (featureTag: string, alone: boolean) => void
  onSetPass: (features: ReadonlyArray<PartFeature>, passes: ReadonlyArray<Pass>) => void
  /** Open this reading's faces, in place of the datasheet. */
  onShowFaces: (featureTag: string) => void
  onHover: (tags: Array<string>) => void
}) => {
  const setup = setupForReading(plan, directions, feature)
  const group = siblings.length > 0 ? siblings : [feature]
  const grouped = group.length > 1
  const tags = group.map((hole) => hole.featureTag)
  /*
   * A group reads as the one being read whichever of its holes is.
   *
   * The row is not the first hole, it is all sixteen — so a click on the part
   * that landed on the ninth still lights the row that stands for it. Without
   * this, clicking a hole highlighted nothing in the list that named it.
   */
  const isFocused = focusedTag !== null && tags.includes(focusedTag)
  const diameter = grouped ? holeDiameter(feature) : null
  /*
   * What this row covers and what it is actually cutting, summed over the group
   * — sixteen identical holes are one row, and the count is about all of them.
   *
   * A reading keeps the rest of itself when another claims one of its faces, so
   * "assigned" stopped meaning "all of it". The count is the only place that
   * shows, and a row silently cutting two of its three faces is the plan
   * disagreeing with the list about what it holds.
   */
  const { faces, cut } = group.reduce(
    (total, hole) => {
      const each = faceCounts(plan, hole)
      return { faces: total.faces + each.faces, cut: total.cut + each.cut }
    },
    { faces: 0, cut: 0 },
  )

  /*
   * The setup that has settled this reading, if one has.
   *
   * Read from the first of the group: identical holes are one row and are
   * mapped together, so they settle together — a group half-settled would
   * already be a bug somewhere else, and drawing it per hole would say the row
   * can be part-pressed when the press acts on all of them.
   */
  const settled = settledSetup(plan, feature.featureTag)

  return (
    <>
      <li
        /*
         * Green while it is the one being read, against the offer's violet.
         * "This is the one I mean, and those are the ones that came with it" is
         * the question somebody is asking while pruning, and one colour cannot
         * answer it.
         */
        className={`flex items-center gap-1 rounded pr-1 ${
          isFocused ? (inOffer ? 'bg-success/20' : 'bg-info/15') : 'hover:bg-ground/40'
        }`}
        onMouseEnter={() => onHover(tags)}
        // Paired with the enter above. Left unpaired, the part keeps a face lit
        // for a row the pointer left long ago.
        onMouseLeave={() => onHover([])}
      >
        {grouped && onToggle ? (
          <button
            type="button"
            aria-expanded={open}
            aria-label={
              open
                ? `Hide these ${String(group.length)} holes`
                : `Show these ${String(group.length)} holes`
            }
            title={open ? 'Hide these holes' : 'Show these holes'}
            onClick={() => onToggle(feature.featureTag)}
            className="w-3 shrink-0 text-2xs text-ink-dim transition hover:text-ink-strong"
          >
            {open ? '▾' : '▸'}
          </button>
        ) : null}
        <button
          type="button"
          /*
           * What the row would assign, for the keys handled at the window.
           *
           * R on a row that stands for sixteen holes has to mean sixteen, and
           * the handler only ever sees the DOM — so the row says what it means
           * rather than leaving it to be guessed from the part. Named here, not
           * re-derived there: the two lists group by different rules (see
           * `groupAcrossPart`), and a handler working it out again would use the
           * wrong one in one of them.
           *
           * `rowAttributes` writes the group only where there is one, so an
           * ungrouped row says nothing and reads back as standing for itself.
           */
          {...rowAttributes(feature.featureTag, grouped ? tags : undefined)}
          aria-pressed={isFocused}
          // The row under the keyboard is the target (§4g). Arrowing onto one
          // reads it, rather than moving a highlight that then has to be pressed
          // — two gestures for one question.
          onFocus={() => onChoose(feature.featureTag, false)}
          onBlur={() => onHover([])}
          onClick={() => onChoose(feature.featureTag, false)}
          className={`flex min-w-0 flex-1 items-center gap-2 rounded-r px-1 py-1 text-left text-2xs transition ${
            isFocused ? 'text-info' : 'text-ink-muted'
          } ${grouped && onToggle ? '' : 'ml-3'}`}
        >
          <span className="shrink-0 text-ink-dim">
            <KindIcon featureType={feature.featureType} kind="Other" />
          </span>
          {/* The count sits against the name, not out at the end of the row:
              "Blind holes ×16" is one phrase, and pushing the number past the
              tool and the face count leaves the name reading as a singular. */}
          <span className="flex min-w-0 flex-1 items-center gap-1.5">
            <span className="truncate">
              {grouped
                ? pluralLabel(typeLabel(feature.featureType))
                : typeLabel(feature.featureType)}
            </span>
            {grouped ? (
              <span
                className="shrink-0 rounded bg-raised px-1 text-2xs font-semibold text-ink-body"
                title={`${String(group.length)} identical holes — same diameter, depth and way up`}
              >
                ×{group.length}
              </span>
            ) : null}
            {isMade(feature) ? (
              // Somebody drew this. A plan is a document a shop is asked to
              // trust, and "the Engine found this" is not the same claim.
              <span
                className="shrink-0 rounded bg-proposed/20 px-1 text-2xs font-semibold text-proposed"
                title="Made here — the Engine did not report this reading"
              >
                made
              </span>
            ) : null}
          </span>
          {diameter === null ? null : (
            // The tool, because it is the only thing that tells two groups of
            // the same type apart in a list.
            <span className="shrink-0 tabular-nums text-ink-dim">
              ⌀ {formatLength(diameter, unit)}
            </span>
          )}
          {/* No direction chip: every list here is grouped by way up, and the
              header already says which. */}
          <ScoreBadge score={scores.get(feature.featureTag)} />
        </button>
        {/*
          Outside the row itself, which is pinned to read the same wherever a
          reading is drawn. It earns its place on a face this reading was
          **given**: the Engine never reported the face here, so an unmarked row
          would claim it did.
        */}
        {/*
          Where this reading is **already cut**, when it is not here.
          
          By direction lists what one way up could take, and a row in it may
          already be mapped to a different one — so pressing R or F on it is
          moving work rather than placing it. The row said nothing about that,
          and the same list the face editor shows per face is the answer per
          reading: which way up holds each pass.
        */}
        {flagElsewhere ? (
          <ElsewhereFlag directions={directions} feature={feature} plan={plan} report={report} />
        ) : null}
        {handed ? (
          <span
            className="shrink-0 rounded bg-proposed/20 px-1 text-2xs font-semibold text-proposed"
            title="This face was added to this reading by hand — the Engine did not report it here"
          >
            added
          </span>
        ) : null}
        {/*
         * Settled, and said so on the row rather than only when a press fails.
         *
         * By direction lists readings a *different* way up may already hold,
         * and pressing R there is moving work — so a row whose setup somebody
         * has settled has to carry that before the press, not after it. The
         * setup is named because "this is locked" leaves somebody hunting for
         * which lock to open.
         */}
        {settled ? (
          <span
            className="flex shrink-0 items-center gap-0.5 rounded bg-info/15 px-1 py-0.5 text-2xs font-semibold text-info"
            title={`Settled in ${settled.name}. Unlock that setup to change what it cuts.`}
          >
            <LockIcon aria-hidden="true" className="size-2.5" />
            <span className="max-w-16 truncate">{settled.name}</span>
          </span>
        ) : null}
        <FaceCount faces={faces} cut={cut} onShow={() => onShowFaces(feature.featureTag)} />
        <PassButtons
          label={label}
          rough={groupCutState(plan, group, 'rough', setup)}
          finish={groupCutState(plan, group, 'finish', setup)}
          onSetPass={(passes) => onSetPass(group, passes)}
          blockedBy={(passes) => blockedBy(claims, group, passes)?.name ?? null}
        />
        {trailing}
      </li>
      {grouped && open
        ? group.map((hole) => (
            <HoleRow
              claims={claims}
              key={hole.featureTag}
              hole={hole}
              label={label}
              plan={plan}
              directions={directions}
              scores={scores}
              focusedTag={focusedTag}
              onChoose={onChoose}
              onSetPass={onSetPass}
              onHover={onHover}
            />
          ))
        : null}
    </>
  )
}

const MapFeaturesPanelView = ({
  candidates,
  mode,
  painted,
  holding,
  focusedTag,
  faces,
  highlighted,
  showingUncut,
  uncut,
  onPickFace,
  making,
  handedTags,
  types,
  touching,
  onHoverFace,
  justMade,
  onAgain,
  onDeleteMade,
  onCutMadeFrom,
  activeDirection,
  onMake,
  onDraft,
  onConfirmMade,
  onLetGo,
  proposal,
  proposed,
  onInfer,
  onPrune,
  onDiscard,
  onMode,
  onChoose,
  onSetPass,
  onShowFaces,
  onHighlightDirection,
  onHover,
}: {
  /** The readings owning every picked face, ranked — by-face mode's whole job. */
  candidates: ReadonlyArray<PartFeature>
  mode: PickMode
  painted: ReadonlySet<number>
  holding: number | null
  focusedTag: string | null
  /** How many faces are held, so a narrowed list can say what narrowed it. */
  faces: number
  /** The way up whose readings are lit on the part, if one was named. */
  highlighted: number | null
  /** Whether the list is showing everything nothing cuts. */
  showingUncut: boolean
  /**
   * The **faces** nothing cuts, for when it is.
   *
   * Faces rather than readings, which is the whole point of the list: a reading
   * is one of five to eight alternatives for the same ground, so most are
   * unassigned on a finished part, and a feature can read as unmapped while
   * every face it covers is already cut by somebody else. Neither is a gap.
   */
  uncut: ReadonlyArray<UncutFace>
  /** Pick one from the list — the same act as clicking it on the part. */
  onPickFace: (region: number) => void
  /** The reading being drawn, if one is. */
  making: Draft | null
  /**
   * Readings holding one of the picked faces **by hand** rather than by report.
   *
   * The viewer answers "what owns this face" from the Engine's `regionIdxs`, so
   * a reading given a face has to be named separately or it does not appear in
   * that face's list at all — while being the one cutting it.
   */
  handedTags: ReadonlySet<string>
  /** The types this part has, so a made reading is named like the rest. */
  types: ReadonlyArray<string>
  /** Which faces touch which, for chaining and continuity while drawing. */
  touching: Touching
  /** Light one chosen face on the part on its own, while drawing. */
  onHoverFace: (region: number | null) => void
  /** The reading just created, waiting to be mapped. */
  justMade: PartFeature | null
  /** Put it down and start another. */
  onAgain: () => void
  /** Take the one just made off the part again. */
  onDeleteMade: (featureTag: string) => void
  /** Point a made reading at another candidate way up, and re-read it there. */
  onCutMadeFrom: (featureTag: string, direction: number) => void
  /**
   * The way up being held, if one is — pressed on the part or named in the
   * summary. It already scopes what a click on the part can resolve to, and it
   * scopes this list for the same reason: one way up held is one question.
   */
  activeDirection: number | null
  /** Start drawing a reading, or put the one being drawn down. */
  onMake: () => void
  onDraft: (draft: Draft) => void
  onConfirmMade: () => void
  /** Stop working the way up being held. */
  onLetGo: () => void
  /** A standing offer, if the app has been asked for one. */
  proposal: Proposal | null
  /** What that offer currently amounts to. */
  proposed: ReadonlyArray<PartFeature>
  onInfer: (kind: Infer) => void
  /** Takes a whole row out of the offer — a group of identical holes included. */
  onPrune: (readings: ReadonlyArray<PartFeature>) => void
  onDiscard: () => void
  onMode: (mode: PickMode) => void
  /** `alone` is true only for a hole named from inside its own opened group. */
  onChoose: (featureTag: string, alone: boolean) => void
  /** Light every reading of one way up, from the faces in hand. */
  onHighlightDirection: (index: number, tags: ReadonlyArray<string>) => void
  onSetPass: (features: ReadonlyArray<PartFeature>, passes: ReadonlyArray<Pass>) => void
  /** Open a reading's faces, in place of the datasheet. */
  onShowFaces: (featureTag: string) => void
  onHover: (tags: Array<string>) => void
}) => {
  const { directions, features, plan, scores, unit, report, showingPass } = usePartView()
  /*
   * What the locks hold, worked out once for the whole panel.
   *
   * Every row asks whether its press would be refused, and the answer is the
   * same walk over every feature on the part each time. Done per row it is the
   * list's own N+1; done here it is one pass, and the rows read it.
   */
  const claims = useMemo(() => lockedClaims(plan, features), [plan, features])

  /*
   * One way up, not four.
   *
   * The picker offers every direction that reaches the painted set. That is the
   * right shape for its inference, and the wrong one here: holding a direction
   * *is* the choice, and answering "which of these four?" after somebody has
   * already pointed at one asks them to make it twice. So this shows what the
   * held way up would cut of what is painted, and nothing else.
   */
  const offers = offersFor(directions, features, painted)
  const heldOffer = offers.find((offer) => offer.index === holding) ?? null
  const holdingLabel =
    holding === null ? '' : directionLabel(directions[holding] ?? { x: 0, y: 0, z: 0 })

  /*
   * Which hole groups are showing their holes.
   *
   * Held by the panel rather than by each row, so Right and Left can open and
   * close one from the keyboard — the job `moveThroughList` was given a group
   * hook for. Keyed by the row's own name, so a list that refills simply
   * forgets: the keys are tags, and a tag that is no longer on screen closes
   * nothing.
   */
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set())

  /**
   * Which uncut face is showing what could cut it.
   *
   * One at a time, unlike the hole groups above: a face opens onto four to
   * eight readings, and two open at once is a column nobody can hold the shape
   * of. Closing is the same press that opened it.
   */
  const [openFace, setOpenFace] = useState<number | null>(null)
  const openGroup = (key: string) =>
    setOpened((current) => {
      const next = new Set(current)
      if (!next.delete(key)) {
        next.add(key)
      }
      return next
    })
  /*
   * Two kinds of openable row live in the uncut list — a face, and a hole group
   * under it — so Right and Left have to know which one they are on. The face
   * rows are named by index and nothing else in these lists is, which is what
   * tells them apart.
   */
  const isFaceRow = (key: string) => showingUncut && uncut.some((face) => String(face.idx) === key)

  const listKeys = {
    onOpen: (key: string) => {
      if (isFaceRow(key)) {
        setOpenFace(Number(key))
        return
      }
      if (!opened.has(key)) {
        openGroup(key)
      }
    },
    onClose: (key: string) => {
      if (isFaceRow(key)) {
        setOpenFace(null)
        return
      }
      setOpened(new Set())
    },
  }

  /**
   * The rows of one direction group, with every hole standing for its group.
   *
   * `across` is the whole difference between the lists: the candidates are what
   * a click found, so a hole there means every identical hole on the part
   * (`groupAcrossPart`). A list about a *set* — the painted faces, or what
   * nothing cuts — means those readings and no others, so it groups only within
   * itself. Getting that backwards would offer holes nobody painted.
   */
  const holeGroups = (readings: ReadonlyArray<PartFeature>, across: boolean) =>
    across ? groupAcrossPart(features, readings) : groupHoles(readings)

  const activeLabel =
    activeDirection === null
      ? ''
      : directionLabel(directions[activeDirection] ?? { x: 0, y: 0, z: 0 })

  /*
   * What is left, narrowed to the way up being held.
   *
   * Pressing an arrow already scopes what a click on the part can resolve to;
   * this is the same rule reaching the one list that was ignoring it. "What is
   * not cut" and "what is not cut **from here**" are the two questions somebody
   * planning asks, and the second was only answerable by reading past five
   * groups to find the sixth.
   *
   * **No flag here.** The viewport already carries one, with its own Clear, and
   * for a stated reason: a filter switched on from the part has to be visible on
   * the part and clearable from there. A second copy in this panel is one state
   * claimed by two places, which is how they come to disagree.
   */
  const uncutHere = uncut.filter(
    (face) => activeDirection === null || face.from.includes(activeDirection),
  )

  /**
   * The head of a direction group — and a control, not a caption.
   *
   * Pressing it lights everything that way up would cut of what is in hand, so
   * "what does −Y get me here" is one press rather than reading a column of
   * chips. The pass buttons beside it act on the whole group, and are judged
   * **across** it: where every reading is already roughed there, pressing Rough
   * takes them all off; where some are not, it puts the rest on. Deciding it
   * reading by reading would make one press both assign and unassign.
   */
  return (
    <section className="border-b border-edge bg-ground px-3 py-2 text-xs">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-2xs font-bold uppercase tracking-wider text-ink-muted">Map features</h2>
      </header>

      {/*
        The modes sit under the title rather than beside it: what a click will
        mean is the first thing to decide here, and it was reading as a setting
        tucked in a corner.
      */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <ModeToggle
          mode={mode}
          showingUncut={showingUncut}
          making={making !== null || justMade !== null}
          onMode={onMode}
          onMake={onMake}
        />
        {holding === null || showingUncut ? null : (
          /*
           * The way up being worked, and how to stop working it. Pressing its
           * arrow again lets go too, but that is a gesture on the part for a
           * state the panel is showing.
           */
          <span className="flex items-center gap-1 rounded border border-info/40 bg-info/10 py-0.5 pl-1.5 text-2xs text-info">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full"
              style={{ background: directionCss(holding) }}
            />
            Holding {holdingLabel}
            <button
              type="button"
              aria-label={`Let go of ${holdingLabel}`}
              title={`Let go of ${holdingLabel}`}
              onClick={onLetGo}
              className="px-1.5 font-bold text-info/70 transition hover:text-info"
            >
              ✕
            </button>
          </span>
        )}
      </div>

      {/*
        Nothing is inferred until one of these is pressed, and nothing is
        assigned until R, F or Both is pressed on a row. Both halves were
        violated by earlier builds and both were reported as bugs in almost
        those words.
      */}
      {mode === 'direction' && holding !== null ? (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {INFER_SCOPES.map((scope) => (
            <button
              key={scope.kind}
              type="button"
              title={scope.note}
              disabled={proposal !== null}
              onClick={() => onInfer(scope.kind)}
              className={panelButtonClass()}
            >
              {scope.name}
            </button>
          ))}
        </div>
      ) : null}

      {proposal ? (
        <section className="mt-2 rounded border border-proposed/50 bg-proposed/10 p-1.5">
          <header className="flex items-center gap-2">
            <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-proposed" />
            <span className="flex-1 text-2xs font-semibold text-proposed">
              Proposed · {proposed.length} · {proposal.faces.size} faces
            </span>
            <PassButtons
              label="the whole offer"
              rough={false}
              finish={false}
              onSetPass={(passes) => onSetPass(proposed, passes)}
              blockedBy={(passes) => blockedBy(claims, proposed, passes)?.name ?? null}
            />
            <button
              type="button"
              onClick={onDiscard}
              className={panelButtonClass({ tone: 'danger' })}
            >
              Discard
            </button>
          </header>
          {/* Nothing here has changed anything. Pressing a pass on a reading is
              what says yes to it — there is no separate Confirm. */}
          {/*
            R, F, B assign the row under the keyboard; X prunes it and the
            keyboard keeps its place, so pruning thirty readings is thirty
            presses rather than thirty clicks to get the keyboard back.
          */}
          <ul
            className="mt-1"
            {...keynavAttributes('offer')}
            onKeyDown={(event) => {
              // Arrows only. R, F, A/B, X and Delete are handled once at the
              // window, because the row under the keyboard is the target
              // wherever the keyboard happens to be — two handlers for one
              // keystroke is two things happening per press.
              moveThroughList(event, listKeys)
            }}
          >
            {holeGroups(proposed, false).map((holes) => (
              <Reading
                claims={claims}
                flagElsewhere
                key={holes.key}
                feature={holes.holes[0]!}
                report={report}
                siblings={holes.holes}
                open={opened.has(holes.holes[0]!.featureTag)}
                onToggle={openGroup}
                unit={unit}
                showingPass={showingPass}
                label={holdingLabel}
                inOffer
                trailing={
                  <button
                    type="button"
                    aria-label={`Remove ${
                      holes.holes.length > 1
                        ? pluralLabel(typeLabel(holes.holes[0]!.featureType))
                        : typeLabel(holes.holes[0]!.featureType)
                    } from the offer`}
                    // Prunes the row, which is the group: an offer of sixteen
                    // identical holes is one suggestion to say no to.
                    onClick={() => onPrune(holes.holes)}
                    className="shrink-0 rounded px-1 text-2xs font-bold text-ink-dim transition hover:text-danger"
                  >
                    ✕
                  </button>
                }
                plan={plan}
                directions={directions}
                scores={scores}
                focusedTag={focusedTag}
                onChoose={onChoose}
                onSetPass={onSetPass}
                onShowFaces={onShowFaces}
                onHover={onHover}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {/*
        Everything nothing cuts, grouped by way up like every other list here —
        and assignable from where it is found, because a list that only tells
        you what is missing makes you go and find it again.
      */}
      {/*
        Drawing a reading replaces the lists rather than sitting beside them:
        every one of them is a way of reading the part, and this is a way of
        adding to it. Both at once would be two questions in one panel.
      */}
      {/*
        Shown while a reading is being drawn **or** just after one was made —
        the draft is put down the moment it becomes a feature, and gating on it
        alone meant the panel vanished at exactly the point it had something to
        say.
      */}
      {making !== null || justMade !== null ? (
        <CreateFeature
          draft={making ?? EMPTY_DRAFT}
          touching={touching}
          types={types}
          made={justMade}
          onSetPass={(feature, passes) => onSetPass([feature], passes)}
          onAgain={onAgain}
          onDone={onMake}
          onDelete={onDeleteMade}
          onCutFrom={onCutMadeFrom}
          onDraft={onDraft}
          onChoose={(featureTag) => onChoose(featureTag, false)}
          onHover={onHover}
          onHoverFace={onHoverFace}
          onConfirm={onConfirmMade}
          onDiscard={onMake}
        />
      ) : showingUncut ? (
        uncut.length === 0 ? (
          <Hint>Every face the Engine found a reading for is cut.</Hint>
        ) : uncutHere.length === 0 ? (
          /* Said rather than shown as an empty list: a way up with nothing left
             uncut is a real answer, and an empty list under a flag reads as a
             bug in the filter. */
          <p className="mt-2 rounded border border-success/40 bg-success/10 px-2 py-1 text-2xs text-success">
            {activeLabel} has nothing left uncut.
          </p>
        ) : (
          <ul
            className="mt-2 flex flex-col"
            {...keynavAttributes('unmapped')}
            onKeyDown={(event) => moveThroughList(event, listKeys)}
          >
            {uncutHere.map((face) => (
              <li key={face.idx}>
                <button
                  type="button"
                  {...rowAttributes(String(face.idx))}
                  /*
                   * Named in words, because the row is columns.
                   *
                   * Read straight, the cells run together into `0planar10.00
                   * mm²` — three facts with nothing between them. The columns
                   * are for the eye scanning down; this is the same row for
                   * anything reading it one at a time, including the tooltip.
                   */
                  aria-label={faceSaid(face, unit)}
                  onFocus={() => onHoverFace(face.idx)}
                  onBlur={() => onHoverFace(null)}
                  onMouseEnter={() => onHoverFace(face.idx)}
                  onMouseLeave={() => onHoverFace(null)}
                  onClick={() => {
                    /*
                     * One gesture, two effects that belong together: the row
                     * opens onto what could cut this face, and the face itself
                     * is picked on the part. Finding the gap and looking at it
                     * are the same act — a row that opened a list of readings
                     * without lighting the face they are about would leave
                     * somebody hunting the part for it.
                     */
                    setOpenFace((current) => (current === face.idx ? null : face.idx))
                    if (openFace !== face.idx) {
                      onPickFace(face.idx)
                    }
                  }}
                  aria-expanded={openFace === face.idx}
                  className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-2xs transition hover:bg-surface"
                  title={faceSaid(face, unit)}
                >
                  <span className="w-10 shrink-0 font-mono tabular-nums text-ink-muted">
                    {face.idx}
                  </span>
                  <span className="flex-1 truncate text-ink-dim">{face.shape}</span>
                  <span className="shrink-0 tabular-nums text-ink-dim">
                    {formatArea(face.area, unit)}
                  </span>
                  {/*
                    Who could take it, in the direction cycle.

                    The one thing the row is for beyond naming the gap: a face
                    two ways up can reach is a choice, and a face nothing
                    reaches is not this list's problem to solve.
                  */}
                  {face.from.length === 0 ? (
                    <span className="shrink-0 rounded bg-raised px-1 font-semibold text-ink-dim">
                      unreached
                    </span>
                  ) : (
                    <span className="flex shrink-0 items-center gap-0.5">
                      {face.from.map((index) => (
                        <span
                          key={index}
                          aria-hidden="true"
                          className="size-2 rounded-full ring-1 ring-ground"
                          style={{ background: directionCss(index) }}
                        />
                      ))}
                    </span>
                  )}
                </button>

                {/*
                  What could cut it, and assignable from here.

                  A list that only says what is missing makes somebody go and
                  find it again: the readings that own this face are the answer
                  to "so cut it how", and they are the same rows By feature
                  shows, with the same pass buttons. Grouped by way up, because
                  that is the first thing being chosen between.
                */}
                {openFace === face.idx ? (
                  face.owners.length === 0 ? (
                    <p className="ml-10 py-1 text-2xs leading-4 text-ink-faint">
                      No reading reaches this face from any way up. Nothing here can place it — it
                      is a gap in the analysis rather than in the plan.
                    </p>
                  ) : (
                    <ul
                      // A scoping hook: the readings under one face, told apart
                      // from the face rows around them.
                      data-owners={String(face.idx)}
                      className="mb-1 ml-10 flex flex-col gap-2 border-l border-edge"
                    >
                      {byDirection(directions, face.owners).map((group) => {
                        const groups = holeGroups(group.readings, true)

                        return (
                          <li key={group.index}>
                            <GroupHeader
                              claims={claims}
                              index={group.index}
                              label={group.label}
                              readings={groups.flatMap((holes) => holes.holes)}
                              plan={plan}
                              directions={directions}
                              highlighted={highlighted}
                              onHighlightDirection={onHighlightDirection}
                              onSetPass={onSetPass}
                            />
                            <ul className="ml-2 border-l border-edge">
                              {groups.map((holes) => (
                                <Reading
                                  claims={claims}
                                  key={holes.key}
                                  feature={holes.holes[0]!}
                                  report={report}
                                  siblings={holes.holes}
                                  open={opened.has(holes.holes[0]!.featureTag)}
                                  onToggle={openGroup}
                                  unit={unit}
                                  showingPass={showingPass}
                                  label={group.label}
                                  plan={plan}
                                  directions={directions}
                                  scores={scores}
                                  focusedTag={focusedTag}
                                  handed={handedTags.has(holes.holes[0]!.featureTag)}
                                  onChoose={onChoose}
                                  onSetPass={onSetPass}
                                  onShowFaces={onShowFaces}
                                  onHover={onHover}
                                />
                              ))}
                            </ul>
                          </li>
                        )
                      })}
                    </ul>
                  )
                ) : null}
              </li>
            ))}
          </ul>
        )
      ) : mode === 'direction' ? (
        holding === null ? (
          <PanelGuide mode="direction" />
        ) : painted.size === 0 ? (
          <Hint>
            {holdingLabel} is held. Click faces on the part to paint them, then choose which way up
            cuts them — or press Infer to be offered everything this way up can reach.
          </Hint>
        ) : (
          <div className="mt-2">
            <p className="mb-1 text-2xs text-ink-dim">
              <span className="font-semibold tabular-nums text-ink-strong">{painted.size}</span>{' '}
              faces painted · what {holdingLabel} cuts of them
            </p>
            {heldOffer === null ? (
              /* Said plainly rather than shown as an empty list: a way up that
                 reaches none of what is painted is an answer, and the next move
                 is to hold a different one. */
              <p className="rounded border border-warning/40 bg-warning/10 px-2 py-1 text-2xs text-warning">
                {holdingLabel} cannot reach any of these faces.
              </p>
            ) : null}
            <ul
              className="flex flex-col gap-2"
              {...keynavAttributes('map')}
              onKeyDown={(event) => moveThroughList(event, listKeys)}
            >
              {(heldOffer ? [heldOffer] : []).map((offer) => (
                <li key={offer.index}>
                  {/* What it would miss is said rather than hidden: a way up
                      that reaches most of a group is a real answer, and
                      pretending otherwise is how a plan loses a face quietly. */}
                  <GroupHeader
                    claims={claims}
                    index={offer.index}
                    label={offer.label}
                    readings={offer.readings}
                    trailing={`${String(offer.covered)} of ${String(painted.size)}${
                      offer.missed > 0 ? ` · misses ${String(offer.missed)}` : ''
                    }`}
                    plan={plan}
                    directions={directions}
                    highlighted={highlighted}
                    onHighlightDirection={onHighlightDirection}
                    onSetPass={onSetPass}
                  />
                  <ul className="ml-2 border-l border-edge">
                    {holeGroups(offer.readings, false).map((holes) => (
                      <Reading
                        claims={claims}
                        key={holes.key}
                        feature={holes.holes[0]!}
                        flagElsewhere
                        report={report}
                        siblings={holes.holes}
                        open={opened.has(holes.holes[0]!.featureTag)}
                        onToggle={openGroup}
                        unit={unit}
                        showingPass={showingPass}
                        label={offer.label}
                        plan={plan}
                        directions={directions}
                        scores={scores}
                        focusedTag={focusedTag}
                        onChoose={onChoose}
                        onSetPass={onSetPass}
                        onShowFaces={onShowFaces}
                        onHover={onHover}
                      />
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        )
      ) : candidates.length === 0 ? (
        <PanelGuide mode="face" />
      ) : (
        <>
          {faces > 1 ? (
            <p className="mt-2 text-2xs text-ink-dim">
              {/* Gathered, not narrowed: the faces do not have to belong to one
                  feature — see `picks.ts`. */}
              Every reading of{' '}
              <span className="font-semibold tabular-nums text-ink-strong">{faces}</span> picked
              faces
            </p>
          ) : null}
          <ul
            className="mt-1 flex flex-col gap-2"
            {...keynavAttributes('map')}
            onKeyDown={(event) => moveThroughList(event, listKeys)}
          >
            {byDirection(directions, candidates).map((group) => {
              /*
               * A hole here means every identical hole on the part.
               *
               * The candidates hold the readings of the *face* that was clicked,
               * so one of sixteen bolt-circle holes arrives alone — while the
               * part lights all sixteen and the datasheet says so. The header
               * counts and presses what the rows below it actually stand for,
               * rather than the one reading the click happened to produce.
               */
              const groups = holeGroups(group.readings, true)
              const readings = groups.flatMap((holes) => holes.holes)

              return (
                <li key={group.index}>
                  <GroupHeader
                    claims={claims}
                    index={group.index}
                    label={group.label}
                    readings={readings}
                    plan={plan}
                    directions={directions}
                    highlighted={highlighted}
                    onHighlightDirection={onHighlightDirection}
                    onSetPass={onSetPass}
                  />
                  <ul className="ml-2 border-l border-edge">
                    {groups.map((holes) => (
                      <Reading
                        claims={claims}
                        key={holes.key}
                        feature={holes.holes[0]!}
                        report={report}
                        siblings={holes.holes}
                        open={opened.has(holes.holes[0]!.featureTag)}
                        onToggle={openGroup}
                        unit={unit}
                        showingPass={showingPass}
                        label={group.label}
                        plan={plan}
                        directions={directions}
                        scores={scores}
                        focusedTag={focusedTag}
                        handed={handedTags.has(holes.holes[0]!.featureTag)}
                        onChoose={onChoose}
                        onSetPass={onSetPass}
                        onShowFaces={onShowFaces}
                        onHover={onHover}
                      />
                    ))}
                  </ul>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </section>
  )
}

/*
 * Memoised. It drives the mapping, so its own inputs move constantly while
 * somebody is mapping — and not at all while they are hovering a face row,
 * dragging a rule threshold, or switching the part's wash, which is what this
 * is here to sit out.
 */
export const MapFeaturesPanel = memo(MapFeaturesPanelView)
