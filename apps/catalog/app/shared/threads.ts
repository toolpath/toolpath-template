/**
 * Thread specs, and reading one off a hole.
 *
 * **The drill sizes are the Engine's** (Paul, 2026-09-01: "what are we using
 * for tap, form, etc drill sizes? We should be using whatever Toolpath_UI and
 * Toolpath_Engine do"). They are copied from
 * `ToolpathPackages/ToolpathEngine/src/tap.jl` — `CUTTING_TAP_DRILLS` for a cut
 * tap and `FORMING_TAP_DRILLS` for a form tap, the latter being the Balax
 * Thredfloer 65 %-thread guide with the Jarvis formula `d − 0.44193 p` for the
 * sizes Balax does not list. They are **not** derived here: the form-tap rule
 * this file used before, `d − p/2`, agreed with the chart on M6×1 and M8×1.25
 * and disagreed on the ones that mattered — a #6-32 came out ⌀0.122 against the
 * chart's ⌀0.125, and M12×1.75 ⌀11.1 against ⌀11.2. Two cut-tap figures moved
 * with them: M8×1.25 is 6.7 and M10×1.25 is 8.7 in the Engine's chart.
 *
 * A row the Engine's chart does not hold carries the Jarvis figure, computed
 * once and written down here rather than at run time, so every number in this
 * table can be read against a published one.
 *
 * A threaded hole is modelled as a hole, and which thread it is for is not in
 * the model — so the application guesses from the diameter and lets somebody
 * say otherwise (Paul, 2026-08-31). **Usually a hole is modelled at the tap
 * drill**, sometimes at the minor diameter, occasionally at the nominal size;
 * all three are tried and what matched is said out loud, because "M6 because
 * ⌀5.00 is its tap drill" is checkable and "M6" is not.
 *
 * The table is nominal size, pitch and tap drill — the three numbers a shop
 * reads off a chart. The minor diameter is **derived**, `d − 1.0825 × p`,
 * which is ISO 68-1's basic minor diameter and the same arithmetic for a
 * unified thread once its pitch is `25.4 / tpi`. Deriving it keeps one number
 * per row that could be typed wrong instead of two.
 */

import type { ThreadMethod } from '@toolpath/catalog-data'
import { formatLength, type UnitSystem } from '@toolpath/tool-support'

export interface ThreadSpec {
  /** How it is written on a drawing: `M6×1`, `1/4-20 UNC`. */
  readonly name: string
  readonly family: 'metric' | 'unified'
  /** Nominal (major) diameter, in millimetres. */
  readonly major: number
  /** Pitch, in millimetres — for a unified thread, 25.4 / threads per inch. */
  readonly pitch: number
  /**
   * The drill a **cut** tap starts from, in millimetres — roughly 75 % of
   * thread, and the figure the Engine's `CUTTING_TAP_DRILLS` chart holds.
   */
  readonly tapDrill: number
  /**
   * The drill a **form** tap starts from, in millimetres.
   *
   * A roll tap displaces metal into the crest instead of cutting it away, so
   * it starts from a bigger hole and has a chart of its own — the Engine's
   * `FORMING_TAP_DRILLS`, which is the Balax Thredfloer 65 %-thread guide with
   * the Jarvis formula (`d − 0.44193 p`) where Balax lists nothing.
   */
  readonly form: number
}

/** Basic minor diameter: ISO 68-1's `d − 1.0825 p`, and the same for unified. */
export const minorOf = (spec: ThreadSpec): number =>
  Math.round((spec.major - 1.0825 * spec.pitch) * 1000) / 1000

const inch = (value: number) => Math.round(value * 25.4 * 1000) / 1000

/**
 * The threads a shop meets. Coarse first within a size, because a drawing that
 * does not say is coarse.
 */
