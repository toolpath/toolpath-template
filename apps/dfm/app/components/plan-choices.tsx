import { CaretDownIcon } from '@phosphor-icons/react'
import { useState } from 'react'

import type { PlanLimits } from '../shared/rules'

/**
 * The two decisions about a plan that are **not scales**.
 *
 * They sit with the two that are, under *The plan itself*, because they are the
 * same kind of thing — a shop saying how it wants its work arranged — and a
 * separate panel of them below the list was the arrangement nobody could find.
 *
 * Neither is a price, which is why neither is a threshold rule: one is a
 * refusal and the other is a choice between two ways of ranking. Four
 * thresholds would be four ways to write down a yes or no.
 */
const BANDS_WORST_FIRST = ['no go', 'rats', 'meh', 'alright'] as const

/**
 * One of them, wearing a rule card.
 *
 * Deliberately the same row a threshold rule gets — a chevron, a name, a state
 * on the right, and what it is under a fold. They sit in a list of rules and
 * they *are* rules; a pair of bare headings among cards read as something else
 * the panel had left over, which is exactly what they used to be.
 *
 * What is missing is what they do not have: no pencil, because there is nothing
 * behind it — everything these decide is the control itself — and no enable
 * box, because "off" for a refusal is the `Anything` answer and "off" for a
 * choice between two rankings is not a thing.
 */
const Card = ({
  title,
  state,
  note,
  children,
}: {
  title: string
  /** What it is set to, shown on the row the way a rule shows its band. */
  state: string
  note: string
  children: React.ReactNode
}) => {
  const [open, setOpen] = useState(false)

  return (
    <li className="border-b border-zinc-800/60 py-1.5 last:border-b-0">
      <div className="flex items-center gap-1.5">
        <button
          aria-expanded={open}
          aria-label={`${title}: what it is set to`}
          /*
             No `data-row`. It marks a rule row for the keyboard walk, which
             steps a rule then the features it bit — and these bit nothing and
             have no features under them. Claiming one puts a stop in the walk
             that leads nowhere.
          */
          className="shrink-0 text-zinc-500 hover:text-zinc-200"
          onClick={() => setOpen((shown) => !shown)}
          type="button"
        >
          <CaretDownIcon className={`size-3 transition ${open ? '' : '-rotate-90'}`} />
        </button>

        <button
          className="min-w-0 flex-1 truncate text-left text-zinc-200"
          onClick={() => setOpen((shown) => !shown)}
          type="button"
        >
          {title}
        </button>

        <span className="shrink-0 rounded bg-zinc-800 px-1.5 py-0.5 text-2xs text-zinc-300">
          {state}
        </span>
      </div>

      {open ? (
        <div className="ml-5 mt-1 flex flex-col gap-1.5">
          <p className="text-2xs leading-4 text-zinc-500">{note}</p>
          {children}
        </div>
      ) : null}
    </li>
  )
}

