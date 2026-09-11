import { Toggle, cn } from '@toolpath/ui'
import { convertLength, decimalsFor, formatLength, type UnitSystem } from '@toolpath/tool-support'
import { HOLE_MODES, drillFor, type HoleMode, type ThreadSpec } from 'shared/threads'
import { SECTION_LABEL } from 'shared/type'

/**
 * How the thread is made: cut, or formed.
 *
 * **It belongs beside the lists it decides, not on the feature dialog** (Paul,
 * 2026-09-07: "we should no longer show the 'cut tap' and 'form tap' rows in
 * the feature dialog when applying threads to a hole — it should just return
 * the right tap drills"). Saying *this hole is an M6* and saying *and I will
 * roll the thread rather than cut it* are two decisions, and the second one is
 * only ever made while looking at what it decides. On the dialog it was two
 * rows of numbers between somebody and the thread they were choosing.
 *
 * **Over both lists, because it decides both** (Paul, 2026-09-09: "I'd like Cut
 * Tap and Form Tap buttons to show up at the top of the table, like it does for
 * Drills in a tapped hole right now … these buttons should filter to show only
 * cut or form taps on the taps table, and for the correct diameter on the
 * drills table"). It sat over the drills alone while the tap list could not be
 * filtered by it — nothing on a tap said which kind it was. Now every tap
 * states it, so one control answers both stacks and the two cannot disagree:
 * pressing *Form Tap* over the taps sends the drill list to the form drill, and
 * pressing it over the drills leaves the form taps standing in the tap list.
 *
 * **And it is two words, not two rows of figures** (Paul, 2026-09-07: "don't
 * show the numbers, just tap or form drill"). The predrill each starts from is
 * the *list underneath*, which prints every drill it admits with its own
 * deviation in the table's own columns; printing the chart figure and the
 * difference again up here said the same thing twice, in a control whose whole
 * question is which of two drills this is. What the numbers carried that the
 * list cannot is the one case where **neither** works — a predrill further from
 * the model than the shop's own drill deviation allows — and that lives on the
 * hover too now.
 *
 * **Nothing here is marked** (Paul, 2026-09-09: "we also shouldn't show the X
 * on drills - if there are no drills, it should show 'no drills matching
 * predrill size, showing end mills'"). A red `✗` on the control said *no
 * standard drill makes this predrill from the model as drawn*, which was true
 * and was read as *this option is unavailable* — over a list of thirty-four
 * form taps, and over a drill list that end mills can still fill by boring the
 * hole. The list underneath is where that belongs, in words, beside the mills
 * that answer it: `routes/part.tsx` prints it and turns the mills on.
 *
 * **And the tap does say, as of 2026-09-09** (Paul, 2026-09-07: "it should be
 * pulled from the tap itself, but I don't think we have that data yet"). It is
 * pulled from the tap now: `@toolpath/tool-scraper` 2.4.0 records
 * `threadMethod` off each vendor's own category — EMUGE's `FG02`, *Cold forming
 * tap*, which is also where the catalog's only 1,432 forming taps come from —
 * so picking one in the tap list writes the mode this control shows, and this
 * control filters the list back. The shop still says which where nothing has
 * been picked; what has gone is its being the *only* thing that could say.
 *
 * `ThreadPicker` is the other half: it says which thread, and nothing about how
 * it is made.
 */

/**
 * The two ways a thread is made, in the order a shop reaches for them, named
 * after the **tap** rather than the hole under it.
 *
 * **"Form drill" is not a thing anybody asks for** (Paul, 2026-09-09: "the
 * 'form drill' term doesn't make a lot of sense, it's more that the appropriate
 * drill is defined by the type of tap"). The drill is a consequence: choose the
 * tap and the hole it starts from follows, on both lists and in that order. So
 * the words are the tap's on the drill list too, where they used to be the
 * hole's.
 *
 * Read off {@link HOLE_MODES}, so taking one out of the offer takes it out of
 * here too — thread milling went that way on 2026-09-01 (Paul).
 */
const MAKING: ReadonlyArray<{ mode: HoleMode; label: string }> = HOLE_MODES.filter(
  (mode) => mode !== 'plain',
).map((mode) => ({ mode, label: mode === 'form tap' ? 'Form Tap' : 'Cut Tap' }))

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
      {/*
        **The caption is the thread, not the hole** (Paul, 2026-09-09). Over the
        tap list "Predrill" would be naming the wrong list entirely, and over
        the drills it named the consequence rather than the decision — the same
        reason the two options are the tap's words now.
      */}
      <span className={SECTION_LABEL}>Thread</span>
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
              : past(holeDiameter - drill)
                ? `⌀${formatLength(drill, unit)} — further from the modelled hole (${deviation(holeDiameter - drill)}) than the shop's max drill deviation allows (+${formatLength(band.over, unit)} / −${formatLength(band.under, unit)}), so it is an end mill that bores it`
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
              )}
            >
              {/* The kit's toggle does not pass `title` through, so the hover
                  hangs on what it wraps. */}
              <span className="text-2xs whitespace-nowrap" title={says}>
                {way.label}
              </span>
            </Toggle.Item>
          )
        })}
      </Toggle>
    </span>
  )
}
