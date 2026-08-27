import { Fragment, useEffect, useState } from 'react'
import type { Vec3 } from '@toolpath/api'
import { Button } from '@toolpath/ui'

import { KindIcon } from './feature-icons'
import { PassButtons } from './pass-buttons'
import { ReadingRow, readingRowClass } from './reading-row'
import { panelButtonClass } from './panel-button'
import { CutFrom } from './cut-from'
import { directionLabel, kindOf } from 'shared/report'
import { typeLabel } from 'shared/part-summary'
import { isMade, readsAs } from 'shared/make-feature'
import { moveThroughList } from 'shared/list-keys'
import { cutElsewhere, facesOf, type FacePart, type FaceRow } from 'shared/faces'
import { settledSetup, setupForReading } from 'shared/plan-actions'
import { FACE_COLORS } from 'shared/selection-colors'
import { PASSES, cutsFace, faceCounts } from 'shared/setups'
import type { Pass, SetupPlan } from 'shared/setups'
import type { PartFeature } from 'shared/contracts'
import type { FeatureScore } from 'shared/feature-score'
import { formatArea, type Unit } from 'shared/units'
import { KEYNAV, ROW, keynavAttributes, rowAttributes } from 'shared/row-nav'
import { usePartView } from './part-view'

/**
 * The faces of one reading, and what else each of them could be.
 *
 * Opened from a face count, and it takes the datasheet's place rather than
 * sitting beside it: both are about the same reading, and a page that showed
 * both would be asking somebody to hold "twelve faces" and "one of them" at
 * once. The count is the way in and the way back.
 *
 * A face is what a plan is made of — it is what gets cut once, what coverage
 * counts, and what a claim takes. Until this panel existed, the only way to
 * argue with a face was to find it on the part and click it.
 */
/**
 * Where each pass of one face is cut, when the two do not agree.
 *
 * **A face missing from a reading is not missing from the part.** Something
 * else took it, from some other way up, and this feature is therefore machined
 * across two setups — a panel saying only "not ticked" leaves somebody to go
 * and find out which, one click at a time.
 *
 * Said **per pass**, because the split is the case worth checking. One feature
 * roughs a face and another finishes it from a different way up; a single
 * answer had to pick one of the two to report, and reported the other as
 * silence. *Roughed here, finished from −Z* is one line and needs both.
 *
 * Nothing is drawn where there is nothing to say — this reading cuts the face
 * in both passes, or the face is simply not cut and the row says so already.
 */
const FaceHomes = ({ feature, row }: { feature: PartFeature; row: FaceRow }) => {
  const homes = PASSES.map((pass) => ({ pass, cutBy: row.cutBy[pass] }))
  const split = homes.some(({ cutBy }) => cutBy !== null && cutBy.featureTag !== feature.featureTag)

  if (!split) {
    // Not cut in either pass by anything: the honest answer, and a different
    // one from "cut, but somewhere else".
    if (homes.every(({ cutBy }) => cutBy === null)) {
      return <span className="shrink-0 text-2xs text-ink-faint">not cut</span>
    }
    return null
  }

  return (
    <span className="flex shrink-0 items-center gap-1">
      {homes.map(({ pass, cutBy }) => {
        const word = pass === 'rough' ? 'Roughed' : 'Finished'

        if (cutBy === null) {
          return (
            <span
              key={pass}
              className="rounded border border-edge px-1 text-2xs font-semibold text-ink-faint"
              title={`${word} nowhere — no reading in the plan cuts this face in this pass`}
            >
              {pass === 'rough' ? 'R' : 'F'} —
            </span>
          )
        }

        const here = cutBy.featureTag === feature.featureTag

        return (
          <span
            key={pass}
            className={`rounded px-1 text-2xs font-semibold ${
              here ? 'bg-info/20 text-info' : 'bg-warning/15 text-warning'
            }`}
            title={
              here
                ? `${word} here, as this reading`
                : `${word} as ${typeLabel(cutBy.featureType)} from ${directionLabel(cutBy.machiningDirection)}`
            }
          >
            {pass === 'rough' ? 'R' : 'F'}{' '}
            {here ? 'here' : directionLabel(cutBy.machiningDirection)}
          </span>
        )
      })}
    </span>
  )
}

