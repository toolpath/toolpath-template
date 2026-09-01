import { formatLength, type Unit } from '@toolpath/domain/units'
import { classNames } from '@toolpath/domain/class-names'
import {
  HOLE_MODES,
  THREADS,
  drillFor,
  threadNamed,
  threadsFor,
  type HoleMode,
  type ThreadSpec,
} from 'shared/threads'

/**
 * How this hole is made, and for what thread.
 *
 * **The model does not say.** A threaded hole is drawn as a hole, usually at
 * the tap drill and sometimes at the minor or nominal size, so the thread is a
 * guess from the diameter that somebody confirms or overrides (Paul,
 * 2026-08-31). The guess says *what it read* — "M6×1, ⌀5.00 is its tap drill"
 * — because that is checkable and a bare "M6" is not.
 *
 * Four modes, because each starts from a different hole: a form tap wants four
 * tenths more than a cut tap on an M6, and a thread mill starts at the minor
 * diameter. The panel says which hole the mode drills, since that is the
 * number the drill list is then judged against.
 */
export interface ThreadPickerProps {
  /** The bore the model draws, in millimetres. */
  readonly holeDiameter: number
  readonly mode: HoleMode
  /** The thread it is for; null while the hole is plain. */
  readonly spec: ThreadSpec | null
  readonly onChange: (choice: { mode: HoleMode; spec: ThreadSpec | null }) => void
  readonly unit: Unit
}

const LABELS: Record<HoleMode, string> = {
  plain: 'Plain',
  'cut tap': 'Cut tap',
  'form tap': 'Form tap',
  'thread mill': 'Thread mill',
}

export const ThreadPicker = ({ holeDiameter, mode, spec, onChange, unit }: ThreadPickerProps) => {
  const guesses = threadsFor(holeDiameter)
  const best = guesses[0] ?? null
  const guessed = guesses.find((each) => each.spec.name === spec?.name) ?? null
  const drilled = spec === null ? null : drillFor(spec, mode)

  return (
    <div className="mt-2 flex flex-col gap-1.5 border-t border-zinc-900 pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-2xs font-semibold tracking-wide text-zinc-500 uppercase">Hole</span>
        <div className="flex flex-wrap gap-1">
          {HOLE_MODES.map((each) => (
            <button
              key={each}
              type="button"
              aria-pressed={mode === each}
              onClick={() =>
                onChange({
                  mode: each,
                  spec: each === 'plain' ? null : (spec ?? best?.spec ?? THREADS[0] ?? null),
                })
              }
              className={classNames(
                'text-2xs focus-visible:ring-info/60 rounded border px-2 py-0.5 transition focus-visible:ring-1 focus-visible:outline-none',
                mode === each
                  ? 'border-info/60 bg-info/15 text-info'
                  : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200',
              )}
            >
              {LABELS[each]}
            </button>
          ))}
        </div>
      </div>

      {spec === null ? null : (
        <>
          <select
            aria-label="Thread"
            value={threadNamed(spec.name) ? spec.name : ''}
            onChange={(event) => {
              const chosen = threadNamed(event.target.value)
              if (chosen) {
                onChange({ mode, spec: chosen })
              }
            }}
            className="focus-visible:ring-info/60 w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100 focus-visible:ring-1 focus-visible:outline-none"
          >
            {THREADS.map((each) => {
              const guess = guesses.find((one) => one.spec.name === each.name)
              return (
                <option key={each.name} value={each.name}>
                  {each.name}
                  {guess ? ` — ${guess.read} ⌀${formatLength(holeDiameter, unit)}` : ''}
                </option>
              )
            })}
          </select>
          <span className="text-2xs text-zinc-500">
            {guessed
              ? `Read from the hole: ⌀${formatLength(holeDiameter, unit)} is this thread's ${guessed.read}.`
              : `The hole is ⌀${formatLength(holeDiameter, unit)}.`}
            {drilled === null
              ? ''
              : ` A ${LABELS[mode].toLowerCase()} starts from ⌀${formatLength(drilled, unit)}.`}
          </span>
        </>
      )}
    </div>
  )
}
