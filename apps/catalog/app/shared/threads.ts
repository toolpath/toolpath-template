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
