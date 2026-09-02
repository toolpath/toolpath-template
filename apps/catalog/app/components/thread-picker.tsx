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
      {/*
        **The heading says what the hole is** (Paul, 2026-09-02: "when a hole is
        selected, it should say <Thread Spec> Threaded Hole instead of
        thread:plain"). A clear control used to sit here reading "plain hole",
        opposite the word THREAD, which read as a statement that the hole was
        plain — while an M3×0.5 was chosen underneath it. It has gone with the
        wording: the first option in the list below is "No thread — a plain
        hole", and one way to say a thing is enough (Paul, same day).
      */}
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-2xs font-semibold tracking-wide text-zinc-500 uppercase">
          {spec === null ? 'Thread' : `${spec.name} threaded hole`}
        </span>
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
        **Each way of making it, with the predrill it starts from** (Paul,
        2026-09-02: "we should show the expected cut and form tap drill for cut
        and form taps when a thread is selected from the drop down — it should
        show the cut and form tap options in rows with standard tap drill
        diameters for each").
        
        The numbers came off these controls on 2026-09-01, when they sat under
        a list of *suggested* threads and three diameters were on screen at
        once. With the thread settled they are the whole question: a cut tap
        and a form tap for the same thread want different holes — ⌀0.201 in
        against ⌀0.2244 in on a 1/4-20 — and the drill list is judged against
        whichever is chosen. Rows rather than chips, because each carries a
        figure and how far the model is from it.
      */}
      {spec === null ? null : (
        <div className="mt-0.5 flex flex-col gap-0.5">
          {/*
            **Column headings, because each row carries two figures** (Paul,
            2026-09-02: "the table needs a table for Standard Drill and
            Deviation from Modeled Diameter"). Two bare numbers to the right of
            "Cut tap" do not say which is the chart's and which is this hole's.
            *Predrill* rather than *drill*, because it is the hole made before
            the thread is (Paul, same day).
          */}
          <span className="text-[9px] flex items-end gap-2 px-1.5 tracking-wide text-zinc-600 uppercase">
            <span className="min-w-0 flex-1">Made by</span>
            <span className="w-20 text-right leading-tight">Standard predrill</span>
            <span className="w-16 shrink-0 text-right leading-tight">Deviation from modeled ⌀</span>
          </span>
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
                  'focus-visible:ring-info/60 flex items-baseline gap-2 rounded border px-1.5 py-1 text-left transition focus-visible:ring-1 focus-visible:outline-none',
                  on
                    ? 'border-info/60 bg-info/15 text-info'
                    : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200',
                )}
              >
                <span className="text-2xs min-w-0 flex-1 truncate">{way.label}</span>
                {drill === null ? null : (
                  <>
                    <span className="w-16 text-right font-mono text-[11px] whitespace-nowrap">
                      ⌀{formatLength(drill, unit)}
                    </span>
                    {/* How far the hole as modelled is from that drill. */}
                    <span className="w-20 shrink-0 text-right font-mono text-[10px] text-zinc-500">
                      {deviation(holeDiameter - drill)}
                    </span>
                  </>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
