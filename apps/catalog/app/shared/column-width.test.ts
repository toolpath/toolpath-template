import { describe, expect, it } from 'vitest'
import { DEFAULT_WEIGHT, columnWeight, fillingWidth } from './column-width'

/**
 * How wide a column is.
 *
 * **The zero floor is the whole rule.** A track with a floor in it is a track
 * that can refuse to shrink, and thirteen of those inside a panel narrower than
 * their sum is a list that overflows its box — which is what the tool list did
 * until 2026-09-11. What is left is a weight, so the map beside the columns
 * finally says something: ten parts of catalogue number to six of flute count,
 * out of whatever room there is.
 */
describe('how wide a column is', () => {
  it('asks for a share of the box rather than a floor under it', () => {
    expect(fillingWidth('10rem')).toBe('minmax(0, 10fr)')
    expect(fillingWidth('6rem')).toBe('minmax(0, 6fr)')
  })

  it('reads the parts a column asks for out of its rem', () => {
    expect(columnWeight('12rem')).toBe(12)
    expect(columnWeight('7.5rem')).toBe(7.5)
  })

  /**
   * A width map is read here and nowhere else, so anything that is not a plain
   * rem weighs what an unstated column does rather than becoming a second,
   * silent sizing rule.
   */
  it('weighs anything that is not a rem as an unstated column', () => {
    expect(columnWeight('160px')).toBe(DEFAULT_WEIGHT)
    expect(columnWeight('20%')).toBe(DEFAULT_WEIGHT)
    expect(columnWeight('0rem')).toBe(DEFAULT_WEIGHT)
    expect(columnWeight('')).toBe(DEFAULT_WEIGHT)
  })
})
