import { describe, expect, it } from 'vitest'
import {
  AXES_IN_TOOL_COLUMNS,
  askOfComponentColumn,
  askOfTapColumn,
  askOfToolColumn,
  narrowingNames,
  sayBound,
} from './column-filters'
import { columnsFor } from './component-columns'
import { termAxesFor } from './component-query'

/**
 * **One question, one place to answer it** — and the place is the column that
 * shows the value (Paul, 2026-09-08).
 */
describe('what a tool column asks', () => {
  it('narrows the vendor, the type and the family on their own words', () => {
    expect(askOfToolColumn('brand')).toEqual({ shape: 'terms', axis: 'brand' })
    // The phrases the columns show — `Reduced shank bull nose end mill`, the
    // vendor's line — rather than the `form` and `familyId` behind them.
    expect(askOfToolColumn('type')).toEqual({ shape: 'terms', axis: 'type' })
    expect(askOfToolColumn('family')).toEqual({ shape: 'terms', axis: 'family' })
  })

  it('searches the catalog number, which is the one answer a shop arrives with', () => {
    expect(askOfToolColumn('catalogNumber')).toEqual({ shape: 'text' })
  })

  it('reads every geometry code as a length unless it is not one', () => {
    expect(askOfToolColumn('DC')).toEqual({ shape: 'range', kind: 'length' })
    expect(askOfToolColumn('LBH')).toEqual({ shape: 'range', kind: 'length' })
    // A count converts to nothing, an angle is degrees in either unit, and an
    // L/D is a ratio: reading one as a length offers to turn 4 flutes into
    // 0.157 of them.
    expect(askOfToolColumn('NOF')).toEqual({ shape: 'range', kind: 'count' })
    expect(askOfToolColumn('SIG')).toEqual({ shape: 'range', kind: 'deg' })
    expect(askOfToolColumn('LD')).toEqual({ shape: 'range', kind: 'ratio' })
  })

  it('names every axis a header takes over from the button row', () => {
    for (const axis of AXES_IN_TOOL_COLUMNS) {
      expect(askOfToolColumn(axis)).not.toBeNull()
    }
  })
})

/**
 * **A tap list answers two questions and sorts on the rest** (Paul, 2026-09-09:
 * "when I am in the TAPs row or table, it should be filtering to taps"). Its
 * rows are the thread's rather than the query's, so a funnel over its numbers
 * would be a control that changes nothing.
 */
describe('what a tap column asks', () => {
  it('searches the catalog number and narrows the type', () => {
    expect(askOfTapColumn('catalogNumber')).toEqual({ shape: 'text' })
    expect(askOfTapColumn('type')).toEqual({ shape: 'terms', axis: 'type' })
  })

  /**
   * **The two the sweep narrowed on** (Paul, 2026-09-09: "shouldn't thread
   * diameter and thread length be applied from the thread spec and model
   * feature/group depth respectively?"). They are ranges like any other here;
   * what makes them stated rather than asked is that the list hands in no
   * `onBound` for them — `column-heading.tsx` § `Asked`.
   */
  it('states the two numbers the thread and the depth set', () => {
    expect(askOfTapColumn('DC')).toEqual({ shape: 'range', kind: 'length' })
    expect(askOfTapColumn('LCF')).toEqual({ shape: 'range', kind: 'length' })
  })

  it('asks nothing of the columns the thread already decided', () => {
    for (const code of ['brand', 'family', 'LBH', 'NOF', 'OAL', 'SFDM']) {
      expect(askOfTapColumn(code)).toBeNull()
    }
  })

  /** The two it does ask are the tool list's own questions, not a second pair. */
  it('asks them exactly as the tool list does', () => {
    for (const code of ['catalogNumber', 'type', 'DC', 'LCF']) {
      expect(askOfTapColumn(code)).toEqual(askOfToolColumn(code))
    }
  })
})

describe('what a holder or collet column asks', () => {
  it('offers every term axis on the column that shows it', () => {
    for (const kind of ['holder', 'collet'] as const) {
      for (const axis of termAxesFor(kind)) {
        expect(askOfComponentColumn(kind, axis.code)).toEqual({
          shape: 'terms',
          axis: axis.code,
        })
      }
    }
  })

  /**
   * The filter panel built one range control per length column, so the columns
   * were already the list of numbers a holder is picked on. They keep it.
   */
  it('offers a range on every length, and on nothing else', () => {
    for (const kind of ['holder', 'collet'] as const) {
      const ranges = columnsFor(kind)
        .filter((column) => askOfComponentColumn(kind, column.code)?.shape === 'range')
        .map((column) => column.code)

      expect(ranges).toEqual(
        columnsFor(kind)
          .filter((column) => column.kind === 'length')
          .map((column) => column.code),
      )
    }
  })

  it('searches the catalog number, the one answer a shop arrives with', () => {
    expect(askOfComponentColumn('holder', 'catalogNumber')).toEqual({ shape: 'text' })
    expect(askOfComponentColumn('collet', 'catalogNumber')).toEqual({ shape: 'text' })
  })

  /**
   * A collet's type is its series said as a phrase — `ER20 collet` — and that
   * phrase is what a shop calls the thing, so it is a list of its own (Paul,
   * 2026-09-08).
   */
  it('offers the type a collet reads as, as a list', () => {
    expect(askOfComponentColumn('collet', 'type')).toEqual({ shape: 'terms', axis: 'type' })
  })

  /**
   * **A holder has no such column** (Paul, 2026-09-11): the phrase glued its
   * taper and its collet series onto how it grips, so it said what Taper and
   * Collet series already said and could disagree with them. How it grips is
   * the holder's type, and `clamping` is the axis under that heading.
   */
  it('asks a holder nothing for the type that came off', () => {
    expect(askOfComponentColumn('holder', 'type')).toBeNull()
    expect(askOfComponentColumn('holder', 'clamping')).toEqual({
      shape: 'terms',
      axis: 'clamping',
    })
  })
})

