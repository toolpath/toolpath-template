import { CaretDownIcon } from '@phosphor-icons/react'
import { useState } from 'react'

import { NumberBox } from './number-box'
import { outsideSizes } from '../shared/metrics'
import { formatLength } from '../shared/units'
import type { MachineEnvelope, MachineSizes, PlanLimits } from '../shared/rules'
import type { Unit } from '../shared/units'

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
    <li className="border-b border-edge/60 py-1.5 last:border-b-0">
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
          className="shrink-0 text-ink-dim hover:text-ink-strong"
          onClick={() => setOpen((shown) => !shown)}
          type="button"
        >
          <CaretDownIcon className={`size-3 transition ${open ? '' : '-rotate-90'}`} />
        </button>

        <button
          className="min-w-0 flex-1 truncate text-left text-ink-strong"
          onClick={() => setOpen((shown) => !shown)}
          type="button"
        >
          {title}
        </button>

        <span className="shrink-0 rounded bg-raised px-1.5 py-0.5 text-2xs text-ink-body">
          {state}
        </span>
      </div>

      {open ? (
        <div className="ml-5 mt-1 flex flex-col gap-1.5">
          <p className="text-2xs leading-4 text-ink-dim">{note}</p>
          {children}
        </div>
      ) : null}
    </li>
  )
}

const AXES = ['x', 'y', 'z'] as const

/**
 * One end of the sizes taken: three boxes that only mean something together.
 *
 * A machine is three numbers, and the comparison matches the part's sides to
 * them largest against largest — so two of the three is not a smaller answer,
 * it is no answer. An end counts as set once all three are filled, and emptying
 * any of them puts the end back to unsaid.
 *
 * That is why the half-filled triple lives here rather than in the rule set:
 * somebody typing the second of three numbers has not yet said anything the
 * judge could read, and writing it down would have the rule half-judging on it.
 * Re-keyed by the caller when a preset loads, which is the one time the stored
 * numbers change underneath.
 */
const SizeRow = ({
  end,
  label,
  hint,
  sizes,
  unit,
  onChange,
}: {
  end: 'min' | 'max'
  label: string
  hint: string
  sizes: MachineEnvelope | undefined
  unit: Unit
  onChange: (sizes: MachineEnvelope | undefined) => void
}) => {
  const [draft, setDraft] = useState<Partial<MachineEnvelope>>(() => sizes ?? {})

  const set = (axis: (typeof AXES)[number], value: number | undefined) => {
    const merged = { ...draft, [axis]: value }
    setDraft(merged)

    const { x, y, z } = merged
    const whole = typeof x === 'number' && typeof y === 'number' && typeof z === 'number'

    onChange(whole ? { x, y, z } : undefined)
  }

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-2xs text-ink-muted">{label}</span>
      <div className="flex items-end gap-1" role="group" aria-label={label}>
        {AXES.map((axis) => (
          <NumberBox
            key={axis}
            id={`machine-${end}-${axis}`}
            label={`${label}, ${axis.toUpperCase()}`}
            metric="partLongestSide"
            onChange={(value) => set(axis, value)}
            onClear={() => set(axis, undefined)}
            placeholder={axis.toUpperCase()}
            unit={unit}
            value={draft[axis]}
            width="w-16"
          />
        ))}
      </div>
      <p className="text-2xs leading-4 text-ink-faint">{hint}</p>
    </div>
  )
}

/** What the row says on its card, without opening it. */
const sizesState = (machine: MachineSizes | undefined): string => {
  if (machine?.min && machine.max) return 'both ends'
  if (machine?.max) return 'largest only'
  if (machine?.min) return 'smallest only'

  return 'any size'
}

export const PlanChoices = ({
  limits,
  refused,
  revision,
  unit,
  partSides,
  onChange,
}: {
  limits: PlanLimits | undefined
  /** The part on screen, measured off its mesh, or null before there is one. */
  partSides?: ReadonlyArray<number> | null
  /** How many faces the floor kept from a refused reading, on the last plan. */
  refused?: number
  /** Bumped when a preset loads, which re-keys the size boxes onto its numbers. */
  revision: number
  unit: Unit
  onChange: (limits: PlanLimits) => void
}) => {
  const current: PlanLimits = limits ?? {}
  const machine: MachineSizes = current.machine ?? {}

  const outside = partSides == null ? null : outsideSizes(partSides, current.machine)

  const setEnd = (end: 'min' | 'max', sizes: MachineEnvelope | undefined) => {
    const next: MachineSizes = { ...machine, [end]: sizes }
    const empty = !next.min && !next.max

    onChange({ ...current, ...(empty ? { machine: undefined } : { machine: next }) })
  }

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
          <p className={`text-2xs leading-4 ${refused === 0 ? 'text-ink-faint' : 'text-info'}`}>
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
                    : 'border-edge-strong text-ink-muted hover:border-edge-hover'
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
                    : 'border-edge-strong text-ink-muted hover:border-edge-hover'
                }`}
              >
                {option.label}
              </button>
            )
          })}
        </div>
        <p className="text-2xs leading-4 text-ink-dim">
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
                    : 'border-edge-strong text-ink-muted hover:border-edge-hover'
                }`}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </Card>

      {/*
        The sizes this shop takes, either end.

        A part outside them is not a feature problem — nothing about a pocket is
        wrong when the part itself is one nobody here would hold — so it is a
        part-wide answer sitting with the other two.

        Both ends unset until somebody says, and the rule stands down rather
        than judging against zero. It had no control at all before this, so the
        rule that reads it had never once fired.
      */}
      <Card
        title="What part sizes do you take?"
        state={sizesState(current.machine)}
        note="Three numbers at each end, because a machine is three numbers: a long thin part fits one a cube of the same length does not. The part is turned to suit, so its sides are matched to yours largest against largest, and how far it falls outside — either end — is what the rule reads."
      >
        {/*
          What the sizes just entered say about the part in front of you.

          A limit somebody types and cannot see the effect of is a limit they
          have to go and check somewhere else, which is where a shop stops
          trusting the number. Read through the same answer the rule reads, so
          the two cannot disagree.
        */}
        {partSides == null ? null : outside === null ? (
          <p className="text-2xs leading-4 text-ink-faint">
            Nothing is set, so nothing is judged. The part on screen is{' '}
            {partSides.map((side) => formatLength(side, unit)).join(' × ')}.
          </p>
        ) : (
          <p
            className={`rounded px-2 py-1 text-2xs leading-4 ${
              outside === 0 ? 'bg-success/10 text-success' : 'bg-warning/15 text-warning'
            }`}
          >
            {outside === 0
              ? `This part fits: ${partSides.map((side) => formatLength(side, unit)).join(' × ')}.`
              : `This part is ${formatLength(outside, unit)} outside what you take, at ${partSides
                  .map((side) => formatLength(side, unit))
                  .join(' × ')}.`}
          </p>
        )}
        <SizeRow
          end="min"
          hint="Under this, it is not worth setting up. Leave empty to take anything small."
          key={`min-${String(revision)}`}
          label="Smallest"
          onChange={(sizes) => setEnd('min', sizes)}
          sizes={machine.min}
          unit={unit}
        />
        <SizeRow
          end="max"
          hint="Over this, it does not go in the machine. Leave empty to take anything big."
          key={`max-${String(revision)}`}
          label="Largest"
          onChange={(sizes) => setEnd('max', sizes)}
          sizes={machine.max}
          unit={unit}
        />
      </Card>
    </>
  )
}