export const PlanChoices = ({
  limits,
  refused,
  onChange,
}: {
  limits: PlanLimits | undefined
  /** How many faces the floor kept from a refused reading, on the last plan. */
  refused?: number
  onChange: (limits: PlanLimits) => void
}) => {
  const current: PlanLimits = limits ?? {}

  return (
    <>
      {/*
        The refusal.

        A band is the **worst rule that fired**, so a reading your own rules
        call `no go` could still win a face by averaging well across everything
        else. This is how a shop says no to that.
      */}
      <Card
        title="What is a no-go feature for op-planning?"
        state={current.worstBand ?? 'anything'}
        note="The worst band a reading may still be cut in. A last resort rather than a ban: one below the floor may still cut a face nothing else can reach, because leaving it uncut is not an improvement — it just can never take a face off a reading above the floor."
      >
        {refused === undefined ? null : (
          <p className={`text-2xs leading-4 ${refused === 0 ? 'text-zinc-600' : 'text-info'}`}>
            {refused === 0
              ? 'Nothing was refused on this part — either nothing fell below the floor, or nothing below it wanted a face.'
              : `${String(refused)} face${refused === 1 ? '' : 's'} were kept from a refused reading on this part.`}
          </p>
        )}
        <div role="group" aria-label="Worst band" className="flex flex-wrap items-center gap-1">
          {[undefined, ...BANDS_WORST_FIRST].map((band) => {
            const held = current.worstBand === band

            return (
              <button
                key={band ?? 'none'}
                type="button"
                /*
                 * Named for what pressing it does, not for the band alone. The
                 * bare band words are already buttons on this tab — the band
                 * filter over the rule list — and two controls with one
                 * accessible name is a control nothing can address.
                 */
                aria-label={band === undefined ? 'Cut anything' : `Will not cut ${band}`}
                aria-pressed={held}
                onClick={() => onChange({ ...current, worstBand: band })}
                className={`rounded border px-1.5 py-0.5 text-2xs font-semibold transition ${
                  held
                    ? 'border-info bg-info/20 text-info'
                    : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                }`}
              >
                {band ?? 'Anything'}
              </button>
            )
          })}
        </div>
      </Card>

      {/*
        May a feature come apart?

        A face belongs to several readings and only one may cut it — but the
        rest of those readings are still the right answer for their *other*
        faces. This replaced a scale over how much work an operation should do,
        which priced the same question in points and per cent and average faces
        when the question underneath was always a yes or no.
      */}
      <Card
        title="May the plan split a feature?"
        state={current.splitFeatures === false ? 'no' : 'yes'}
        note="A face belongs to several readings and only one may cut it. Splitting lets each face go to whatever cuts it best, with the reading it came from still cutting the rest. Off, a reading is taken whole or not at all — so one contested face costs it every face it covers, and they go to whatever smaller readings come after."
      >
        <div role="group" aria-label="Splitting a feature" className="flex flex-wrap gap-1">
          {(
            [
              { key: 'yes', label: 'May split', note: 'Each face to whatever cuts it best.' },
              {
                key: 'no',
                label: 'Whole or not at all',
                note: 'A reading is taken entire, so one contested face costs it every face it covers.',
              },
            ] as const
          ).map((option) => {
            const held = (current.splitFeatures !== false) === (option.key === 'yes')

            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={held}
                title={option.note}
                onClick={() => onChange({ ...current, splitFeatures: option.key === 'yes' })}
                className={`rounded border px-1.5 py-0.5 text-2xs font-semibold transition ${
                  held
                    ? 'border-info bg-info/20 text-info'
                    : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                }`}
              >
                {option.label}
              </button>
            )
          })}
        </div>
        <p className="text-2xs leading-4 text-zinc-500">
          A generator press can still override it for that run — this is the shop's usual answer,
          not a wall.
        </p>
      </Card>

      {/*
        Which of two defensible ways of ranking a reading leads.

        Not a price and not a threshold: a band is the *worst* rule that fired
        and a score is a weighted average of all of them, so the two genuinely
        disagree and a shop has to say which it means.
      */}
      <Card
        title="Rank a reading by its band, or by its score?"
        state={current.bandFirst === true ? 'by band' : 'by score'}
        note="A band is the worst rule that fired; a score averages all of them. Band first lets a refusal win a face; score first keeps every distinction inside a bucket, which five buckets throw away."
      >
        <div role="group" aria-label="How readings are ranked" className="flex flex-wrap gap-1">
          {(
            [
              {
                key: 'score',
                label: 'By score',
                note: 'Every distinction inside a bucket survives, and a reading one rule refuses can still win a face by averaging well.',
              },
              {
                key: 'band',
                label: 'By band',
                note: 'A refusal outranks a good average, and five buckets throw away every distinction inside one.',
              },
            ] as const
          ).map((option) => {
            const held = (current.bandFirst ?? false) === (option.key === 'band')

            return (
              <button
                key={option.key}
                type="button"
                aria-pressed={held}
                title={option.note}
                onClick={() => onChange({ ...current, bandFirst: option.key === 'band' })}
                className={`rounded border px-1.5 py-0.5 text-2xs font-semibold transition ${
                  held
                    ? 'border-info bg-info/20 text-info'
                    : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                }`}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </Card>
    </>
  )
}
