import { describe, expect, it } from 'vitest'
import { readEntry, readRange } from './range-entry'

/** The lower box, reading in millimetres, which is the ordinary case. */
const lower = (raw: string) => readEntry(raw, 'min', 'millimeters', 'length')
/** The upper box, same. */
const upper = (raw: string) => readEntry(raw, 'max', 'millimeters', 'length')

describe('what one box says', () => {
  it('reads a bare number as the end of the box it was typed into', () => {
    expect(lower('6')).toEqual({ min: 6 })
    expect(upper('6')).toEqual({ max: 6 })
  })

  it('says nothing about an empty box, or one holding what is not a number', () => {
    expect(lower('')).toEqual({})
    expect(lower('   ')).toEqual({})
    expect(lower('carbide')).toEqual({})
  })

  /**
   * The whole of what the operator list used to offer, typed instead — and
   * every one of them means the same end whichever box it was typed into,
   * which is what lets somebody type without looking at the cursor.
   */
  it('takes a comparison, in either box', () => {
    expect(lower('>6')).toEqual({ min: 6 })
    expect(lower('>=6')).toEqual({ min: 6 })
    expect(lower('≥6')).toEqual({ min: 6 })
    expect(upper('>6')).toEqual({ min: 6 })

    expect(upper('<12')).toEqual({ max: 12 })
    expect(upper('<=12')).toEqual({ max: 12 })
    expect(upper('≤12')).toEqual({ max: 12 })
    expect(lower('<12')).toEqual({ max: 12 })
  })

  it('reads = as both ends, which is the old "exactly"', () => {
    expect(lower('=6')).toEqual({ min: 6, max: 6 })
    expect(upper('==6')).toEqual({ min: 6, max: 6 })
  })

  it('takes a whole range in one box, however it is written', () => {
    expect(lower('6-12')).toEqual({ min: 6, max: 12 })
    expect(lower('6..12')).toEqual({ min: 6, max: 12 })
    expect(lower('6 to 12')).toEqual({ min: 6, max: 12 })
    expect(lower('6 – 12')).toEqual({ min: 6, max: 12 })
    expect(upper('6-12')).toEqual({ min: 6, max: 12 })
  })

  /** No dimension in this catalog is negative, so a leading minus is an open end. */
  it('reads a half-written range as the one end it states', () => {
    expect(lower('6-')).toEqual({ min: 6 })
    expect(lower('-12')).toEqual({ max: 12 })
  })

  it('does not mistake the exponent of one number for a range', () => {
    expect(lower('6e-3')).toEqual({ min: 0.006 })
  })

  it('is not fooled by case or stray space', () => {
    expect(lower('  6 - 12  ')).toEqual({ min: 6, max: 12 })
    expect(lower('6MM')).toEqual({ min: 6 })
  })
})

describe('the unit a number is read in', () => {
  it('converts what was typed from the unit on screen', () => {
    expect(readEntry('1.25', 'max', 'inches', 'length')).toEqual({ max: 31.75 })
    expect(readEntry('1.25', 'max', 'millimeters', 'length')).toEqual({ max: 1.25 })
  })

  /** A shop reading in millimetres still knows a tool as a quarter inch. */
  it('lets a number name its own unit, whatever the page is set to', () => {
    expect(lower('0.25"')).toEqual({ min: 6.35 })
    expect(lower('0.25in')).toEqual({ min: 6.35 })
    expect(readEntry('6mm', 'min', 'inches', 'length')).toEqual({ min: 6 })
  })

  it('reads a fraction, and a mixed number', () => {
    expect(lower('1/4"')).toEqual({ min: 6.35 })
    expect(readEntry('1/4', 'min', 'inches', 'length')).toEqual({ min: 6.35 })
    expect(readEntry('1 1/2', 'min', 'inches', 'length').min).toBeCloseTo(38.1, 9)
    expect(lower('1/0')).toEqual({})
  })

  it('converts neither a count nor an angle, and takes the degree sign off one', () => {
    expect(readEntry('4', 'min', 'inches', 'count')).toEqual({ min: 4 })
    expect(readEntry('118', 'min', 'inches', 'deg')).toEqual({ min: 118 })
    expect(readEntry('118°', 'min', 'millimeters', 'deg')).toEqual({ min: 118 })
    expect(readEntry('3', 'max', 'inches', 'ratio')).toEqual({ max: 3 })
  })
})

describe('what two boxes add up to', () => {
  const range = (low: string, high: string) => readRange(low, high, 'millimeters', 'length')

  it('is nothing at all while neither box states an end', () => {
    expect(range('', '')).toBeUndefined()
    expect(range('carbide', '')).toBeUndefined()
  })

  it('takes one end from each box', () => {
    expect(range('6', '12')).toEqual({ min: 6, max: 12 })
    expect(range('6', '')).toEqual({ min: 6 })
    expect(range('', '12')).toEqual({ max: 12 })
  })

  /**
   * The redistribution this control exists for: an end stated is an end meant,
   * whichever box stated it, so the cursor never has to be in the right one.
   */
  it('lets either box state the end that belongs to the other', () => {
    expect(range('<12', '')).toEqual({ max: 12 })
    expect(range('', '>6')).toEqual({ min: 6 })
    expect(range('6-12', '')).toEqual({ min: 6, max: 12 })
    expect(range('', '6-12')).toEqual({ min: 6, max: 12 })
    expect(range('=6', '')).toEqual({ min: 6, max: 6 })
  })

  /** Each box keeps its own end where both boxes state one. */
  it('gives each box its own end when the two disagree', () => {
    expect(range('6-12', '20')).toEqual({ min: 6, max: 20 })
    expect(range('<12', '20')).toEqual({ max: 20 })
    expect(range('3', '>6')).toEqual({ min: 3 })
  })
})
