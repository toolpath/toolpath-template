import type { Vec3 } from '@toolpath/api'
import { Button } from '@toolpath/ui'

import { KindIcon } from './feature-icons'
import { CutFrom } from './cut-from'
import { PassButtons } from './pass-buttons'
import { setupForReading } from '../shared/plan-actions'
import { PASSES, cutState, cutsFace, type Pass, type SetupPlan } from '../shared/setups'
import { ScoreBadge } from './score-badge'
import { directionCss } from '../shared/direction-colors'
import { directionLabel, kindOf } from '../shared/report'
import { typeLabel } from '../shared/part-summary'
import {
  coveringAll,
  growRun,
  perimeterFrom,
  readsAs,
  relationTo,
  runsIn,
  type Draft,
  type Touching,
} from '../shared/make-feature'
import type { PartFeature } from '../shared/contracts'
import type { PartFaces } from '../shared/setups'
import type { FeatureScore } from '../shared/feature-score'
import { formatArea, type Unit } from '../shared/units'

/**
 * Making a reading the Engine did not report.
 *
 * The Engine recognises features **per direction**, and on most parts that is
 * everything a plan needs. Where it is not — four faces a shop intends to run
 * as one operation, which no reported feature covers exactly — this is how they
 * say so.
 *
 * Three questions, in the order they can actually be answered: which way up,
 * which faces, and only then what it is. The type is last because it is the one
 * the app can guess, and it cannot guess before there are faces to look at.
 */
const Step = ({
  n,
  title,
  done,
  children,
}: {
  n: number
  title: string
  done: boolean
  children: React.ReactNode
}) => (
  <section className="border-t border-zinc-800 px-3 py-2 first:border-t-0">
    <h3 className="mb-1.5 flex items-center gap-2 text-2xs font-bold uppercase tracking-wider text-zinc-500">
      {/*
        Numbered because this genuinely is a sequence — the way up decides what
        the faces read as, and the faces decide what the type is guessed to be.
        Anywhere else in this app a number would be decoration.
      */}
      <span
        className={`grid size-4 place-items-center rounded-full text-2xs font-semibold ${
          done ? 'bg-info/25 text-info' : 'bg-zinc-800 text-zinc-500'
        }`}
      >
        {done ? '✓' : n}
      </span>
      {title}
    </h3>
    {children}
  </section>
)

