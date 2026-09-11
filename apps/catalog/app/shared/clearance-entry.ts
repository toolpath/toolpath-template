import type { Margins } from '@toolpath/catalog-data'
import type { MeasuredRoom } from './assembly-gaps'

/**
 * Three numbers, any one of which may be the one a shop states.
 *
 * A stack, a feature and a length below the holder decide each other. Until
 * now the page picked one corner of that and printed it: the two clearances
 * were the sheet's knobs, fixed at 0.020 in and editable nowhere, and the
 * length below the holder was whatever those knobs made necessary. That
 * answers one question — "how far out do I have to set this tool" — and cannot
 * answer either of the two a machinist asks just as often: "what room do I
 * actually have at the length I set it up at", and "how far out would I have to
 * go to keep a thirty-thou wall off the holder".
 *
 * So all three are boxes, **one of them is the shop's and the other two follow
 * from it**, and every box says both numbers — what was entered, and what the
 * geometry gives back. The last field touched is the one that drives; the other
 * two are readings off the stack it produced.
 *
 * ## Which direction each edit solves in
 *
 * | Edited              | How the other two are reached                       |
 * | ------------------- | --------------------------------------------------- |
 * | Length below holder | measured: the room left at that length               |
 * | Axial clearance     | solved: the least length that leaves that much, then |
 * |                     | the radial room measured at it                       |
 * | Radial clearance    | the same, the other way about                        |
 *
 * Both directions already exist in `@toolpath/tool-support` and neither is
 * reimplemented here: `clearance().requiredStickout` solves, and
 * `assembly-gaps.ts` measures. This module is only which of them to ask, with
 * what, and what the three boxes then say — which is the part worth testing
 * without a catalog, a curve or a drawing in the room.
 *
 * ## A clearance is asked alone
 *
 * Entering an axial clearance solves for that clearance **and nothing else**:
 * the radial limit is dropped to nought for the solve, so the length that comes
 * back is the least that meets what was asked rather than the least that meets
 * what was asked and something else besides. Paul's rule (2026-09-11): the
 * other two adjust to the condition set by the edit. What the dropped limit
 * still does is mark its box — a radial room that lands under the sheet's own
 * figure says so, rather than being silently accepted because nobody typed it.
 */

/** Which of the three a shop stated. */
export type ClearanceField = 'below' | 'axial' | 'radial'

/** What a shop stated, in millimetres, or nothing while all three are the app's. */
export interface ClearanceEdit {
  readonly field: ClearanceField
  /** Millimetres, the basis everything downstream of a box is held in. */
  readonly value: number
}

/**
 * Float slack, in millimetres.
 *
 * A tenth of a micron: far under anything a shop can set a tool to and far
 * over the noise in a sweep of a few dozen segments, so a gap that meets its
 * limit exactly never reads as short.
 */
const SLACK = 1e-6

/**
 * Near enough that an entry counts as met, in millimetres.
 *
 * Two ten-thousandths of an inch — under the third decimal a box shows, and
 * comfortably over what {@link lengthFor} leaves behind when it stops halving.
 * Compared against {@link SLACK} it is enormous, and it has to be: a warning
 * that fires because a bisection landed a nanometre out is a warning nobody
 * can act on, and after the first one nobody reads the rest either.
 */
const MET = 0.005

/**
 * What to ask the stack for, given what was stated.
 *
 * Two answers rather than one, because the margins have two jobs and they are
 * not the same job. `solve` is what the length is worked out from — one axis
 * only, per the rule above. `margins` is what the drawing is told, so the
 * overlay's margin line and its verdict are drawn against the limits the boxes
 * are showing, both of them, rather than against the one being solved for.
 */
export interface ClearanceAsk {
  /** The length to draw at, or null to let the stack choose as it does today. */
  readonly stickout: number | null
  /** The limits the drawing and its verdict are held to. */
  readonly margins: Margins
  /** The limits the length was solved from: one axis, or the sheet's where nothing was stated. */
  readonly solve: Margins
}

