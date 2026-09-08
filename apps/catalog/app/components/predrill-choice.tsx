import { Toggle, cn } from '@toolpath/ui'
import { XCircleIcon } from '@phosphor-icons/react'
import { convertLength, decimalsFor, formatLength, type UnitSystem } from '@toolpath/tool-support'
import { HOLE_MODES, drillFor, type HoleMode, type ThreadSpec } from 'shared/threads'

/**
 * Which hole the thread is started from: the tap drill, or the form drill.
 *
 * **It belongs beside the drills, not on the feature dialog** (Paul,
 * 2026-09-07: "we should no longer show the 'cut tap' and 'form tap' rows in
 * the feature dialog when applying threads to a hole — it should just return
 * the right tap drills"). Saying *this hole is an M6* and saying *and I will
 * roll the thread rather than cut it* are two decisions, and the second one is
 * only ever made while looking at the drills it decides. On the dialog it was
 * two rows of numbers between somebody and the thread they were choosing.
 *
 * **And it is two words, not two rows of figures** (Paul, 2026-09-07: "don't
 * show the numbers, just tap or form drill"). The predrill each starts from is
 * the *list underneath*, which prints every drill it admits with its own
 * deviation in the table's own columns; printing the chart figure and the
 * difference again up here said the same thing twice, in a control whose whole
 * question is which of two drills this is. What the numbers carried that the
 * list cannot is the one case where **neither** works — a predrill further from
 * the model than the shop's own drill deviation allows — so that survives as
 * the label in red under an `✗` carrying the figures on hover.
 *
 * **Ideally the tap would say** (Paul, same day: "it should be pulled from the
 * tap itself, but I don't think we have that data yet"). It cannot yet: a
 * catalog tool's `form` is `tap left hand` or `tap right hand`, and the vendor's
 * product line names the material rather than the method — EMUGE files cut and
 * cold-forming taps alike under *Rekord B-Z Taps*, *Steel Taps*, *VA Taps*. A
 * fact this control could read belongs upstream in `@toolpath/tool-scraper`,
 * beside the tests that would check it against each vendor's own pages; until
 * there is one, the shop says which.
 *
 * `ThreadPicker` is the other half: it says which thread, and nothing about how
 * it is made.
 */

/**
 * The two drills a thread can be started from, in the order a shop reaches for
 * them, named after the hole rather than the tool that makes it — the control
 * is a predrill and its options are predrills.
 *
 * Read off {@link HOLE_MODES}, so taking one out of the offer takes it out of
 * here too — thread milling went that way on 2026-09-01 (Paul).
 */
const MAKING: ReadonlyArray<{ mode: HoleMode; label: string }> = HOLE_MODES.filter(
  (mode) => mode !== 'plain',
).map((mode) => ({ mode, label: mode === 'form tap' ? 'Form drill' : 'Tap drill' }))

export interface PredrillChoiceProps {
  /** The thread the hole is for: there is no predrill to choose without one. */
  readonly spec: ThreadSpec
  readonly mode: HoleMode
  readonly onChange: (mode: HoleMode) => void
  /** The bore the model draws, in millimetres. */
  readonly holeDiameter: number
  /**
   * How far a drill may be from the hole, over and under, in millimetres: the
   * shop's own `max drill deviation`, which is what decides whether the model
   * can be read as this predrill at all.
   */
  readonly deviation: { readonly over: number; readonly under: number }
  readonly unit: UnitSystem
}

export const PredrillChoice = ({
  spec,
  mode,
  onChange,
  holeDiameter,
  deviation: band,
  unit,
}: PredrillChoiceProps) => {
  /**
   * How far the model is from the size that way of making it expects, signed:
   * `+` is a hole drawn over it. Exactly on it says so rather than showing a
   * zero. On the hover now rather than on the control.
   */
  const deviation = (millimetres: number): string => {
    const off = convertLength(millimetres, 'millimeters', unit)
    const shown = off.toFixed(decimalsFor(unit))
    return Number(shown) === 0 ? 'exactly on it' : `${off > 0 ? '+' : '−'}${shown.replace('-', '')}`
  }
  /**
   * **Whether the model can be read as this predrill at all.**
   *
   * `millimetres` is the hole less the predrill, so a predrill **over** the
   * hole is measured against `over`.
   */
  const past = (millimetres: number): boolean =>
    millimetres < -band.over - 1e-9 || millimetres > band.under + 1e-9

  return (
    <span className="flex items-center gap-1.5">
      <span className="text-2xs tracking-wide text-zinc-500 uppercase">Predrill</span>
      <Toggle
        value={mode}
        onValueChange={(next) => {
          if (next === 'cut tap' || next === 'form tap') {
            onChange(next)
          }
        }}
        size="sm"
        className="flex h-auto items-center gap-1 bg-transparent outline-none"
      >
        {MAKING.map((way) => {
          const drill = drillFor(spec, way.mode)
          const on = mode === way.mode
          const refused = drill !== null && past(holeDiameter - drill)
          /*
            The figures, on the hover: the chart size this starts from and how
            far the model is from it. Nobody reads them to press the button —
            the list underneath is the answer — and somebody checking why a
            drill list looks the way it does should not have to leave to find
            out what it was judged against.
          */
          const says =
            drill === null
              ? way.label
              : refused
                ? `⌀${formatLength(drill, unit)} — further from the modelled hole (${deviation(holeDiameter - drill)}) than the shop's max drill deviation allows (+${formatLength(band.over, unit)} / −${formatLength(band.under, unit)}): no standard drill makes both`
                : `⌀${formatLength(drill, unit)} — the modelled hole is ${deviation(holeDiameter - drill)}`
          return (
            <Toggle.Item
              key={way.mode}
              value={way.mode}
              className={cn(
                'flex items-center gap-1 rounded border px-1.5 py-1 text-left transition',
                on
                  ? 'border-info/60 bg-info/15 text-info'
                  : 'border-zinc-800 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200',
                /*
                  **The one state worth stopping on keeps its colour** (Paul,
                  2026-09-02, on the three states the tool table settled on).
                  The tick and the grey `i` annotated figures that are no longer
                  shown; red says something the list underneath cannot, which is
                  that this predrill is not a hole any standard drill makes from
                  the model as drawn.
                */
                refused ? 'text-danger' : '',
              )}
            >
              {/* The kit's toggle does not pass `title` through, so the hover
                  hangs on what it wraps. */}
              <span className="text-2xs whitespace-nowrap" title={says}>
                {way.label}
              </span>
              {refused ? <XCircleIcon aria-label={says} className="size-3 shrink-0" /> : null}
            </Toggle.Item>
          )
        })}
      </Toggle>
    </span>
  )
}
