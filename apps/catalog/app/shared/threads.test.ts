import { describe, expect, it } from 'vitest'
import {
  drillFor,
  readLabel,
  threadOptions,
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
    const guess = threadsFor(5)[0]!

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

  /**
   * One line per thread on the panel: a hole that reads as both the tap drill
   * and the minor of one spec would otherwise offer the same answer twice.
   */
  it('offers each thread once, by its likeliest reading', () => {
    const offered = threadOptions(4.918)
    const names = offered.map((each) => each.spec.name)

    expect(new Set(names).size).toBe(names.length)
    expect(offered[0]?.spec.name).toBe('M6×1')
    expect(offered[0]?.read).toBe('tap drill')
  })

  it('offers no more than it is asked for, and nothing for a hole near no thread', () => {
    expect(threadOptions(5, 1).map((each) => each.spec.name)).toEqual(['M6×1'])
    expect(threadOptions(4.918).length).toBeLessThanOrEqual(3)
    expect(threadOptions(0.4)).toEqual([])
  })

  /** Nothing's tap drill is near ⌀16, so it reads as the nominal size it is. */
  it('reads a hole modelled at the nominal size', () => {
    const guess = threadsFor(16)[0]!

    expect(guess.spec.name).toBe('M16×2')
    expect(guess.read).toBe('nominal')
  })

  /** And a hole at an exact tap drill reads as that, whatever else is near. */
  it('reads an exact tap drill first', () => {
    const guess = threadsFor(12)[0]!

    expect(guess.spec.name).toBe('M14×2')
    expect(guess.read).toBe('tap drill')
    expect(
      threadsFor(12).some((each) => each.spec.name === 'M12×1.75' && each.read === 'nominal'),
    ).toBe(true)
  })

  /** An imperial hole reads as an imperial thread. */
  it('reads a unified tap drill', () => {
    const guess = threadsFor(5.105)[0]!

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
    expect(threadsFor(30)[0]).toBeUndefined()
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
    // The Engine's chart says 6.7 for an M8×1.25, not the 6.8 of the wall chart.
    expect(drillFor(m8, 'cut tap')).toBe(6.7)
  })

  /**
   * A roll tap pushes metal into the crest instead of cutting it away, so it
   * needs a **bigger** hole. Starting one at a cut-tap size snaps the tap, so
   * this is the one place the difference really matters (Paul, 2026-08-31).
   *
   * **The figures are the Engine's `FORMING_TAP_DRILLS`** (Paul, 2026-09-01:
   * "we should be using whatever Toolpath_UI and Toolpath_Engine do"). The
   * `d − p/2` rule this file used agreed on M6×1 and M8×1.25 and was wrong
   * where it mattered: a #6-32 came out ⌀0.122 against the chart's ⌀0.125.
   */
  it('drills the Engine’s form-tap chart, not a rule of thumb', () => {
    expect(drillFor(m6, 'form tap')).toBe(5.5)
    expect(drillFor(m8, 'form tap')).toBe(7.4)
    expect(drillFor(m10, 'form tap')).toBe(9.3)

    const six32 = threadNamed('#6-32 UNC')!
    expect(drillFor(six32, 'form tap')).toBeCloseTo(3.175, 3)
    expect(six32.major - six32.pitch / 2).toBeCloseTo(3.108, 3)
  })

  /**
   * Every row carries both, and both are chart figures rather than arithmetic:
   * a form drill is always the bigger of the two, and never past the nominal
   * size.
   */
  it('holds a cut and a form drill for every thread, in that order', () => {
    for (const spec of THREADS) {
      expect(spec.form, spec.name).toBeGreaterThan(spec.tapDrill)
      expect(spec.form, spec.name).toBeLessThan(spec.major)
    }
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

/**
 * **The list ranks; it does not argue** (Paul, 2026-09-02: "just 'tap drill' or
 * 'nominal diameter', etc"). `nominal` and `minor` are the diameter by those
 * names, and an option reading only "nominal" is an adjective with its noun
 * missing.
 */
describe('what a reading is called', () => {
  it('names the diameter, except where the name is already a thing', () => {
    expect(readLabel('tap drill')).toBe('tap drill')
    expect(readLabel('nominal')).toBe('nominal diameter')
    expect(readLabel('minor')).toBe('minor diameter')
  })
})