export const THREADS: ReadonlyArray<ThreadSpec> = [
  { name: 'M2×0.4', family: 'metric', major: 2, pitch: 0.4, tapDrill: 1.6, form: 1.85 },
  { name: 'M2.5×0.45', family: 'metric', major: 2.5, pitch: 0.45, tapDrill: 2.05, form: 2.3 },
  { name: 'M3×0.5', family: 'metric', major: 3, pitch: 0.5, tapDrill: 2.5, form: 2.8 },
  { name: 'M4×0.7', family: 'metric', major: 4, pitch: 0.7, tapDrill: 3.3, form: 3.7 },
  { name: 'M5×0.8', family: 'metric', major: 5, pitch: 0.8, tapDrill: 4.2, form: 4.6 },
  { name: 'M5×0.5', family: 'metric', major: 5, pitch: 0.5, tapDrill: 4.5, form: 4.779 },
  { name: 'M6×1', family: 'metric', major: 6, pitch: 1, tapDrill: 5, form: 5.5 },
  { name: 'M6×0.75', family: 'metric', major: 6, pitch: 0.75, tapDrill: 5.25, form: 5.669 },
  { name: 'M8×1.25', family: 'metric', major: 8, pitch: 1.25, tapDrill: 6.7, form: 7.4 },
  { name: 'M8×1', family: 'metric', major: 8, pitch: 1, tapDrill: 7, form: 7.5 },
  { name: 'M10×1.5', family: 'metric', major: 10, pitch: 1.5, tapDrill: 8.5, form: 9.3 },
  { name: 'M10×1.25', family: 'metric', major: 10, pitch: 1.25, tapDrill: 8.7, form: 9.4 },
  { name: 'M10×1', family: 'metric', major: 10, pitch: 1, tapDrill: 9, form: 9.5 },
  { name: 'M12×1.75', family: 'metric', major: 12, pitch: 1.75, tapDrill: 10.2, form: 11.2 },
  { name: 'M12×1.5', family: 'metric', major: 12, pitch: 1.5, tapDrill: 10.5, form: 11.337 },
  { name: 'M12×1.25', family: 'metric', major: 12, pitch: 1.25, tapDrill: 10.8, form: 11.5 },
  { name: 'M14×2', family: 'metric', major: 14, pitch: 2, tapDrill: 12, form: 13.0 },
  { name: 'M16×2', family: 'metric', major: 16, pitch: 2, tapDrill: 14, form: 15.0 },
  { name: 'M16×1.5', family: 'metric', major: 16, pitch: 1.5, tapDrill: 14.5, form: 15.25 },
  { name: 'M20×2.5', family: 'metric', major: 20, pitch: 2.5, tapDrill: 17.5, form: 18.895 },
  { name: 'M20×1.5', family: 'metric', major: 20, pitch: 1.5, tapDrill: 18.5, form: 19.337 },
  {
    name: '#4-40 UNC',
    family: 'unified',
    major: inch(0.112),
    pitch: 25.4 / 40,
    tapDrill: inch(0.089),
    form: inch(0.0995),
  },
  {
    name: '#6-32 UNC',
    family: 'unified',
    major: inch(0.138),
    pitch: 25.4 / 32,
    tapDrill: inch(0.1065),
    form: inch(0.125),
  },
  {
    name: '#8-32 UNC',
    family: 'unified',
    major: inch(0.164),
    pitch: 25.4 / 32,
    tapDrill: inch(0.136),
    form: inch(0.1495),
  },
  {
    name: '#10-24 UNC',
    family: 'unified',
    major: inch(0.19),
    pitch: 25.4 / 24,
    tapDrill: inch(0.1495),
    form: inch(0.1719),
  },
  {
    name: '#10-32 UNF',
    family: 'unified',
    major: inch(0.19),
    pitch: 25.4 / 32,
    tapDrill: inch(0.159),
    form: inch(0.177),
  },
  {
    name: '1/4-20 UNC',
    family: 'unified',
    major: inch(0.25),
    pitch: 25.4 / 20,
    tapDrill: inch(0.201),
    form: inch(0.2244),
  },
  {
    name: '1/4-28 UNF',
    family: 'unified',
    major: inch(0.25),
    pitch: 25.4 / 28,
    tapDrill: inch(0.213),
    form: inch(0.234),
  },
  {
    name: '5/16-18 UNC',
    family: 'unified',
    major: inch(0.3125),
    pitch: 25.4 / 18,
    tapDrill: inch(0.257),
    form: inch(0.2874),
  },
  {
    name: '5/16-24 UNF',
    family: 'unified',
    major: inch(0.3125),
    pitch: 25.4 / 24,
    tapDrill: inch(0.272),
    form: inch(0.2913),
  },
  {
    name: '3/8-16 UNC',
    family: 'unified',
    major: inch(0.375),
    pitch: 25.4 / 16,
    tapDrill: inch(0.3125),
    form: inch(0.348),
  },
  {
    name: '3/8-24 UNF',
    family: 'unified',
    major: inch(0.375),
    pitch: 25.4 / 24,
    tapDrill: inch(0.332),
    form: inch(0.35433),
  },
  {
    name: '7/16-14 UNC',
    family: 'unified',
    major: inch(0.4375),
    pitch: 25.4 / 14,
    tapDrill: inch(0.368),
    form: inch(0.404),
  },
  {
    name: '1/2-13 UNC',
    family: 'unified',
    major: inch(0.5),
    pitch: 25.4 / 13,
    tapDrill: inch(0.4219),
    form: inch(0.4646),
  },
  {
    name: '1/2-20 UNF',
    family: 'unified',
    major: inch(0.5),
    pitch: 25.4 / 20,
    tapDrill: inch(0.4531),
    form: inch(0.476),
  },
  {
    name: '5/8-11 UNC',
    family: 'unified',
    major: inch(0.625),
    pitch: 25.4 / 11,
    tapDrill: inch(0.5312),
    form: inch(0.5781),
  },
  {
    name: '3/4-10 UNC',
    family: 'unified',
    major: inch(0.75),
    pitch: 25.4 / 10,
    tapDrill: inch(0.6562),
    form: inch(0.7031),
  },
]