/**
 * The words a filter dialog warns with, in the unit being read in — a warning
 * about a number has to say the number.
 */
/**
 * **A count nobody can decompose is not an answer** (Paul, 2026-09-09: "in Tap,
 * it shows 'Clear 4 filters' but I only see tool type. What are the 4 filters
 * active? It needs to be visible.").
 */
describe('what is narrowing a list, named', () => {
  const tools = [
    { code: 'catalogNumber', label: 'Catalog number' },
    { code: 'brand', label: 'Vendor' },
    { code: 'DC', label: 'Diameter' },
    { code: 'LCF', label: 'Flute length' },
    { code: 'type', label: 'Type' },
  ]

  it('names a term axis and a bound by the column that shows it', () => {
    expect(
      narrowingNames({ terms: { brand: ['Acme'] }, bounds: { DC: { max: 8 } } }, tools),
    ).toEqual(['Vendor', 'Diameter'])
  })

  /**
   * `form` has no column of its own; the Type column asks it in the trade's
   * phrases, so that is the name a shop can go and look at.
   */
  it('names the form filter after the column that asks it', () => {
    expect(narrowingNames({ terms: { form: ['drill'] }, bounds: {} }, tools)).toEqual(['Type'])
  })

  /**
   * Two axes wearing one column's label are one filter to anybody reading the
   * table — counting both is how `Clear 4 filters` stood over three funnels.
   */
  it('counts one question once however many axes carry it', () => {
    expect(
      narrowingNames({ terms: { form: ['drill'], type: ['Drill'] }, bounds: {} }, tools),
    ).toEqual(['Type'])
    expect(
      narrowingNames({ terms: { familyId: ['a'], productLine: ['b'] }, bounds: {} }, tools),
    ).toEqual(['Family'])
  })

  /** The same axis reads out under whichever list is open. */
  it('names a column by the words that list uses for it', () => {
    const taps = [{ code: 'DC', label: 'Thread diameter' }]
    expect(narrowingNames({ terms: {}, bounds: { DC: { min: 2 } } }, taps)).toEqual([
      'Thread diameter',
    ])
  })

  /**
   * The situation in Paul's screenshot, 2026-09-09: a #4-40 blind hole with the
   * TAP stack open, three funnels on the table — Type from the thread's forms,
   * Thread diameter from the spec, Thread length from the depth — and the
   * button reading `Clear 1 filter`. "Button should show to clear 3 filters not
   * 1 in this situation."
   *
   * A bound the part set is grey rather than lit, because there is no number
   * there to type. That was never a reason to leave it out of the count.
   */
  it('counts a bound the part set beside a filter somebody set', () => {
    const taps = [
      { code: 'catalogNumber', label: 'Catalog number' },
      { code: 'type', label: 'Type' },
      { code: 'DC', label: 'Thread diameter' },
      { code: 'LCF', label: 'Thread length' },
    ]

    expect(
      narrowingNames(
        {
          text: '',
          terms: { type: ['Tap right hand'] },
          bounds: { DC: { min: 2.645, max: 3.045 }, LCF: { min: 5.512 } },
        },
        taps,
      ),
    ).toEqual(['Type', 'Thread diameter', 'Thread length'])
  })

  it('names the catalog-number search, and ignores an empty one', () => {
    expect(narrowingNames({ text: ' M6 ', terms: {}, bounds: {} }, tools)).toEqual([
      'Catalog number',
    ])
    expect(narrowingNames({ text: '   ', terms: {}, bounds: {} }, tools)).toEqual([])
  })

  /** An axis with no values and a bound with no ends are nobody asking. */
  it('says nothing about an axis that is not narrowing', () => {
    expect(narrowingNames({ terms: { brand: [] }, bounds: { DC: {} } }, tools)).toEqual([])
  })

  /**
   * An axis nothing on the page names still counts, under its own key. Dropping
   * it would make the count lie in the other direction — a list narrowed by
   * something with no name, reported as narrowed by nothing.
   */
  it('names an axis no column and no rule knows, rather than dropping it', () => {
    expect(narrowingNames({ terms: { unitSystem: ['metric'] }, bounds: {} }, tools)).toEqual([
      'unitSystem',
    ])
  })
})

describe('a bound said in words', () => {
  it('converts a length and leaves a count alone', () => {
    expect(sayBound('length', { max: 8 }, 'millimeters')).toBe('at most 8.00 mm')
    expect(sayBound('count', { min: 4 }, 'inches')).toBe('at least 4')
  })

  it('says a two-ended bound as a span, and an exact one as the number', () => {
    expect(sayBound('count', { min: 2, max: 4 }, 'millimeters')).toBe('2 to 4')
    expect(sayBound('count', { min: 4, max: 4 }, 'millimeters')).toBe('4')
  })

  it('says a bound with no ends at all rather than nothing', () => {
    expect(sayBound('length', {}, 'millimeters')).toBe('anything')
  })
})
