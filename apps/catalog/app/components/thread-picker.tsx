import {
  MODEL_UNIT,
  convertLength,
  decimalsFor,
  formatLength,
  type Unit,
} from '@toolpath/domain/units'
import { classNames } from '@toolpath/domain/class-names'
import {
  HOLE_MODES,
  THREADS,
  drillFor,
  threadNamed,
  threadOptions,
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
 * **One row per thread it could be, and the ways to make it along it** (Paul,
 * 2026-09-01). Thread and method were two questions asked in sequence, which
 * is three rows of controls to answer one thing: *this hole is an M6, tapped*.
 * Now the row is the thread and the chips are the methods, each showing the
 * hole **it** starts from — a form tap wants half a millimetre more than a cut
 * tap on an M6, so the drill a choice implies is the thing worth printing
 * beside it.
 *
 * The full list is one small select underneath, for the hole that reads as
 * nothing or reads as the wrong thing.
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

/**
 * The ways to make a thread, in the order a shop reaches for them.
 *
 * Read off {@link HOLE_MODES}, so taking one out of the offer takes it out of
 * here too — thread milling went that way on 2026-09-01 (Paul).
 */
const MAKING: ReadonlyArray<{ mode: HoleMode; label: string }> = HOLE_MODES.filter(
  (mode) => mode !== 'plain',
).map((mode) => ({ mode, label: mode === 'form tap' ? 'form' : 'cut' }))

/**
 * The offers are the smallest type in the box on purpose: two drill sizes and
 * a thread name have to sit on one line in a panel three hundred pixels wide,
 * and the line ran off the edge at the size the rest of the box uses (Paul,
 * 2026-09-01).
 */
const CHIP =
  'focus-visible:ring-info/60 rounded border px-1 py-0.5 text-[9px] leading-4 tracking-tight transition focus-visible:ring-1 focus-visible:outline-none'

export const ThreadPicker = ({ holeDiameter, mode, spec, onChange, unit }: ThreadPickerProps) => {
  /** A drill size for a chip: no unit on it, because the row above says which. */
  const bare = (millimetres: number): string =>
    convertLength(millimetres, MODEL_UNIT, unit).toFixed(decimalsFor(unit))
  const offered = threadOptions(holeDiameter, 2)
  const guesses = threadsFor(holeDiameter)
  const likely = offered[0] ?? null

  return (
    <div className="mt-1.5 flex flex-col gap-1 border-t border-zinc-900 pt-1.5">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-2xs font-semibold tracking-wide text-zinc-500 uppercase">Thread</span>
        {likely !== null && spec === null ? (
          <span className="text-2xs text-info">
            ⌀{formatLength(holeDiameter, unit)} is {likely.spec.name}&rsquo;s {likely.read}
          </span>
        ) : (
          <span className="text-2xs text-zinc-600">⌀{formatLength(holeDiameter, unit)}</span>
        )}
        {spec === null ? null : (
          <button
            type="button"
            onClick={() => onChange({ mode: 'plain', spec: null })}
            className="text-2xs ml-auto text-zinc-500 underline-offset-2 hover:text-zinc-300 hover:underline"
          >
            plain hole
          </button>
        )}
      </div>

      {/* One row per thread: its name, then the three ways to make it, each
          marked with the hole that way starts from. */}
      {offered.map((each) => (
        <div key={each.spec.name} className="flex items-center gap-1">
          {/*
            **The reading, on the row it belongs to** (Paul, 2026-09-01). The
            line above says it for the likeliest thread; a row that does not
            say which of its three diameters the hole matched leaves somebody
            comparing a drill against a number whose meaning they have to
            remember.
          */}
          <span
            className="flex w-24 shrink-0 flex-col leading-tight"
            title={`⌀${formatLength(holeDiameter, unit)} is this thread's ${each.read}`}
          >
            <span className="truncate font-mono text-[11px] text-zinc-200">{each.spec.name}</span>
            <span className="truncate text-[9px] text-zinc-500">{each.read}</span>
          </span>
          {MAKING.map((way) => {
            const drill = drillFor(each.spec, way.mode)
            const on = spec?.name === each.spec.name && mode === way.mode
            return (
              <button
                key={way.mode}
                type="button"
                aria-pressed={on}
                aria-label={`${each.spec.name} ${way.mode}`}
                onClick={() => onChange({ mode: way.mode, spec: each.spec })}
                className={classNames(
                  CHIP,
                  'min-w-0 flex-1 truncate whitespace-nowrap',
                  on
                    ? 'border-info/60 bg-info/15 text-info'
                    : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200',
                )}
              >
                {way.label}
                {drill === null ? '' : ` ⌀${bare(drill)}`}
              </button>
            )
          })}
        </div>
      ))}

      {/*
        **The override is on show, not behind a link.** It read as a sentence
        somebody might click, which is not what a control looks like; labelled
        and standing over its own dropdown, it is obviously the way to say
        something the buttons cannot (Paul, 2026-09-01).
      */}
      <label className="text-2xs mt-0.5 flex flex-col gap-0.5 text-zinc-500">
        Manually spec thread:
        <select
          value={spec !== null && threadNamed(spec.name) ? spec.name : ''}
          onChange={(event) => {
            const chosen = threadNamed(event.target.value)
            onChange(
              chosen === null
                ? { mode: 'plain', spec: null }
                : { mode: mode === 'plain' ? 'cut tap' : mode, spec: chosen },
            )
          }}
          className="text-2xs focus-visible:ring-info/60 w-full rounded border border-zinc-800 bg-zinc-950 px-1.5 py-1 text-zinc-200 focus-visible:ring-1 focus-visible:outline-none"
        >
          <option value="">No thread — a plain hole</option>
          {THREADS.map((each) => {
            const guess = guesses.find((one) => one.spec.name === each.name)
            return (
              <option key={each.name} value={each.name}>
                {each.name}
                {guess ? ` — its ${guess.read}` : ''}
              </option>
            )
          })}
        </select>
      </label>
    </div>
  )
}