/** Which of a spec's three diameters the hole was modelled at. */
export type ThreadRead = 'tap drill' | 'minor' | 'nominal'

/**
 * What a reading is called where somebody reads it.
 *
 * `nominal` and `minor` are the *diameter* by those names, and a list that
 * says only "nominal" reads as an adjective with its noun missing. `tap drill`
 * is already the name of a thing (Paul, 2026-09-02: "just 'tap drill' or
 * 'nominal diameter', etc").
 */
export const readLabel = (read: ThreadRead): string =>
  read === 'tap drill' ? 'tap drill' : `${read} diameter`

export interface ThreadGuess {
  readonly spec: ThreadSpec
  /** What the hole diameter matched. */
  readonly read: ThreadRead
  /** How far off it was, in millimetres. */
  readonly off: number
}

/**
 * The diameter a thread is drawn at under one reading of the model.
 *
 * The three sizes a tapped hole is drawn at, in one place, so the panel can
 * say what a hole *should* be and how far off it is rather than only which
 * name the guess landed on (Paul, 2026-09-01).
 */
export const diameterAt = (spec: ThreadSpec, read: ThreadRead): number =>
  read === 'tap drill' ? spec.tapDrill : read === 'minor' ? minorOf(spec) : spec.major

/** How close a hole has to be to count as modelled at that diameter, in mm. */
const WITHIN = 0.2

/**
 * Read first, then the rest: a hole is modelled at the tap drill far more
 * often. The minor diameter is `0.0825 p` under it — a twentieth of a
 * millimetre on an M6 — so a hole at either reads as the tap drill, and the
 * minor reading is listed as the same answer said another way.
 */
const ORDER: Record<ThreadRead, number> = { 'tap drill': 0, minor: 1, nominal: 2 }