export const CreateFeature = ({
  made,
  draft,
  directions,
  report,
  touching,
  types,
  scores,
  unit,
  plan,
  onDraft,
  onChoose,
  onHover,
  onHoverFace,
  onConfirm,
  onDiscard,
  onSetPass,
  onAgain,
  onDone,
  onDelete,
  onCutFrom,
}: {
  /** The reading just created, waiting to be mapped. */
  made: PartFeature | null
  draft: Draft
  directions: readonly Vec3[]
  /** The part, for what covers these faces and what each of them is. */
  report: PartFaces & { features: ReadonlyArray<PartFeature> }
  /** Which faces touch which, for chaining and continuity. */
  touching: Touching
  /** The types this part has, so a made reading is named like the rest. */
  types: readonly string[]
  scores: ReadonlyMap<string, FeatureScore>
  unit: Unit
  /** The mapping so far, so the presses below say what they already hold. */
  plan: SetupPlan
  onDraft: (draft: Draft) => void
  onChoose: (featureTag: string) => void
  onHover: (tags: string[]) => void
  /** Light one chosen face on the part on its own. */
  onHoverFace: (region: number | null) => void
  onConfirm: () => void
  onDiscard: () => void
  /** Map the reading just created, in the passes named. */
  onSetPass: (feature: PartFeature, passes: ReadonlyArray<Pass>) => void
  /** Take it off the part again. */
  onDelete: (featureTag: string) => void
  /** Point the made reading at another candidate way up, and re-read it there. */
  onCutFrom: (featureTag: string, direction: number) => void
  /** Put it down and start another. */
  onAgain: () => void
  /** Leave the mode entirely. */
  onDone: () => void
}) => {
  const vector = draft.direction === null ? null : directions[draft.direction]
  /**
   * Which of the chosen faces the plan is already cutting, and from where.
   *
   * By way up rather than by reading, because that is the thing somebody is
   * deciding between: "this face is already cut from −Y" is the sentence, and
   * which of −Y's readings holds it is a level of detail below the question.
   */
  const cutNow = new Map<number, string>()
  for (const face of draft.faces) {
    for (const other of report.features) {
      if (!PASSES.some((pass) => cutsFace(plan, other, pass, face))) continue
      cutNow.set(face, directionLabel(other.machiningDirection))
      break
    }
  }

  const already = coveringAll(report.features, draft.faces)
  const sameWayUp = vector
    ? already.filter((each) => relationTo(vector, each.machiningDirection) === 'same')
    : []
  const guesses = vector ? readsAs(report.features, vector, draft.faces) : []
  const byIdx = new Map(report.regions.map((region) => [region.idx, region]))
  const perimeter = vector ? perimeterFrom(report.features, vector) : []
  const runs = vector ? runsIn(report.features, vector, draft.faces, touching) : []
  /*
   * Profile, when the Engine has a contour from here — and the run the chosen
   * faces sit in when it does not, which on a real part is most ways up.
   */
  const grown = vector ? growRun(report.features, vector, draft.faces, touching) : []
  /*
   * The Engine's own contour where it has one, and otherwise the run the chosen
   * faces sit in.
   *
   * A part reports two contours across seven ways up, so on five of them the
   * Engine's answer is silence — and a button that is only ever unavailable is
   * one nobody learns the meaning of. Following the surface from a face
   * somebody has already pointed at is the same question asked of the mesh
   * instead.
   */
  const profile = perimeter.length > 0 ? perimeter : grown
  const ready =
    draft.direction !== null &&
    draft.featureType !== null &&
    draft.faces.length > 0 &&
    // One piece. A reading drawn from two unconnected groups is one no toolpath
    // could follow, so it is refused rather than made and left to be found.
    runs.length === 1

  /*
   * Made, and not yet mapped.
   *
   * A reading is only half of a decision — the other half is which way up cuts
   * it, and somebody who has just drawn one is about to say so. Sending them
   * off to find it in another list to press the same three buttons is the panel
   * dropping the thread it was holding.
   */
  if (made !== null) {
    const setup = setupForReading(plan, directions, made)

    return (
      <div className="text-xs">
        <section className="border-b border-zinc-800 px-3 py-2">
          <p className="mb-2 text-2xs leading-4 text-info">
            Made. It is a reading like any other now — say where it is cut from.
          </p>
          {/*
            Offered here as well as in the editor, because the moment after
            drawing one is when the way up is most likely to be wrong — the
            faces were picked looking at the part, the arrow before looking.
          */}
          <div className="mb-2">
            <CutFrom
              directions={directions}
              current={made.machiningDirection}
              onCutFrom={(index) => onCutFrom(made.featureTag, index)}
            />
          </div>
          <div className="flex items-center gap-1 rounded border border-zinc-800 bg-zinc-950/40 pr-1">
            <span className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1 text-2xs text-zinc-400">
              <span className="shrink-0 text-zinc-500">
                <KindIcon featureType={made.featureType} kind={kindOf(made)} />
              </span>
              <span className="flex-1 truncate">{typeLabel(made.featureType)}</span>
              <span className="shrink-0 rounded bg-proposed/20 px-1 text-2xs font-semibold text-proposed">
                made
              </span>
              <span className="shrink-0 text-zinc-500">{made.regionIdxs.length}f</span>
              <span className="shrink-0 text-zinc-500">
                {directionLabel(made.machiningDirection)}
              </span>
            </span>
            <PassButtons
              label={directionLabel(made.machiningDirection)}
              rough={cutState(plan, made, 'rough', setup)}
              finish={cutState(plan, made, 'finish', setup)}
              onSetPass={(passes) => onSetPass(made, passes)}
            />
          </div>
        </section>
        <div className="flex items-center gap-1.5 px-3 py-2">
          {/*
            A thing that can be made and not unmade is a trap, and the moment
            after making one is when somebody is most likely to want it gone.
          */}
          <Button size="sm" variant="secondary" onClick={() => onDelete(made.featureTag)}>
            Delete
          </Button>
          <span className="ml-auto flex items-center gap-1.5">
            <Button size="sm" variant="secondary" onClick={onAgain}>
              Draw another
            </Button>
            {/*
              Its own way out, not the toggle's.
              
              Done used to call the same handler the Create button does, which
              *toggles* — and with the draft already put down by the confirm, it
              started a fresh drawing instead of leaving. Finishing and starting
              again are two things.
            */}
            <Button size="sm" onClick={onDone}>
              Done
            </Button>
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="text-xs" onMouseLeave={() => onHoverFace(null)}>
      <Step n={1} title="Which way up" done={draft.direction !== null}>
        <p className="mb-1.5 text-2xs leading-4 text-zinc-500">
          Press an arrow on the part, or pick one here.
        </p>
        <div className="flex flex-wrap gap-1">
          {directions.map((direction, index) => (
            <button
              key={index}
              type="button"
              aria-pressed={draft.direction === index}
              // The faces stay — see the note on the arrow handler. Only what
              // they read as changes, and the guess re-runs for that.
              onClick={() => onDraft({ ...draft, direction: index })}
              className={`flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-2xs font-semibold transition ${
                draft.direction === index
                  ? 'border-info bg-info/20 text-info'
                  : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
              }`}
            >
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full"
                style={{ background: directionCss(index) }}
              />
              {directionLabel(direction)}
            </button>
          ))}
        </div>
      </Step>

      <Step n={2} title="Which faces" done={draft.faces.length > 0}>
        {draft.direction === null ? (
          <p className="text-2xs leading-4 text-zinc-500">Choose a way up first.</p>
        ) : (
          <>
            <div className="mb-1.5 flex flex-wrap items-center gap-1">
              {/*
                Chaining off by default: on it, a stray click adds a run rather
                than a face — a bigger mistake to notice and a bigger one to
                undo.
              */}
              <button
                type="button"
                aria-pressed={draft.chaining}
                title="Click the first face and the last, and take everything between them"
                onClick={() => onDraft({ ...draft, chaining: !draft.chaining })}
                className={`rounded border px-1.5 py-0.5 text-2xs font-semibold transition ${
                  draft.chaining
                    ? 'border-info bg-info/20 text-info'
                    : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
                }`}
              >
                Chain
              </button>
              {/*
                A profile *is* the boundary contour of its direction — that is
                what the Engine means by the word — so this reads its own
                contours rather than walking the part.
              */}
              <button
                type="button"
                disabled={profile.length === 0}
                title={
                  perimeter.length > 0
                    ? `Take all ${String(perimeter.length)} faces of the Engine's own contour`
                    : grown.length > 0
                      ? `Follow the chosen faces round — ${String(grown.length)} faces touch`
                      : 'Choose a face first, and this follows the surface it sits in'
                }
                onClick={() => onDraft({ ...draft, faces: profile, anchor: null })}
                className="rounded border border-zinc-700 px-1.5 py-0.5 text-2xs font-semibold text-zinc-400 transition enabled:hover:border-zinc-500 enabled:hover:text-zinc-200 disabled:opacity-40"
              >
                {/* The count, because a greyed button that says only "Profile"
                    is one somebody reads as broken rather than as empty. */}
                Profile{profile.length > 0 ? ` (${String(profile.length)})` : ''}
              </button>
              {draft.faces.length > 0 ? (
                <button
                  type="button"
                  onClick={() => onDraft({ ...draft, faces: [], anchor: null })}
                  className="ml-auto rounded border border-zinc-700 px-1.5 py-0.5 text-2xs font-medium text-zinc-400 transition hover:border-danger hover:text-danger"
                >
                  Clear
                </button>
              ) : null}
            </div>
            <p className="mb-1 text-2xs leading-4 text-zinc-500">
              {draft.chaining
                ? 'Click a face, then another, to take the run between them.'
                : 'Click faces on the part to add them, and again to take them off.'}
              {perimeter.length === 0 && draft.faces.length === 0 ? (
                // Said rather than left as a grey button: a control nobody can
                // press and nobody can find out why is one that reads as broken.
                <>
                  {' '}
                  <span className="text-zinc-400">Profile</span> follows the surface a chosen face
                  sits in, so choose one first.
                </>
              ) : null}
            </p>
            {/*
              A running list, because "four faces are chosen" is not something
              anybody can check against the part — the far side of it is not on
              screen, and a face behind another cannot be counted at all.
            */}
            {/*
              A feature is one continuous piece of geometry: an operation runs
              over faces that touch, and a reading drawn from two unconnected
              groups is one no toolpath could follow. Said with the count of
              pieces rather than a bare refusal, so somebody knows which face to
              take off.
            */}
            {runs.length > 1 ? (
              <p className="mb-1 rounded border border-danger/40 bg-danger/10 px-2 py-1 text-2xs leading-4 text-danger">
                These are {runs.length} separate pieces —{' '}
                {runs.map((run) => run.length).join(' and ')} faces. A feature has to be one.
              </p>
            ) : null}
            {draft.faces.length === 0 ? (
              <p className="rounded border border-zinc-800 px-2 py-1 text-2xs text-zinc-600">
                No faces yet.
              </p>
            ) : (
              <ul className="flex flex-col">
                {draft.faces.map((idx) => (
                  <li
                    key={idx}
                    className="flex items-center gap-2 rounded px-1 py-0.5 text-2xs text-zinc-400 hover:bg-zinc-950/40"
                    onMouseEnter={() => onHoverFace(idx)}
                    onMouseLeave={() => onHoverFace(null)}
                  >
                    <span className="flex-1 truncate">Face {idx}</span>
                    <span className="shrink-0 text-zinc-500">
                      {byIdx.get(idx)?.shapeKind ?? 'unknown'}
                    </span>
                    <span className="shrink-0 tabular-nums text-zinc-500">
                      {formatArea(byIdx.get(idx)?.area ?? 0, unit)}
                    </span>
                    <button
                      type="button"
                      aria-label={`Take face ${String(idx)} off`}
                      onClick={() =>
                        onDraft({ ...draft, faces: draft.faces.filter((each) => each !== idx) })
                      }
                      className="shrink-0 rounded px-1 font-bold text-zinc-600 transition hover:text-danger"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Step>

      <Step n={3} title="What it is" done={draft.featureType !== null}>
        {/*
          Guessed from the faces, and it keeps guessing as they change — a type
          filled in from three faces should not stick once there are five.
          Naming one stops it, because disagreeing with the guess is the reason
          the field is editable at all.
        */}
        <select
          aria-label="Feature type"
          value={draft.featureType ?? ''}
          onChange={(event) =>
            onDraft({ ...draft, featureType: event.target.value || null, named: true })
          }
          className="w-full rounded border border-zinc-700 bg-zinc-950 px-1.5 py-1 text-2xs text-zinc-200"
        >
          <option value="">Choose a type…</option>
          {types.map((type) => (
            <option key={type} value={type}>
              {typeLabel(type)}
            </option>
          ))}
        </select>
        {guesses.length === 0 ? null : (
          <p className="mt-1.5 text-2xs leading-4 text-zinc-500">
            {draft.named ? 'These faces read as' : 'Guessed —'}{' '}
            {guesses.slice(0, 3).map((guess, at) => (
              <span key={guess.featureType}>
                {at > 0 ? ', ' : ''}
                <button
                  type="button"
                  onClick={() => onDraft({ ...draft, featureType: guess.featureType, named: true })}
                  className={`rounded underline decoration-dotted underline-offset-2 transition hover:text-info ${
                    draft.featureType === guess.featureType ? 'text-info' : 'text-zinc-300'
                  }`}
                >
                  {typeLabel(guess.featureType)}
                </button>{' '}
                <span className="tabular-nums">
                  ({guess.faces} of {draft.faces.length})
                </span>
              </span>
            ))}
            .
          </p>
        )}
      </Step>

      {/*
        The useful half.

        Most of the time the Engine has already reported what somebody is about
        to draw, and mapping the reported one is better than making a second
        reading of the same geometry. So these are offered, and the list going
        empty is the signal that this really is new.
      */}
      {draft.faces.length === 0 ? null : (
        <Step n={4} title="Already on the part" done={already.length === 0 && cutNow.size === 0}>
          {/*
            Faces already being machined, which is the more urgent half.
            
            "Nothing covers all of these, this is new" answers a question about
            the **shape** — is the Engine already describing it. It says nothing
            about the **plan**, and a face already cut from somewhere is one this
            reading is about to take: cut once means the press that maps this
            takes it off whatever holds it now. Somebody drawing over a mapped
            wall should be told before, not find out from a coverage figure
            afterwards.
          */}
          {cutNow.size === 0 ? null : (
            <p className="mb-1 rounded border border-warning/40 bg-warning/10 px-2 py-1 text-2xs leading-4 text-warning">
              {cutNow.size} of these {cutNow.size === 1 ? 'faces is' : 'faces are'} already machined
              — {[...cutNow.values()].join(', ')}. Mapping this takes{' '}
              {cutNow.size === 1 ? 'it' : 'them'} off whatever cuts{' '}
              {cutNow.size === 1 ? 'it' : 'them'} now.
            </p>
          )}
          {already.length === 0 ? (
            <p className="rounded border border-info/40 bg-info/10 px-2 py-1 text-2xs leading-4 text-info">
              Nothing covers all {draft.faces.length} of these. This is new.
            </p>
          ) : (
            <>
              {/*
                Which way up they are cut from, because it changes the advice
                entirely. A reading covering the same faces from the **other
                side of the part** is not the same operation, and offering it as
                one is the panel giving bad advice.
              */}
              <p className="mb-1 text-2xs leading-4 text-warning">
                {already.length} reading{already.length === 1 ? '' : 's'} already cover
                {already.length === 1 ? 's' : ''} all of these
                {sameWayUp.length > 0
                  ? ` — ${String(sameWayUp.length)} from this way up, so map one instead of drawing a second.`
                  : '. None from this way up, so a made reading may still be the right answer.'}
              </p>
              <ul className="flex flex-col">
                {already.map((feature) => (
                  <li
                    key={feature.featureTag}
                    className="flex items-center gap-1 rounded pr-1"
                    onMouseEnter={() => onHover([feature.featureTag])}
                    onMouseLeave={() => onHover([])}
                  >
                    <button
                      type="button"
                      data-row={feature.featureTag}
                      onClick={() => onChoose(feature.featureTag)}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-r px-2 py-1 text-left text-2xs text-zinc-400 transition hover:bg-zinc-950/60"
                    >
                      <span className="shrink-0 text-zinc-500">
                        <KindIcon featureType={feature.featureType} kind={kindOf(feature)} />
                      </span>
                      <span className="flex-1 truncate">{typeLabel(feature.featureType)}</span>
                      <span className="shrink-0 text-zinc-500">
                        {directionLabel(feature.machiningDirection)}
                      </span>
                      {vector ? (
                        <span
                          className={`shrink-0 rounded px-1 text-2xs font-semibold ${
                            relationTo(vector, feature.machiningDirection) === 'same'
                              ? 'bg-warning/20 text-warning'
                              : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          {relationTo(vector, feature.machiningDirection) === 'same'
                            ? 'this way up'
                            : relationTo(vector, feature.machiningDirection) === 'opposite'
                              ? 'opposite'
                              : 'another way up'}
                        </span>
                      ) : null}
                      <ScoreBadge score={scores.get(feature.featureTag)} />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Step>
      )}

      {/*
        Said while it is being drawn, not asked for afterwards.

        A reading is only half of a decision, and somebody drawing one already
        knows what they mean to do with it — making them say it again in another
        panel is asking the same question twice. Left unset it is made and not
        yet mapped, which is a real state and the one the next screen offers to
        fix.
      */}
      <div className="flex items-center gap-2 border-t border-zinc-800 px-3 py-2">
        <span className="text-2xs font-bold uppercase tracking-wider text-zinc-500">Cut it</span>
        <PassButtons
          label={vector ? directionLabel(vector) : 'this way up'}
          rough={draft.passes.includes('rough')}
          finish={draft.passes.includes('finish')}
          onSetPass={(passes) =>
            onDraft({
              ...draft,
              // The same three presses everywhere else: empty means take it off
              // both, and pressing what it already holds is how that is said.
              passes:
                passes.length === 0
                  ? []
                  : passes.every((pass) => draft.passes.includes(pass))
                    ? draft.passes.filter((pass) => !passes.includes(pass))
                    : [...new Set([...draft.passes, ...passes])],
            })
          }
        />
        <span className="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant="secondary" onClick={onDiscard}>
            Discard
          </Button>
          <Button size="sm" disabled={!ready} onClick={onConfirm}>
            Create feature
          </Button>
        </span>
      </div>
    </div>
  )
}