/**
 * The least length below the holder that leaves a given room on one axis.
 *
 * **Not `clearance().requiredStickout`, and 2026-09-11 is the day that stopped
 * being a detail.** That function sweeps the *parametric* holder — a nose, a
 * body and a flange off the vendor's published table — and AGENTS.md § Vendor
 * Tool Data says in as many words that a holder record carries no silhouette.
 * `BT30-ER11-110DT` is the ordinary case rather than the awkward one: MariTool
 * publishes a taper, a gauge length and a collet series, and `null` for all
 * nine of the dimensions a sweep needs. Asked about that stack it answers
 *
 *     requiredStickout: null      checked: ["shank"]
 *
 * — the tool's own shank and nothing of what holds it. So an entered clearance
 * moved nothing at all, on every one of the 378 holders whose silhouette is
 * measured rather than stated (Paul, 2026-09-11: "I don't think it's reading
 * out the messaging").
 *
 * What answers is the profile that is *drawn*, through {@link lengthFor}. That
 * is also what makes the three boxes agree: the length is solved on the same
 * measurement the other two boxes are read from, so a met entry reads as met
 * instead of as a warning about a stack nobody could see.
 */
export type RequiredAt = (field: 'axial' | 'radial', wanted: number) => number | null

/**
 * The shortest length below the holder that leaves `wanted` room, by halving.
 *
 * The room a stack leaves rises with the length it is set out at — lift the
 * holder and everything it could foul lifts with it — so the answer is found by
 * bisection on the one measurement the boxes already read. Two ends are answers
 * in themselves rather than failures, and are what tells a stack that cannot be
 * set there from one that simply has not been:
 *
 * - the shortest the tool goes already leaves more than was asked, so there is
 *   no length that leaves exactly that much — the flutes have to clear the
 *   collet, and every length above that floor gives *more* room, not less;
 * - the longest it goes still leaves less, because past some length the tool's
 *   own shank is what the wall is nearest and lifting the holder stops helping.
 *
 * Both return the end they hit, so the stack is drawn at the closest it can get
 * and `ClearanceBox.held` says which way it missed.
 */
export const lengthFor = (
  wanted: number,
  bracket: { readonly min: number; readonly max: number },
  roomAt: (stickout: number) => number | null,
): number | null => {
  const atMax = roomAt(bracket.max)
  if (atMax === null) {
    return null
  }
  if (atMax < wanted) {
    return bracket.max
  }
  const atMin = roomAt(bracket.min)
  if (atMin !== null && atMin >= wanted) {
    return bracket.min
  }
  let low = bracket.min
  let high = bracket.max
  // 1e-4 mm is four microns: two orders under MET, so a solved length always
  // reads as having met what was asked, and forty halvings reach it from any
  // bracket a tool has.
  while (high - low > 1e-4) {
    const middle = (low + high) / 2
    const room = roomAt(middle)
    if (room !== null && room >= wanted) {
      high = middle
    } else {
      low = middle
    }
  }
  return high
}

export const askFor = (
  edit: ClearanceEdit | null,
  defaults: Margins,
  requiredAt: RequiredAt,
): ClearanceAsk => {
  if (edit === null) {
    return { stickout: null, margins: defaults, solve: defaults }
  }
  if (edit.field === 'below') {
    return { stickout: edit.value, margins: defaults, solve: defaults }
  }
  const solve: Margins =
    edit.field === 'axial' ? { axial: edit.value, radial: 0 } : { axial: 0, radial: edit.value }
  return {
    stickout: requiredAt(edit.field, edit.value),
    margins: { ...defaults, [edit.field]: edit.value },
    solve,
  }
}

/** One clearance box: what was asked of this axis, and what it gives. */
export interface ClearanceBox {
  /** What the shop typed here, or null while this box is the app's answer. */
  readonly entered: number | null
  /** The room measured at the drawn length, mm. Null where nothing was measured. */
  readonly value: number | null
  /** What this axis is being held to: what was typed, or the sheet's own figure. */
  readonly asked: number
  /** The measured room is under what this axis is held to. */
  readonly short: boolean
  /**
   * Stated, and the stack does not give exactly that — `'more'` where it gives
   * more room than was asked, `'less'` where it cannot give that much.
   *
   * **The number a shop typed is not always available** (Paul, 2026-09-11: "why
   * is it overriding some values I enter? I am entering 0.03 in and it is
   * jumping to 0.056 in"). Ask for a thirty-thou axial gap on a stack whose
   * shortest setting already leaves fifty-six, and there is no length that
   * gives thirty: the tool is floored where its flutes clear the collet, and
   * every length above that floor gives *more* room, not less. The same happens
   * the other way when clearing needs more than the tool can be set out at.
   *
   * **The box obeys the entry** (Paul, again, 2026-09-11: "it should always
   * obey the value I enter and revise the other two"). The number a shop typed
   * stays in the box it was typed into, whatever the stack then does; this is
   * what says the stack could not be set there, so the box is not lying about a
   * length it cannot reach. The other two boxes are read off the stack that was
   * actually drawn, which is the only thing they can honestly be.
   */
  readonly held: 'more' | 'less' | null
}