/**
 * What thread this hole might be for, likeliest first.
 *
 * Every reading of every spec within {@link WITHIN}, sorted by which reading it
 * is and then by how close — so an exact tap drill beats a near minor, and the
 * caller can show the rest as the alternatives they are.
 */
export const threadsFor = (
  holeDiameter: number,
  specs: ReadonlyArray<ThreadSpec> = THREADS,
): Array<ThreadGuess> => {
  const guesses: Array<ThreadGuess> = []
  for (const spec of specs) {
    for (const read of THREAD_READS) {
      const at = diameterAt(spec, read)
      const off = Math.round(Math.abs(holeDiameter - at) * 1000) / 1000
      if (off <= WITHIN) {
        guesses.push({ spec, read, off })
      }
    }
  }
  return guesses.sort(
    (a, b) => ORDER[a.read] - ORDER[b.read] || a.off - b.off || a.spec.major - b.spec.major,
  )
}

/**
 * The threads to offer for this hole, likeliest first — **one line per thread**.
 *
 * `threadsFor` lists every reading, and a spec often matches on two of them:
 * the minor diameter is a twentieth of a millimetre under the tap drill, so
 * one hole reads as both and the same thread appears twice. Offered as two
 * buttons that is a choice between identical answers; offered as one, with the
 * likelier reading named, it is the question somebody can actually answer.
 *
 * Three at most. Beyond that they are threads nobody would look at, and the
 * full list is a dropdown away (Paul, 2026-09-01).
 */
export const threadOptions = (
  holeDiameter: number,
  limit = 3,
  specs: ReadonlyArray<ThreadSpec> = THREADS,
): Array<ThreadGuess> => {
  const seen = new Set<string>()
  const kept: Array<ThreadGuess> = []
  for (const guess of threadsFor(holeDiameter, specs)) {
    if (seen.has(guess.spec.name)) {
      continue
    }
    seen.add(guess.spec.name)
    kept.push(guess)
    if (kept.length === limit) {
      break
    }
  }
  return kept
}

/** The readings a hole can be modelled at, in the order they are offered. */
const THREAD_READS: ReadonlyArray<ThreadRead> = ['tap drill', 'minor', 'nominal']

/** A spec by the name it is written by, for a choice somebody made. */
export const threadNamed = (
  name: string,
  specs: ReadonlyArray<ThreadSpec> = THREADS,
): ThreadSpec | null => specs.find((each) => each.name === name) ?? null

/**
 * What a hole is called once a thread has been applied to it.
 *
 * **A threaded hole is not called what a plain one is** (Paul, 2026-09-08: "once
 * a thread is applied to a hole, the feature should be named '<thread spec>
 * <type of hole> Hole'"). The list said `Blind Hole` whether the hole was a
 * clearance hole or an M8×1.25 — the one fact that decides which tool cuts it,
 * kept in a combobox somebody had to select the row to read.
 *
 * The kernel's own name for the hole is kept and the spec goes in front of it,
 * so `Blind Hole` becomes `M8×1.25 Blind Hole` and the row still says what kind
 * of hole it is. Plain holes are unchanged: a spec is the whole of what makes a
 * hole threaded, which is the same test the rest of the page uses for it.
 */
export const threadedName = (name: string, spec: ThreadSpec | null): string =>
  spec === null ? name : `${spec.name} ${name}`

/**
 * How the thread gets made, which decides the hole it starts from.
 *
 * A shop drills a different size for each (Paul, 2026-08-31), and the
 * difference is not small: a form tap wants a hole four tenths *bigger* than a
 * cut tap on an M6, because it displaces the metal rather than cutting it
 * away, and starting it at a cut-tap size snaps the tap.
 */
export type HoleMode = 'plain' | 'cut tap' | 'form tap' | 'thread mill'

/**
 * The ways a thread is offered, in the order a shop reaches for them.
 *
 * **Thread milling is out for now** (Paul, 2026-09-01). The type still carries
 * it and `drillFor` still knows the minor diameter it starts from, so it is a
 * line in this list away from coming back; what has gone is the offer, which
 * was a third chip on every thread and a tool nobody here is buying yet.
 */
