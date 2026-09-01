import { describe, expect, it } from 'vitest'
import {
  drillFor,
  likelyThread,
  makerOf,
  minorOf,
  threadNamed,
  threadsFor,
  THREADS,
} from './threads'

describe('the thread table', () => {
  /** Every row is one a shop would recognise, and its numbers hang together. */
  it('holds tap drills between the minor and the nominal size', () => {
    for (const spec of THREADS) {
      expect(spec.tapDrill).toBeGreaterThan(minorOf(spec) - 0.15)
      expect(spec.tapDrill).toBeLessThan(spec.major)
      expect(spec.pitch).toBeGreaterThan(0)
    }
  })

  /** ISO 68-1: `d − 1.0825 p`. An M6×1 minor is 4.917. */
  it('derives the minor diameter rather than tabulating it', () => {
    expect(minorOf(threadNamed('M6×1')!)).toBeCloseTo(4.918, 3)
    expect(minorOf(threadNamed('M10×1.5')!)).toBeCloseTo(8.376, 3)
  })

  it('names no thread twice', () => {
    expect(new Set(THREADS.map((each) => each.name)).size).toBe(THREADS.length)
  })
})

describe('reading a thread off a hole', () => {
  /**
   * A hole is modelled at the tap drill far more often than anything else, so
   * that reading is offered first even when another is nearer (Paul,
   * 2026-08-31).
   */
  it('reads a tap drill first', () => {
    const guess = likelyThread(5)!

    expect(guess.spec.name).toBe('M6×1')
    expect(guess.read).toBe('tap drill')
    expect(guess.off).toBe(0)
  })

  /**
   * The minor diameter and the tap drill are `0.0825 p` apart — under a tenth
   * of a millimetre on everything but the coarsest thread — so a hole modelled
   * at either reads as the tap drill, which is the likelier of two answers
   * that are the same hole. Both are listed.
   */
  it('reads a hole at the minor diameter as its spec, tap drill first', () => {
    const guesses = threadsFor(4.918)

    expect(guesses[0]?.spec.name).toBe('M6×1')
    expect(guesses.some((each) => each.spec.name === 'M6×1' && each.read === 'minor')).toBe(true)
  })

  /** Nothing's tap drill is near ⌀16, so it reads as the nominal size it is. */
  it('reads a hole modelled at the nominal size', () => {
    const guess = likelyThread(16)!

    expect(guess.spec.name).toBe('M16×2')
    expect(guess.read).toBe('nominal')
  })

  /** And a hole at an exact tap drill reads as that, whatever else is near. */
  it('reads an exact tap drill first', () => {
    const guess = likelyThread(12)!

    expect(guess.spec.name).toBe('M14×2')
    expect(guess.read).toBe('tap drill')
    expect(
      threadsFor(12).some((each) => each.spec.name === 'M12×1.75' && each.read === 'nominal'),
    ).toBe(true)
  })

  /** An imperial hole reads as an imperial thread. */
  it('reads a unified tap drill', () => {
    const guess = likelyThread(5.105)!

    expect(guess.spec.name).toBe('1/4-20 UNC')
    expect(guess.read).toBe('tap drill')
  })

  it('offers the alternatives, closest first', () => {
    const guesses = threadsFor(6.8)

    expect(guesses[0]?.spec.name).toBe('M8×1.25')
    expect(guesses.length).toBeGreaterThan(1)
  })

  /** A hole that is no thread's anything gets no guess, rather than the nearest. */
  it('says nothing about a hole no thread is near', () => {
    expect(likelyThread(30)).toBeNull()
    expect(threadsFor(0.4)).toEqual([])
  })
})

describe('the hole each way of making a thread starts from', () => {
  const m6 = threadNamed('M6×1')!
  const m8 = threadNamed('M8×1.25')!
  const m10 = threadNamed('M10×1.5')!

  it('drills nothing special for a plain hole', () => {
    expect(drillFor(m6, 'plain')).toBeNull()
  })

  /** The chart figure the spec carries: `d − p` on a metric thread. */
  it('drills the tap drill for a cut tap', () => {
    expect(drillFor(m6, 'cut tap')).toBe(5)
    expect(drillFor(m8, 'cut tap')).toBe(6.8)
  })

  /**
   * A roll tap pushes metal into the crest instead of cutting it away, so it
   * needs a **bigger** hole — `d − p/2`, which is what the published form-tap
   * charts are built on. Starting one at a cut-tap size snaps the tap, so this
   * is the one place the difference really matters (Paul, 2026-08-31).
   */
  it('drills bigger for a form tap, to within a tenth of the chart', () => {
    expect(drillFor(m6, 'form tap')).toBe(5.5)
    expect(drillFor(m8, 'form tap')).toBe(7.4)
    expect(drillFor(m10, 'form tap')).toBe(9.3)
  })

  /** A thread mill cuts the whole form from a hole already at the inside size. */
  it('drills the minor diameter for a thread mill', () => {
    expect(drillFor(m6, 'thread mill')).toBeCloseTo(4.918, 3)
  })

  it('says what makes the thread in each mode', () => {
    expect(makerOf('plain')).toBeNull()
    expect(makerOf('cut tap')).toBe('tap')
    expect(makerOf('form tap')).toBe('tap')
    expect(makerOf('thread mill')).toBe('thread mill')
  })
})