/** The length box, which is a length rather than a limit and marks differently. */
export interface BelowBox {
  readonly entered: number | null
  /** The length actually drawn, after the stack's own floor and ceiling. */
  readonly value: number | null
  /** A stated length the stack would not take, so the number beside it is not it. */
  readonly clamped: boolean
  /** What clearing the part needs is past what this tool can be set out at. */
  readonly overLimit: boolean
}

export interface ClearanceBoxes {
  readonly below: BelowBox
  readonly axial: ClearanceBox
  readonly radial: ClearanceBox
}

/**
 * What a box shows: the entry where there is one, and the reading otherwise.
 *
 * The whole of "obey the value I enter". A box that was typed into shows that
 * number for as long as it stands; every other box shows what the stack gives.
 */
export const shownIn = (box: ClearanceBox | BelowBox): number | null => box.entered ?? box.value

/** What the stack settled on, once its own floor and ceiling have had the ask. */
export interface DrawnLength {
  /** The length drawn, mm. */
  readonly stickout: number | null
  /** True when what clearing needs is more than the tool allows. */
  readonly overLimit: boolean
}

const boxFor = (
  field: 'axial' | 'radial',
  edit: ClearanceEdit | null,
  defaults: Margins,
  room: MeasuredRoom,
): ClearanceBox => {
  const entered = edit?.field === field ? edit.value : null
  const asked = entered ?? defaults[field]
  const value = room[field]
  const missed = entered !== null && value !== null && Math.abs(value - entered) > MET
  return {
    entered,
    value,
    asked,
    short: value !== null && value < asked - SLACK,
    held: missed && value !== null && entered !== null ? (value > entered ? 'more' : 'less') : null,
  }
}

/**
 * The three boxes, after the stack has answered.
 *
 * Asked last rather than as part of {@link askFor} because a stated length is
 * not necessarily the length drawn — the stack floors it at the flutes and caps
 * it at what the holder can still grip — and the room has to be measured at the
 * length that was actually drawn. A box showing the room at a length nobody is
 * looking at would be the worst of the three readings.
 */
export const boxesFor = (
  edit: ClearanceEdit | null,
  defaults: Margins,
  drawn: DrawnLength,
  room: MeasuredRoom,
): ClearanceBoxes => {
  const entered = edit?.field === 'below' ? edit.value : null
  return {
    below: {
      entered,
      value: drawn.stickout,
      clamped:
        entered !== null && drawn.stickout !== null && Math.abs(drawn.stickout - entered) > MET,
      overLimit: drawn.overLimit,
    },
    axial: boxFor('axial', edit, defaults, room),
    radial: boxFor('radial', edit, defaults, room),
  }
}

/**
 * The shortest length below the holder that clears on **both** axes, or null
 * where no length this tool can be set to does.
 *
 * A stated length that collides is the one case where the page knows the answer
 * and used to say only that something was wrong with the question: the axial
 * box read "under the 0.02 in wanted", which is a restatement of the sheet
 * rather than the number to type (Paul, 2026-09-11). This is that number.
 *
 * Both axes, unlike {@link askFor} — a stated *clearance* is solved alone,
 * because the box a shop just typed into has to drive; a stated *length* is
 * being held to everything the sheet asks, so the length that answers it is the
 * longer of the two, each axis rising with the length independently.
 *
 * The candidate is measured before it is offered. {@link lengthFor} answers the
 * far end of the bracket where nothing in it reaches — a deliberate "as close
 * as this stack gets" for the drawing, and a lie in a sentence telling somebody
 * to set a tool there — so a length that still does not clear comes back as
 * nothing to suggest at all.
 */
export const clearingLength = (
  asked: Margins,
  bracket: { readonly min: number; readonly max: number },
  roomAt: (stickout: number) => MeasuredRoom,
): number | null => {
  const axes = ['axial', 'radial'] as const
  /*
    An axis with nothing on it is no bar rather than a failure: `radial` is null
    on every feature with no wall standing taller than the cut, and its box says
    "nothing stands taller" instead of a number. Reading that as "no length
    clears" would leave the ordinary hole with nothing to suggest.
  */
  const lengths = axes
    .map((field) => lengthFor(asked[field], bracket, (at) => roomAt(at)[field]))
    .filter((length): length is number => length !== null)
  if (lengths.length === 0) {
    return null
  }
  const length = Math.max(...lengths)
  const room = roomAt(length)
  const clears = axes.every((field) => {
    const value = room[field]
    return value === null || value >= asked[field] - MET
  })
  return clears ? length : null
}