export const HOLE_MODES: ReadonlyArray<HoleMode> = ['plain', 'cut tap', 'form tap']

/**
 * The hole to drill before the thread is made, in millimetres.
 *
 * Both are chart figures the spec carries, copied from the Engine:
 *
 * - **cut tap** — `CUTTING_TAP_DRILLS`. The flutes cut the crest away, so the
 *   hole starts near the minor diameter.
 * - **form tap** — `FORMING_TAP_DRILLS`. A roll tap pushes metal up into the
 *   crest instead of cutting it, so it starts from a bigger hole.
 * - **thread mill** — the basic minor diameter. The mill cuts the whole form
 *   from a hole that is already the thread's inside size.
 */
export const drillFor = (spec: ThreadSpec, mode: HoleMode): number | null => {
  switch (mode) {
    case 'plain':
      return null
    case 'cut tap':
      return spec.tapDrill
    case 'form tap':
      return spec.form
    case 'thread mill':
      return minorOf(spec)
  }
}

/** What the second half of the list offers for each mode. */
export const makerOf = (mode: HoleMode): 'tap' | 'thread mill' | null =>
  mode === 'plain' ? null : mode === 'thread mill' ? 'thread mill' : 'tap'

/**
 * Which kind of tap the mode is asking for, in the catalog's own word.
 *
 * **One choice, read by both lists** (Paul, 2026-09-09: "if I select a cut tap
 * first, drills for the cut tap should be selected when I go to the drills
 * page"). Cut tap and form tap are the same decision whichever list is on
 * screen — the taps it admits and the predrill it sends the drills to are two
 * consequences of it, not two settings — so the mode is where it is kept and
 * this is the one translation into what a tool states about itself.
 *
 * `null` for a mode no tap makes: a plain hole and a thread mill are both
 * "every tap, because none of them is the question".
 */
export const methodOf = (mode: HoleMode): ThreadMethod | null =>
  mode === 'cut tap' ? 'cutting' : mode === 'form tap' ? 'forming' : null

/**
 * The mode a tap puts the hole in, read back off the tool.
 *
 * The other direction of {@link methodOf}, and what makes picking a tap decide
 * the drills: a form tap in the stack means the hole is rolled, so the drill
 * list under it is the form drill's. A tap stating no method leaves the mode
 * alone — silence is not a claim, and a store scraped before
 * `@toolpath/tool-scraper` 2.4.0 is silent about every tap it holds.
 */
export const modeFor = (method: ThreadMethod | null | undefined): HoleMode | null =>
  method === 'cutting' ? 'cut tap' : method === 'forming' ? 'form tap' : null

/**
 * What the drill list was swept on, in the words the tap list uses.
 *
 * **Two lists, two numbers** (Paul, 2026-09-09: "in drills, the highlighted
 * message should show the tap or form drill size (the predrill size) it is
 * looking for the applied thread with the selected tap type"). The taps are
 * matched on the thread's nominal size and the drills on the predrill under it
 * — ⌀0.089 in against ⌀0.0995 in on a #4-40 — and the drill list carried the
 * tap's number, which is a diameter no row in it is anywhere near.
 *
 * The tap is what names it, not the hole: a *form tap's predrill*, because the
 * drill follows from the tap and not the other way round.
 */
/**
 * What the tap list was swept on: the thread's own diameter.
 *
 * **The number is labelled, like the drill list's is** (Paul, 2026-09-09: "for
 * the taps, it should say 'matched on 0.112\" thread diameter'"). A bare
 * diameter over a list is a number somebody has to work out the meaning of, and
 * the two lists of a threaded hole are swept on two different ones — so each
 * says which of them it is.
 *
 * The pitch clause stays: a tap's pitch is in its catalog number in a different
 * shape for every brand and is nowhere in this dataset as a number, so an
 * M8×1.25 and an M8×1 are both offered and the choice is the person's.
 * {@link tapsFor} is where that is true; this is where it is said.
 */
