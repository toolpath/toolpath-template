import { describe, expect, it } from 'vitest'
import { assemblyPressEnabled, pressesShown, rowsShown, type BoxState } from './part-chrome'

const box = (over: Partial<BoxState> = {}): BoxState => ({
  open: false,
  building: false,
  unfolded: false,
  ...over,
})

describe('pressesShown', () => {
  it('draws them with nothing on screen', () => {
    expect(pressesShown(box())).toBe(true)
  })

  it('draws them over a face somebody has only clicked', () => {
    // The preview: the box is open and nothing has been decided. + Feature
    // keeps the reading and + Group seeds a group with it, so this is the one
    // state the presses are *for*.
    expect(pressesShown(box({ open: true }))).toBe(true)
  })

  it('draws them while + Feature is waiting for a face', () => {
    // A draft with no box behind it yet — the prompt under the presses names
    // the button it would otherwise be hiding.
    expect(pressesShown(box({ building: true }))).toBe(true)
  })

  it('takes them away once the box holds something being built', () => {
    // A group, a tool assembly, a row of the order list: the box is the action,
    // and a press floating over it is a way to walk off the question.
    expect(pressesShown(box({ open: true, building: true }))).toBe(false)
  })
})

describe('rowsShown', () => {
  it('draws the rows with no box over them', () => {
    expect(rowsShown(box())).toBe(true)
    expect(rowsShown(box({ building: true }))).toBe(true)
  })

  it('folds them away under an open box', () => {
    expect(rowsShown(box({ open: true }))).toBe(false)
    expect(rowsShown(box({ open: true, building: true }))).toBe(false)
  })

  it('gives them back when the fold is pressed open', () => {
    expect(rowsShown(box({ open: true, unfolded: true }))).toBe(true)
  })
})

describe('assemblyPressEnabled', () => {
  it('is pressable with nothing on screen', () => {
    expect(assemblyPressEnabled(box())).toBe(true)
  })

  it('is pressable while + Feature is waiting for a face', () => {
    // Nothing has been read, so nothing is thrown away by changing your mind.
    expect(assemblyPressEnabled(box({ building: true }))).toBe(true)
  })

  it('is greyed over a face somebody has clicked', () => {
    // The one press of the three that has nothing to do with a reading: it
    // would drop the click without a word.
    expect(assemblyPressEnabled(box({ open: true }))).toBe(false)
  })
})
