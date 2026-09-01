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
  diameterAt,
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
).map((mode) => ({ mode, label: mode === 'form tap' ? 'Form tap' : 'Cut tap' }))

/**
 * The offers are the smallest type in the box on purpose: two drill sizes and
 * a thread name have to sit on one line in a panel three hundred pixels wide,
 * and the line ran off the edge at the size the rest of the box uses (Paul,
 * 2026-09-01).
 */
const CHIP =
  'focus-visible:ring-info/60 rounded border px-1 py-0.5 text-[9px] leading-4 tracking-tight transition focus-visible:ring-1 focus-visible:outline-none'

export const ThreadPicker = ({ holeDiameter, mode, spec, onChange, unit }: ThreadPickerProps) => {
  /**
   * How far the model is from the size that reading expects, signed: `+` is a
   * hole drawn over it. Exactly on it says so rather than showing a zero.
   */
  const deviation = (millimetres: number): string => {
    const off = convertLength(millimetres, MODEL_UNIT, unit)
    const shown = off.toFixed(decimalsFor(unit))
    return Number(shown) === 0 ? 'exactly' : `${off > 0 ? '+' : '−'}${shown.replace('-', '')}`
  }
  const offered = threadOptions(holeDiameter, 2)
  const guesses = threadsFor(holeDiameter)

  return (
    <div className="mt-1.5 flex flex-col gap-1 border-t border-zinc-900 pt-1.5">
      {/*
        **Every number on this panel says what it is** (Paul, 2026-09-01: "it's
        not really clear what the boxes are showing — tap drill diameter,
        diameter of the modeled hole, what"). Three separate things were being
        shown as bare diameters: the hole the model draws, the thread that hole
        reads as, and the bore each way of making it starts from. So the first
        is labelled, the second is labelled, and each row carries how far the
        model is from the size that reading expects.
      */}
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-2xs font-semibold tracking-wide text-zinc-500 uppercase">Thread</span>
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

      <div className="text-2xs flex items-baseline justify-between gap-2 text-zinc-500">
        Modeled hole diameter:
        <span className="font-mono text-zinc-200">⌀{formatLength(holeDiameter, unit)}</span>
      </div>

      {/*
        **One control, and the suggestions are in it** (Paul, 2026-09-01: "only
        suggest threads in the drop down list — don't show the suggested thread
        spec at all, just the drop down"). Rows of chips over a select was two
        ways to answer one question, and the boxes took the top of a panel
        nobody should have to scroll. The threads the hole reads as are the
        first group in the list, each saying what it read as and by how much
        the model is off it.
      */}
      <label className="text-2xs mt-0.5 flex flex-col gap-0.5 text-zinc-500">
        Thread:
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
          {offered.length === 0 ? null : (
            <optgroup label="Suggested — what this hole reads as">
              {offered.map((each) => (
                <option key={each.spec.name} value={each.spec.name}>
                  {each.spec.name} — its {each.read},{' '}
                  {deviation(holeDiameter - diameterAt(each.spec, each.read))}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Every thread">
            {THREADS.map((each) => {
              const guess = guesses.find((one) => one.spec.name === each.name)
              return (
                <option key={each.name} value={each.name}>
                  {each.name}
                  {guess ? ` — its ${guess.read}` : ''}
                </option>
              )
            })}
          </optgroup>
        </select>
      </label>

      {/*
        **How it is made, and the bore that way starts from.** A form tap wants
        half a millimetre more hole than a cut tap on an M6, so the drill a
        choice implies is the thing worth printing beside it.
      */}
      {spec === null ? null : (
        <div className="flex items-center gap-1">
          <span className="text-2xs w-24 shrink-0 text-zinc-500">Made by:</span>
          {MAKING.map((way) => {
            const drill = drillFor(spec, way.mode)
            const on = mode === way.mode
            return (
              <button
                key={way.mode}
                type="button"
                aria-pressed={on}
                aria-label={`${spec.name} ${way.mode}`}
                title={
                  drill === null
                    ? `${spec.name}, ${way.mode}`
                    : `${spec.name}, ${way.mode} — starts from a ⌀${formatLength(drill, unit)} hole`
                }
                onClick={() => onChange({ mode: way.mode, spec })}
                className={classNames(
                  CHIP,
                  'min-w-0 flex-1 truncate whitespace-nowrap',
                  on
                    ? 'border-info/60 bg-info/15 text-info'
                    : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200',
                )}
              >
                {/*
                  **The name, not the bore** (Paul, 2026-09-01: "we should just
                  select cut tap or form tap, the numbers confuse the issue").
                  Three diameters were on screen at once — the modelled hole,
                  the cut-tap bore and the form-tap bore — and the two on the
                  buttons read as the sizes being chosen between. The bore each
                  one starts from is still in the title, and it is what the
                  drill list is judged against.
                */}
                {way.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