export const threadNote = (spec: ThreadSpec, unit: UnitSystem): string =>
  `matched on ⌀${formatLength(spec.major, unit)} thread diameter — this catalog holds no pitch, so check it`

/**
 * What the drill list says when no drill in the catalog makes the predrill.
 *
 * **An empty list is replaced by what can actually make the hole** (Paul,
 * 2026-09-09: "if there are no drills, it should show 'no drills matching
 * predrill size, showing end mills', automatically show end mills that could
 * bore the predrill diameter … It should also show closest miss drills by
 * default"). A hole modelled at the cut tap's size has no drill at the form
 * tap's, and a shop still makes it — by interpolating with an end mill, which
 * is a tool this catalog holds hundreds of at that size.
 *
 * So the sentence names the number that came up empty and says what is standing
 * in, and `routes/part.tsx` turns those mills on in the Type filter where they
 * can be seen and turned off again.
 *
 * **It says the mills only where there are mills** (Paul, 2026-09-09: "I have
 * clicked the check after adding end mills to the filter list. None are being
 * shown"). The sentence claimed them whatever the list held, and a shop reading
 * a table of eight drills under a note about end mills is being told the
 * catalog holds none — which was never what happened.
 *
 * @param mills whether an end mill is on the list this sentence sits over
 */
export const millStandInNote = (
  spec: ThreadSpec,
  mode: HoleMode,
  unit: UnitSystem,
  mills: boolean,
): string => {
  const drill = drillFor(spec, mode)
  const standing = mills
    ? 'showing end mills that can bore it, and the closest drills'
    : 'showing the closest drills'
  const tap = mode === 'form tap' ? 'form tap' : 'cut tap'
  return drill === null
    ? `no drill matches this hole — ${standing}`
    : `no drill matches the ⌀${formatLength(drill, unit)} ${tap} predrill — ${standing}`
}

export const predrillNote = (spec: ThreadSpec, mode: HoleMode, unit: UnitSystem): string => {
  const drill = drillFor(spec, mode)
  if (drill === null) {
    return 'no predrill: this hole is not threaded'
  }
  const tap = mode === 'form tap' ? 'form tap' : 'cut tap'
  return `matched on ⌀${formatLength(drill, unit)} — the ${tap}'s predrill for ${spec.name}`
}

/**
 * A thread name reduced to what somebody typing it means.
 *
 * A shop writes one thread half a dozen ways — `M6x1`, `M6 × 1`, `#10-32`,
 * `10 32`, `1/4-20`, `1/420` — and none of them is the string in the table. So
 * both sides lose their case, their multiplication sign and every separator,
 * and what is left is compared. `.` survives because it is the difference
 * between `M12×1.25` and `M12×1.5`, not punctuation between two numbers.
 */
const searchKey = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[×✕✖x]/g, 'x')
    .replace(/[^a-z0-9.]/g, '')

/**
 * Whether typed text asks for this thread, or for anything else in the list.
 *
 * **The list is longer than a shop scrolls** (Paul, 2026-09-09: "I need to be
 * able to either select from the list we have now or enter text to search the
 * list and select from it"). Thirty-seven threads is a scroll past the ones a
 * hole reads as, so the box takes text as well — and typing `1/4` finds
 * `1/4-20 UNC` where typing it into a list of names would not.
 *
 * Substring rather than prefix, because `unc` and `32` are both ways somebody
 * narrows this list, and neither starts a name.
 */
export const matchesThreadSearch = (query: string, text: string): boolean =>
  searchKey(text).includes(searchKey(query))

/** The threads that text asks for, in the table's own order. Empty text asks for all. */
export const threadsMatching = (
  query: string,
  specs: ReadonlyArray<ThreadSpec> = THREADS,
): Array<ThreadSpec> => specs.filter((each) => matchesThreadSearch(query, each.name))