export const FaceList = ({
  feature,
  focusedTag,
  reveal,
  onCurrentFace,
  onSetFace,
  onSetFacePass,
  onSetPass,
  onChoose,
  onHoverFace,
  onCancel,
  changed,
  onClose,
  onDelete,
  onCutFrom,
  cutting,
  types,
  onRetype,
  onSelectAll,
  onUnlockSetup,
  onSelectFree,
  onCutting,
}: {
  feature: PartFeature
  /** The reading being read, so the row that is says so. */
  focusedTag: string | null
  /** A face named from the part, to open and scroll to. */
  reveal: number | null
  /** The face being worked on, so the part can point at it too. */
  onCurrentFace: (region: number | null) => void
  /** Add this face to what the reading cuts, or take it off. */
  onSetFace: (feature: PartFeature, region: number, cut: boolean) => void
  /**
   * Move **one face** to one of its readings, in the passes named.
   *
   * Empty passes means "take this face off that reading", which is what
   * pressing the pass it already holds amounts to — the same rule a row
   * follows, aimed one level down.
   */
  onSetFacePass: (feature: PartFeature, region: number, passes: ReadonlyArray<Pass>) => void
  onSetPass: (features: ReadonlyArray<PartFeature>, passes: ReadonlyArray<Pass>) => void
  /**
   * Read one of a face's readings — the offer list's rule.
   *
   * Reading it lights nothing new on the part, because the face is already lit
   * and the list is a question about the face. What it does change is the arrow:
   * the way up that reading is cut from is drawn, which is the answer to "which
   * of these" in the only place a direction can actually be seen.
   */
  onChoose: (featureTag: string) => void
  /** Light one face on the part, or none. */
  onHoverFace: (region: number | null) => void
  /** Keep the work, and leave. */
  onClose: () => void
  /** Put the plan back as it was when the editor opened, and leave. */
  onCancel: () => void
  /**
   * Whether anything has changed since the editor opened.
   *
   * Not "is the reading mapped" — *is there anything for `Save` to keep*, which
   * is the same question `Cancel` answers from the other side.
   */
  changed: boolean
  /** Take a made reading off the part. Reported ones cannot be deleted. */
  onDelete: (featureTag: string) => void
  /** Point a made reading at another candidate way up, and re-read it there. */
  onCutFrom: (featureTag: string, direction: number) => void
  /** The passes a click on the part claims — the editor's own R / F / Both. */
  cutting: ReadonlyArray<Pass>
  /** Put every face this reading covers in, or take them all out. */
  /** The types the part already uses, so a renamed reading is named like the rest. */
  types: ReadonlyArray<string>
  /**
   * Rename what this reading **is**.
   *
   * Not a label: the type decides which rules speak about a reading, so this
   * changes what it scores and where a generator will put it. The Engine's
   * measurements do not move with it — a rule aimed at the new type that reads
   * a number this reading does not carry goes quiet rather than inventing one.
   */
  onRetype: (featureTag: string, featureType: string) => void
  /** Take every face out of the reading — the only sweep left. */
  onSelectAll: (on: false) => void
  /** Unsettle the way up this reading is cut from, so it can be edited. */
  onUnlockSetup: (setupId: string) => void
  /**
   * Put in every face nothing else is cutting — the gap `Select all` left.
   *
   * Takes the faces rather than a flag, because "free" is decided here: the
   * panel is the only place that has the rows, and re-deriving the set in the
   * inspector is two answers to one question waiting to disagree.
   *
   * **Passes per face, not one list for all of them.** A face finished
   * elsewhere and roughed by nobody is free in roughing alone, whatever the
   * switch says.
   */
  onSelectFree: (faces: ReadonlyArray<{ region: number; passes: ReadonlyArray<Pass> }>) => void
  /** Change which passes a click on the part claims. */
  onCutting: (passes: ReadonlyArray<Pass>) => void
}) => {
  const { part, plan, directions, scores, showingPass, unit } = usePartView()

  /**
   * The face being worked on: expanded, and lit on the part.
   *
   * **One at a time.** Two were once possible — several rows showing their
   * readings while a separate piece of state remembered which one was current —
   * and it made a list of twelve faces into a wall of readings with nothing to
   * say which mattered. Opening a face is saying "this one", and saying it
   * twice about two faces is not a thing anybody means.
   *
   * So one value does both jobs, and they cannot disagree.
   */
  const [open, setOpen] = useState<number | null>(null)

  useEffect(() => {
    onCurrentFace(open)
  }, [open, onCurrentFace])

  /*
   * A face named from the part opens here and is scrolled to.
   *
   * Right clicking a face is asking "what is this one" — and the answer is the
   * row for it with its readings showing. On a twelve-face reading the row may
   * be off screen, so finding it by hand is the work this removes.
   */
  useEffect(() => {
    if (reveal === null) {
      return
    }
    setOpen(reveal)
    document
      .querySelector(`[${KEYNAV}="faces"] [${ROW}="${String(reveal)}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [reveal])

  const toggle = (idx: number) => setOpen((shown) => (shown === idx ? null : idx))

  const found = facesOf(part, plan, feature, showingPass)

  /**
   * The faces, grouped by **what the plan does with each**.
   *
   * Both, roughed only, finished only, not cut here. It is the question the
   * panel is opened with — a face roughed here and finished from the other side
   * costs a second setup, and that fact was previously spread through a column
   * of twenty rows for the eye to gather.
   *
   * The headings carry the same swatch and words the part is painted in, so the
   * list **is** the legend: four colours is more than anybody should have to
   * remember, and a separate key is one more thing to keep in step.
   *
   * **Live, unlike the order it replaces.** That one was fixed when the panel
   * opened, because a list re-sorting under a press moves the row out from
   * under the pointer at the worst moment. The press moved to the part: faces
   * are put in and taken out by clicking the model, so a row changing group is
   * the confirmation rather than a hazard — and the row clicked is revealed and
   * scrolled to anyway. Within each group the part's own order stands.
   */
  const groups = [
    { key: 'both', label: 'Roughed and finished', hex: FACE_COLORS.cut },
    { key: 'rough', label: 'Roughed only', hex: FACE_COLORS.rough },
    { key: 'finish', label: 'Finished only', hex: FACE_COLORS.finish },
    { key: 'none', label: 'Not cut here', hex: FACE_COLORS.uncut },
  ].map((group) => ({
    ...group,
    rows: found.filter((row) => {
      if (row.passes.length === PASSES.length) {
        return group.key === 'both'
      }
      if (row.passes.length === 0) {
        return group.key === 'none'
      }
      return group.key === row.passes[0]
    }),
  }))

  const rows = groups.flatMap((group) => group.rows)

  /*
   * What these faces read as, from this way up — the Engine's own vote.
   *
   * The same reading `Create` offers while a set is being drawn, asked of a
   * reading that already exists. It answers the question that brings somebody
   * to the type field in the first place: *I have added four faces, is this
   * still a wall?*
   *
   * Its own type is dropped from the list. "These faces read as Wall" under a
   * reading called Wall is a sentence that costs a line and says nothing.
   */
  const reads = readsAs(
    part.features,
    feature.machiningDirection,
    rows.map((row) => row.idx),
  ).filter((guess) => guess.featureType !== feature.featureType)

  // The same function the mapping lists, the confirmed directions and the
  // datasheet count with. Four places showing this number is four chances for
  // one of them to disagree with the panel it opens.
  const { cut } = faceCounts(plan, feature)
  // Nothing to clear, which is a different state from "everything is held" —
  // and between them is the one a single toggle could not express.
  const noneHeld = rows.every((row) => cutting.every((pass) => !row.passes.includes(pass)))
  /*
   * Faces nothing else has claimed, in the passes the switch names.
   *
   * The gap `Select all` left. Taking every face this reading covers is right
   * when the reading is the answer for all of them and wrong the rest of the
   * time: on a face already finished from another way up it overrides a
   * decision somebody made, silently, as part of a press about twenty other
   * faces.
   *
   * "Free" is per pass and asked of the whole part, not of this reading — a
   * face this reading already holds is not free, and neither is one another
   * reading holds. So the press only ever fills ground nobody has spoken for.
   *
   * **Each face carries its own passes**, rather than every face taking the
   * switch's. With Both selected, a face finished from another way up and
   * roughed by nobody is free *in roughing only*: filling it in both passes
   * would take the finishing off the reading that has it, which is the one
   * thing this press exists not to do.
   */
  const free = rows
    .map((row) => ({
      region: row.idx,
      passes: cutting.filter((pass) => row.cutBy[pass] === null && !row.passes.includes(pass)),
    }))
    .filter((row) => row.passes.length > 0)
  const elsewhere = cutElsewhere(part, plan, feature, showingPass)

  /*
   * A reading held by a setup somebody has settled.
   *
   * The editor is where work is moved off a way up, and a lock says that way up
   * is a decision. Stopping the generators and leaving the editor open was half
   * an answer: the offers respected the lock and a hand edit walked straight
   * through it, which is the sort of half-rule people learn not to trust.
   *
   * It says which setup, and offers to unlock — because the answer to "I want
   * to change this" is almost always "then unsettle it", and making somebody go
   * and find the row to do that is the app being obstructive rather than clear.
   */
  const settled = settledSetup(plan, feature.featureTag)

  return (
    <aside
      /*
       * The size is set **here**, not on the rows.
       *
       * `styles.css` carries an unlayered `button { font: inherit }`, which
       * beats Tailwind's layered utilities — so a `text-2xs` on a `<button>`
       * does nothing at all and the row falls back to the document's 16px
       * (F20). Every other panel sets `text-xs` on its container and lets the
       * rows inherit; this one did not, which is why its readings were drawn
       * half again the size of the same readings everywhere else.
       */
      className="flex size-full min-h-0 flex-col overflow-y-auto bg-ground text-xs"
      onMouseLeave={() => onHoverFace(null)}
    >
      <header className="flex flex-col gap-2 border-b border-edge p-3">
        <div className="flex items-start justify-between gap-2">
          <h2 className="flex flex-wrap items-center gap-2 font-display text-lg font-bold leading-tight">
            <KindIcon featureType={feature.featureType} kind="Other" />
            {typeLabel(feature.featureType)}
            <span className="font-sans text-sm font-normal text-ink-dim">
              {/* Its faces, and how many of them this reading is actually
                  cutting — the number that was pressed to get here. */}
              {cut === rows.length
                ? `${String(rows.length)} faces`
                : `${String(cut)} of ${String(rows.length)} faces`}
            </span>
          </h2>
          <span className="flex shrink-0 items-center gap-1.5">
            {/*
              A made reading has no datasheet worth reading — no measurements,
              no verdict — so this **is** its detail view, and the delete
              belongs where the thing is.
            */}
            {isMade(feature) ? (
              /*
                A plain button, matching every other control in this panel.
                
                It started as a workaround: `@toolpath/ui`'s `Button` did not
                fire its `onClick` here, and I could not account for it. The
                cause is now known and fixed in the kit — its inner `<div>` was
                a component declared inside the render, so React replaced the
                element between mousedown and mouseup and the browser dispatched
                no click at all (F67). This stays plain because the rest of the
                panel is plain, not because the kit is suspect.
              */
              <button
                type="button"
                onClick={() => onDelete(feature.featureTag)}
                className={panelButtonClass({ tone: 'danger' })}
              >
                Delete
              </button>
            ) : null}
            {/*
              Two ways out, because there was only one.

              Every click writes straight to the plan — that is what makes
              editing on the model worth doing — so the thing that was missing
              was not a draft but a way back. `Cancel` puts the plan back as it
              was when this opened; `Save` keeps the work. Neither is `Close`,
              which said nothing about which of the two it did.
            */}
            <button
              type="button"
              onClick={onCancel}
              title="Put the plan back as it was when this opened"
              className={panelButtonClass({ tone: 'danger' })}
            >
              Cancel
            </button>
            {/*
              Lit once there is something to keep.

              Every click in here writes straight to the plan, so `Save` is
              always available and for most of a session there is nothing behind
              it — a button that looks the same whether or not it has work to
              keep is one nobody can read. It answers the same question `Cancel`
              does, from the other side: lit means Cancel would undo something.

              The kit `Button` is gone from this row. It was the one control in
              the panel wearing a different shape, and the row it sits in is
              read as a set.
            */}
            <button
              type="button"
              onClick={onClose}
              // Announced, not only coloured: "there is something to keep" is a
              // state, and a state that exists only as a shade is one some
              // people never get.
              aria-pressed={changed}
              title={
                changed
                  ? 'Keep the changes made here'
                  : 'Nothing has changed — this closes the editor'
              }
              className={panelButtonClass({ pressed: changed })}
            >
              Save
            </button>
          </span>
        </div>
        {isMade(feature) ? (
          <CutFrom
            directions={directions}
            current={feature.machiningDirection}
            onCutFrom={(index) => onCutFrom(feature.featureTag, index)}
          />
        ) : null}
        {/*
          The part is the control: a click puts a face in or takes it out.
          
          Said here because it is the whole of face editing and it happens
          somewhere other than this panel — a list of twelve indices is a poor
          way to point at a face that is right there on the model.
        */}
        {/*
          Inert while the way up this reading is cut from is settled.

          `inert` rather than disabling each control: it takes the whole set out
          of the pointer, the keyboard and the accessibility tree in one word,
          and there is no list to keep in step as the panel grows. The rows
          below stay readable — a settled reading is still worth looking at, it
          just cannot be argued with until somebody unsettles it.
        */}
        <div
          className="flex flex-col gap-1.5 rounded border border-info/40 bg-info/10 px-2 py-1.5"
          inert={settled !== null}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-2xs font-bold uppercase tracking-wider text-info/80">
              Clicking a face
            </span>
            {/*
                The Cut switch, **here** rather than on the bar above.
                
                While this panel is open it is the only one of the axes that
                still means anything — the way up belongs to the reading, not to
                the click — and a control lives next to the thing it governs. The
                bar hides it for the same reason: two copies of one switch is the
                duplication the holding chip already taught us to avoid.
              */}
            <div
              role="group"
              aria-label="Clicking a face"
              className="flex items-center gap-px rounded border border-info/40 p-px"
            >
              {(
                [
                  ['rough', 'R', 'Roughs it here, and only roughs it'],
                  ['finish', 'F', 'Finishes it here, and only finishes it'],
                  ['both', 'Both', 'Roughs and finishes it here'],
                ] as const
              ).map(([value, label, title]) => {
                const chosen =
                  value === 'both' ? cutting.length === PASSES.length : cutting[0] === value
                const held = value === 'both' ? chosen : chosen && cutting.length === 1

                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={held}
                    title={title}
                    onClick={() => onCutting(value === 'both' ? PASSES : [value])}
                    className={`rounded-sm px-1.5 py-0.5 text-2xs font-semibold transition ${
                      held ? 'bg-info/30 text-info' : 'text-info/60 hover:bg-info/15'
                    }`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
          {/*
            What the colours on the part mean — **all four, always**.

            The list headings carry a swatch each, which made the list its own
            key and saved a legend that has to be kept in step. That works for
            colours the reading already wears and fails for the rest: a heading
            only exists once a face is in that state, so the meaning of the
            colour somebody is about to paint arrives *after* they have painted
            it. Here, where the click is armed, is where it is needed.
          */}
          <ul
            aria-label="What the colours mean"
            className="flex flex-wrap items-center gap-x-3 gap-y-1"
          >
            {groups.map((group) => (
              <li key={group.key} className="flex items-center gap-1.5 text-2xs text-ink-muted">
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-sm"
                  style={{ background: `#${group.hex.toString(16).padStart(6, '0')}` }}
                />
                {group.label}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-2xs leading-4 text-info">
              Puts it in or takes it out. Everything else stays as it is.
            </p>
            {/*
              **`Select all` is gone.**

              It put every face the reading covers in, which is right when the
              reading is the answer for all of them and silently overrides
              somebody's decision the rest of the time — as part of a press
              about twenty other faces. `All unmapped` is the same press with
              that one failure removed: it fills what nothing else is cutting.

              Taking a face off another reading is still perfectly possible; it
              is done in the mapping list, where it is the thing being asked
              for rather than a side effect.
            */}
            {/*
              Two buttons, not one that changes its word.
              
              A toggle reads the state and offers the opposite — which is right
              when there are two states and useless when there are three. On a
              reading holding twelve of twenty-seven faces it said `Select all`
              and there was **no way to clear**, because "all held" was false
              and that was the only test it made.
            */}
            <span className="flex shrink-0 items-center gap-1">
              {/*
                The other half of `Select all`: everything free, and nothing
                that is not. It fills the gaps in a plan without arguing with
                any of it, which is the usual thing somebody wants after a
                generator has run.
              */}
              <button
                type="button"
                disabled={free.length === 0}
                onClick={() => onSelectFree(free)}
                title="Put in every face nothing else is cutting, in the passes the switch names"
                className={panelButtonClass()}
              >
                All unmapped{free.length > 0 ? ` (${String(free.length)})` : ''}
              </button>
              <button
                type="button"
                disabled={noneHeld}
                onClick={() => onSelectAll(false)}
                title="Take every face out of this reading"
                className={panelButtonClass({ tone: 'danger' })}
              >
                Clear all
              </button>
            </span>
          </div>
        </div>
        {/*
          What it is, and a way to disagree.

          The Engine says what a face reads as, and after faces have been added
          a machinist is often right to disagree — a wall that has picked up a
          floor and two fillets is not a wall. The type decides which rules
          speak about the reading and therefore what it scores, so this is a
          real edit rather than a label.
        */}
        <label className="flex items-center gap-2 text-2xs text-ink-dim">
          <span className="shrink-0">Read as</span>
          <select
            aria-label="Feature type"
            value={feature.featureType}
            onChange={(event) => onRetype(feature.featureTag, event.target.value)}
            className="min-w-0 flex-1 rounded border border-edge-strong bg-ground px-1.5 py-1 text-2xs text-ink-strong"
          >
            {/*
              Its own type first even where the part has no other reading of
              that type — a made reading, or one the Engine reports once. A
              select whose value is not among its options shows blank, and a
              blank type field reads as a reading with no type at all.
            */}
            {[...new Set([feature.featureType, ...types])].sort().map((type) => (
              <option key={type} value={type}>
                {typeLabel(type)}
              </option>
            ))}
          </select>
        </label>
        {reads.length === 0 ? null : (
          <p className="text-2xs leading-4 text-ink-dim">
            {/*
              What the faces themselves vote for, from this way up — the same
              reading `Create` offers while a set is being drawn. It is the
              answer to "I added four faces, is this still a wall", which is
              the moment somebody wants this control.
            */}
            These faces read as{' '}
            {reads.slice(0, 3).map((guess, at) => (
              <span key={guess.featureType}>
                {at > 0 ? ', ' : ''}
                <button
                  type="button"
                  onClick={() => onRetype(feature.featureTag, guess.featureType)}
                  className={`rounded underline decoration-dotted underline-offset-2 transition hover:text-info ${
                    feature.featureType === guess.featureType ? 'text-info' : 'text-ink-body'
                  }`}
                >
                  {typeLabel(guess.featureType)}
                </button>{' '}
                <span className="tabular-nums">
                  ({guess.faces} of {rows.length})
                </span>
              </span>
            ))}
            .
          </p>
        )}
        {settled === null ? null : (
          /*
           * Settled, so the editor is read-only until somebody says otherwise.
           *
           * The offer to unlock is here rather than only on the direction row:
           * the answer to "I want to change this" is almost always "then
           * unsettle it", and sending somebody off to find the row is the app
           * being obstructive rather than clear.
           */
          <div className="flex flex-wrap items-center gap-2 rounded border border-info/40 bg-info/10 px-2 py-1.5">
            <p className="min-w-0 flex-1 text-2xs leading-4 text-info">
              Cut from <span className="font-semibold">{settled.name}</span>, which is settled.
              Nothing here can change until it is unlocked.
            </p>
            <button
              type="button"
              onClick={() => onUnlockSetup(settled.id)}
              className="shrink-0 rounded border border-info px-1.5 py-0.5 text-2xs font-semibold text-info transition hover:bg-info/20"
            >
              Unlock {settled.name}
            </button>
          </div>
        )}
        <p className="text-2xs leading-4 text-ink-dim">
          Every face this reading covers. Ticking one cuts it from{' '}
          {directionLabel(feature.machiningDirection)}, roughing and finishing — open it to see what
          else could.
        </p>
        {/*
          What a part-cut claim actually means, said rather than left as a
          fraction.

          "3 of 4" is a count; **this feature is machined from two ways up** is
          the fact, and it is the one that costs a shop a second setup. Named
          here because the panel is where somebody split it.
        */}
        {elsewhere.length === 0 ? null : (
          <p className="rounded border border-warning/40 bg-warning/10 px-2 py-1 text-2xs leading-4 text-warning">
            Machined across {elsewhere.length + 1} ways up — {rows.length - cut} of its faces{' '}
            {rows.length - cut === 1 ? 'is' : 'are'} cut from{' '}
            {[...new Set(elsewhere.map((each) => directionLabel(each.machiningDirection)))].join(
              ', ',
            )}
            .
          </p>
        )}
      </header>

      <ul
        aria-label="Faces"
        className="flex flex-col p-1.5"
        {...keynavAttributes('faces')}
        onKeyDown={(event) =>
          moveThroughList(event, {
            onOpen: (value) => toggle(Number(value)),
            onClose: () => setOpen(null),
          })
        }
      >
        {groups.map((group) =>
          group.rows.length === 0 ? null : (
            <Fragment key={group.key}>
              {/*
                The heading carries the swatch the part is painted in, so this
                list is also the key to the model — rather than a separate
                legend that has to be kept in step with it.
              */}
              <li className="mt-1 flex items-center gap-1.5 px-1 pb-0.5 pt-1 text-2xs font-bold uppercase tracking-wider text-ink-dim first:mt-0">
                <span
                  aria-hidden="true"
                  className="size-2 rounded-sm"
                  style={{ background: `#${group.hex.toString(16).padStart(6, '0')}` }}
                />
                <span>{group.label}</span>
                <span className="tabular-nums text-ink-faint">{group.rows.length}</span>
              </li>
              {group.rows.map((row) => (
                <li key={row.idx}>
                  <div
                    /*
                     * **One** highlighted row: the one being worked on.
                     *
                     * Cut rows used to carry a fill of their own, and on a reading
                     * whose faces are all cut — which is most of them — that is every
                     * line in the list lit the moment it opens. A highlight that is
                     * on everything points at nothing, and it left the current row
                     * competing with eleven others for the same signal.
                     *
                     * The tick already says whether this reading cuts the face, in
                     * the row, unambiguously. So the fill is free to mean the other
                     * thing, which is the one the list cannot otherwise show.
                     */
                    className={`flex items-center gap-1 rounded border-l-2 pr-1 hover:bg-ground/40 ${
                      open === row.idx ? 'border-info bg-info/20' : 'border-transparent'
                    }`}
                    onMouseEnter={() => onHoverFace(row.idx)}
                    /*
                      The keyboard lights it too.
                      
                      Arrowing down this list is the same question as running the
                      pointer down it — *which face is this row* — and the answer
                      is on the part. Without this, the one way of reading the
                      list that never leaves the keyboard was the one that could
                      not see what it was reading.
                    */
                    onFocusCapture={() => onHoverFace(row.idx)}
                    onBlurCapture={() => onHoverFace(null)}
                    // Paired with the enter. Left to the panel's own leave handler,
                    // the last row touched stayed lit while the pointer worked
                    // somewhere else entirely — including out on the part, where it
                    // reads as a face that has selected itself.
                    onMouseLeave={() => onHoverFace(null)}
                  >
                    <button
                      type="button"
                      aria-expanded={open === row.idx}
                      aria-label={
                        open === row.idx
                          ? `Hide what else covers face ${String(row.idx)}`
                          : `Show what else covers face ${String(row.idx)}`
                      }
                      onClick={() => toggle(row.idx)}
                      className="w-4 shrink-0 text-2xs text-ink-dim transition hover:text-ink-strong"
                    >
                      {open === row.idx ? '▾' : '▸'}
                    </button>
                    {/*
                A checkbox, which is the one place in this app that earns one:
                it says whether the reading cuts this face, and pressing it is
                the whole gesture. Nothing is being read, so nothing lights up
                that was not already lit.
              */}
                    {/*
                The tick is its own control, and the rest of the row opens it.
                
                The whole row used to be a `<label>`, so a click anywhere in it
                toggled the tick — and the thing somebody most often wants from
                a row is to *look at it*: which readings cover this face, where
                it is cut now. Reading a face by accidentally taking it out of
                the reading is the worst possible default, and it is the one
                that was there.
              */}
                    <input
                      type="checkbox"
                      checked={row.passes.length > 0}
                      /*
                    Dashed when this reading cuts the face in **one** pass —
                    roughed here and finished from somewhere else, or the other
                    way about. The same `mixed` the pass buttons show, for the
                    same reason: a box that reads fully on is the panel claiming
                    more than the plan says.
                  */
                      ref={(box) => {
                        if (box) {
                          box.indeterminate = row.passes.length === 1
                        }
                      }}
                      aria-checked={row.passes.length === 1 ? 'mixed' : row.passes.length > 0}
                      aria-label={`Cut face ${String(row.idx)} from ${directionLabel(
                        feature.machiningDirection,
                      )}`}
                      /*
                    Not the box's own value. A half-cut face **fills up** rather
                    than emptying — pressing a dashed control takes the rest
                    back, which is the rule R, F and Both already follow, and
                    the only way the two gestures can agree about what dashed
                    means.
                  */
                      onChange={() =>
                        onSetFace(feature, row.idx, row.passes.length !== PASSES.length)
                      }
                      className="ml-1 size-3 shrink-0 accent-info"
                    />
                    <button
                      type="button"
                      {...rowAttributes(String(row.idx))}
                      tabIndex={-1}
                      aria-expanded={open === row.idx}
                      onClick={() => toggle(row.idx)}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-left"
                    >
                      <span
                        className={`flex-1 truncate ${row.passes.length > 0 ? 'text-ink-strong' : 'text-ink-dim'}`}
                      >
                        Face {row.idx}
                      </span>
                      {/*
                  Which passes this reading cuts it in, on the row.
                  
                  The tick says *whether* and reads `mixed` for a split claim,
                  which is honest and does not say **which** — and which is the
                  question, because a face roughed here and finished elsewhere
                  is a second setup.
                */}
                      <span className="flex shrink-0 items-center gap-0.5">
                        {PASSES.map((pass) => (
                          <span
                            key={pass}
                            title={`${pass === 'rough' ? 'Roughed' : 'Finished'} ${
                              row.passes.includes(pass) ? 'here' : 'somewhere else, or not at all'
                            }`}
                            className={`grid size-3.5 place-items-center rounded-sm text-2xs font-bold ${
                              row.passes.includes(pass)
                                ? 'bg-info/25 text-info'
                                : 'border border-edge text-ink-faint'
                            }`}
                          >
                            {pass === 'rough' ? 'R' : 'F'}
                          </span>
                        ))}
                      </span>
                      {/*
                  Handed to this reading, rather than reported in it. Marked,
                  because an unmarked row would read as the Engine's own answer
                  — which is the one thing it is not.
                */}
                      {row.added ? (
                        <span
                          className="shrink-0 rounded bg-proposed/20 px-1 text-2xs font-semibold text-proposed"
                          title="Added to this reading by hand — the Engine did not report it here"
                        >
                          added
                        </span>
                      ) : null}
                      <span className="shrink-0 text-ink-dim">{row.shape}</span>
                      <span className="shrink-0 tabular-nums text-ink-dim">
                        {formatArea(row.area, unit)}
                      </span>
                      <FaceHomes feature={feature} row={row} />
                      {/* How many ways this face could be cut. One means the plan has
                    no choice about it, which is worth seeing at a glance. */}
                      <span
                        className="shrink-0 rounded bg-raised px-1 text-2xs font-semibold text-ink-muted"
                        title={`${String(row.owners.length)} readings cover this face`}
                      >
                        {row.owners.length}
                      </span>
                    </button>
                  </div>

                  {open === row.idx ? (
                    /*
                Every reading of this face, each assignable from here. The list
                a click on the part produces, for one face, without having to
                find that face on the part.
              */
                    <ul
                      className="mb-1 ml-5 border-l border-edge"
                      // The face stays lit while its readings are worked. Hovering one
                      // of them is still a question about *that face* — which of these
                      // cuts it — so lighting the reading's other faces would answer a
                      // question nobody asked.
                      onMouseEnter={() => onHoverFace(row.idx)}
                    >
                      {row.owners.map((owner) => {
                        const setup = setupForReading(plan, directions, owner)
                        const reading = owner.featureTag === focusedTag

                        return (
                          <li
                            key={owner.featureTag}
                            className="flex items-center gap-1 rounded pr-1"
                          >
                            {/*
                        The same row every other list draws: icon, what it is,
                        which way up, how hard, how many regions, then the three
                        presses. One shape for "a reading" wherever it is being
                        read — a list that formats them its own way makes
                        somebody learn the same row twice.
                      */}
                            <button
                              type="button"
                              {...rowAttributes(owner.featureTag)}
                              aria-pressed={reading}
                              // Reads it, and nothing else — the offer list's rule.
                              // The face stays lit and the part draws this reading's
                              // way up, so "which of these cuts it" is answered
                              // without leaving the list that asked.
                              onFocus={() => onChoose(owner.featureTag)}
                              onClick={() => onChoose(owner.featureTag)}
                              className={readingRowClass(reading)}
                            >
                              <ReadingRow
                                reading={owner}
                                score={scores.get(owner.featureTag)}
                                // These are alternatives from every way up that
                                // reaches the face, so each has to say which.
                                showDirection
                              />
                            </button>
                            {/*
                        The reading whose editor this is.
                        
                        Outside the row itself, which is pinned to read the same
                        wherever a reading is drawn. It earns its place on a face
                        **handed** to this reading: the Engine never reported the
                        face here, so without saying so the row reads as one more
                        alternative rather than as where the face already is.
                      */}
                            {owner.featureTag === feature.featureTag ? (
                              <span
                                className="shrink-0 rounded bg-info/20 px-1 text-2xs font-semibold text-info"
                                title="The reading being edited — this face is already here"
                              >
                                this one
                              </span>
                            ) : null}
                            {/*
                        Per **face**, not per reading.
                        
                        These rows are the readings of one face, so a press here
                        moves that face and nothing else — whatever else the
                        reading already cuts, and whatever every other reading
                        cuts, stays exactly as it was. So the buttons answer
                        "does this reading cut *this face*", which is a yes or a
                        no; the three-state dash belongs to a row that stands
                        for a whole reading.
                      */}
                            <PassButtons
                              label={`${directionLabel(owner.machiningDirection)}, face ${String(
                                row.idx,
                              )}`}
                              rough={cutsFace(plan, owner, 'rough', row.idx)}
                              finish={cutsFace(plan, owner, 'finish', row.idx)}
                              onSetPass={(passes) => onSetFacePass(owner, row.idx, passes)}
                            />
                          </li>
                        )
                      })}
                    </ul>
                  ) : null}
                </li>
              ))}
            </Fragment>
          ),
        )}
      </ul>
    </aside>
  )
}
