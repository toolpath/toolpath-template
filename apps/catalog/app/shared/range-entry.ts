import { convertLength, type UnitSystem } from '@toolpath/tool-support'
import type { RangeKind } from './column-filters'

/**
 * What somebody typed into a number filter, read as the ends it states.
 *
 * **The operator is typed, not chosen** (Paul, 2026-09-11: "it's weird showing
 * the drop down then having to enter text"). Narrowing Diameter to "at least
 * 6" used to cost four presses before the first keystroke: the funnel, the
 * operator list, the operator, and the box that only then existed. The list is
 * gone and the two ends are always on screen, so the shortest way to ask is to
 * type — and everything the list used to offer is still sayable, in the
 * shorthand a shop already writes on a traveller: `6-12`, `>6`, `<12`, `=6`.
 *
 * A box also reads what belongs to the *other* box. `<12` typed into the lower
 * one states a maximum, and `6-12` states both; {@link readRange} is what puts
 * each number where it belongs, and the control writes the boxes back out once
 * the entry is finished. That is why this states the ends it found rather than
 * a value: which end a number is, is the question.
 *
 * Every number is returned in millimetres, the basis the dataset is stored in,
 * exactly as `ToolQuery.ranges` holds it.
 */
export interface Entry {
  readonly min?: number
  readonly max?: number
}

/** Which end a bare number is, which is simply the box it was typed into. */
export type Side = 'min' | 'max'

/** An entry with nothing said about an end left out rather than set undefined. */
const ends = (min: number | undefined, max: number | undefined): Entry => ({
  ...(min === undefined ? {} : { min }),
  ...(max === undefined ? {} : { max }),
})

/**
 * The unit a number names for itself, which overrules the one being read in.
 *
 * A shop reading in millimetres still knows a tool as a quarter inch, and
 * `1/4"` is how that gets typed. The suffix is the whole of the override: with
 * none, the number means whatever the page is set to.
 */
const INCHES = /(?:"|”|in|inch|inches)$/
const MILLIMETRES = /(?:mm|millimeters?|millimetres?)$/

/** Degrees, which are degrees in either unit and convert to nothing. */
const DEGREES = /(?:°|deg|degs|degrees?)$/

/**
 * A number, a fraction, or a mixed number.
 *
 * `1/4` and `1 1/2` are drill sizes as a machinist says them, and a box that
 * only took decimals made somebody divide in their head to ask about a tool
 * the vendor names in eighths.
 */
const MIXED = /^(\d+)\s+(\d+)\s*\/\s*(\d+)$/
const FRACTION = /^(\d+)\s*\/\s*(\d+)$/

const readMagnitude = (text: string): number | undefined => {
  if (text === '') {
    return undefined
  }
  const mixed = MIXED.exec(text)
  if (mixed !== null) {
    const over = Number(mixed[3])
    return over === 0 ? undefined : Number(mixed[1]) + Number(mixed[2]) / over
  }
  const fraction = FRACTION.exec(text)
  if (fraction !== null) {
    const over = Number(fraction[2])
    return over === 0 ? undefined : Number(fraction[1]) / over
  }
  const plain = Number(text)
  // `Number('')` is nought, which is why the empty text is turned away above.
  return Number.isFinite(plain) ? plain : undefined
}

/** One number in the dataset's own millimetres, or nothing while it is not one. */
const readNumber = (raw: string, unit: UnitSystem, kind: RangeKind): number | undefined => {
  const text = raw.trim()
  if (kind !== 'length') {
    // A count converts to nothing and an angle is degrees in either unit; the
    // suffix is allowed and dropped so that `118°` is the number it looks like.
    return readMagnitude(text.replace(DEGREES, '').trim())
  }
  if (INCHES.test(text)) {
    const value = readMagnitude(text.replace(INCHES, '').trim())
    return value === undefined ? undefined : convertLength(value, 'inches', 'millimeters')
  }
  if (MILLIMETRES.test(text)) {
    return readMagnitude(text.replace(MILLIMETRES, '').trim())
  }
  const value = readMagnitude(text)
  return value === undefined ? undefined : convertLength(value, unit, 'millimeters')
}

/**
 * The marks a range is written with, in the order they are looked for.
 *
 * A bare `-` is last because it is also the leading mark of `-12`, which is
 * how "up to 12" gets typed: no dimension in this catalog is negative, so a
 * minus at the front is an open lower end rather than a sign.
 */
const SEPARATORS: ReadonlyArray<string> = ['..', '–', '—', ' to ', '-']

const splitRange = (text: string): readonly [string, string] | null => {
  for (const mark of SEPARATORS) {
    const at = text.indexOf(mark)
    if (at === -1) {
      continue
    }
    // `6e-3` is one number rather than a range from `6e` to `3`.
    if (mark === '-' && at > 0 && text[at - 1] === 'e') {
      continue
    }
    return [text.slice(0, at).trim(), text.slice(at + mark.length).trim()]
  }
  return null
}

/**
 * The comparisons, longest mark first so `>=` is never read as `>` and a
 * stray `=`.
 */
const COMPARISONS: ReadonlyArray<{ readonly mark: string; readonly states: Side | 'both' }> = [
  { mark: '>=', states: 'min' },
  { mark: '=>', states: 'min' },
  { mark: '≥', states: 'min' },
  { mark: '>', states: 'min' },
  { mark: '<=', states: 'max' },
  { mark: '=<', states: 'max' },
  { mark: '≤', states: 'max' },
  { mark: '<', states: 'max' },
  { mark: '==', states: 'both' },
  { mark: '=', states: 'both' },
]

/** What one box says, read as the box it was typed into. */
export const readEntry = (raw: string, side: Side, unit: UnitSystem, kind: RangeKind): Entry => {
  const text = raw.trim().toLowerCase()
  if (text === '') {
    return {}
  }

  const split = splitRange(text)
  if (split !== null) {
    return ends(readNumber(split[0], unit, kind), readNumber(split[1], unit, kind))
  }

  for (const each of COMPARISONS) {
    if (!text.startsWith(each.mark)) {
      continue
    }
    const value = readNumber(text.slice(each.mark.length), unit, kind)
    if (value === undefined) {
      return {}
    }
    if (each.states === 'both') {
      return { min: value, max: value }
    }
    return each.states === 'min' ? { min: value } : { max: value }
  }

  const value = readNumber(text, unit, kind)
  if (value === undefined) {
    return {}
  }
  return side === 'min' ? { min: value } : { max: value }
}

/**
 * The bound two boxes add up to.
 *
 * **An end stated is an end meant, whichever box stated it.** The lower box
 * answers for the minimum and the upper for the maximum, and either of them
 * answers for the end the other one left unsaid — which is what lets `<12` be
 * typed wherever the cursor happens to be and still land on the maximum.
 *
 * Nothing said at either end is no filter at all, rather than a bound holding
 * two undefined ends: `{}` reads as "Any" everywhere downstream, and returning
 * one would leave a column's funnel filled by a filter asking nothing.
 */
export const readRange = (
  lower: string,
  upper: string,
  unit: UnitSystem,
  kind: RangeKind,
): Entry | undefined => {
  const low = readEntry(lower, 'min', unit, kind)
  const high = readEntry(upper, 'max', unit, kind)
  const min = low.min ?? high.min
  const max = high.max ?? low.max
  if (min === undefined && max === undefined) {
    return undefined
  }
  return ends(min, max)
}
