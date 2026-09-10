import { describe, expect, it } from 'vitest'
import {
  formOfTypeLabel,
  formsAsking,
  necked,
  reducedShank,
  typeLabel,
  typesAsking,
} from './tool-type'

const tool = (geometry: Record<string, number>, form = 'flat end mill') => ({ form, geometry })

/**
 * **The shank is part of what a tool is, not a question beside it** (Paul,
 * 2026-09-08: "for Shank, we should roll those into tool type … an endmill
 * with a reduced shank should show as 'reduced shank bull nose endmill'").
 */
describe('what a tool is, in one phrase', () => {
  it('says the form on its own where the shank is as wide as the cut', () => {
    expect(typeLabel(tool({ DC: 6, SFDM: 6, LCF: 12 }))).toBe('Flat end mill')
  })

  /** Paul's rule: the shank behind the cut is thinner than the cut. */
  it('leads with the shank where it is thinner than the cut', () => {
    expect(typeLabel(tool({ DC: 12, SFDM: 10, LCF: 20 }, 'bull nose end mill'))).toBe(
      'Reduced shank bull nose end mill',
    )
  })

  /**
   * **A neck is not a reduced shank, and it is not nothing either** (Paul,
   * 2026-09-09, on a Kennametal `MaxiMet™ … Necked` end mill: "shouldn't this
   * tool be showing as a reduced shank flat end mill based on our rules?"). Its
   * shank is the full ⌀9.525 of the cut, so `reducedShank` is right to say no;
   * what is thin is the shoulder below it. Two facts, two phrases — over the
   * whole scrape the readings are disjoint, 8,079 tools against 9,919 with none
   * in both, so one word would have been the wrong word on 9,919 tools.
   */
  it('says the neck of a necked tool whose shank is full width', () => {
    expect(
      typeLabel(tool({ DC: 6, SFDM: 6, LCF: 12, 'shoulder-diameter': 5.5, 'shoulder-length': 30 })),
    ).toBe('Necked flat end mill')
    expect(reducedShank(tool({ DC: 6, SFDM: 6, LCF: 12, 'shoulder-diameter': 5.5 }))).toBe(false)
  })

  /** The Kennametal tool that raised it, in its own millimetres. */
  it('names the tool the rule was written against', () => {
    expect(
      typeLabel(
        tool({
          DC: 9.525,
          SFDM: 9.525,
          LCF: 12.7,
          'shoulder-diameter': 8.92048,
          'shoulder-length': 28.575,
        }),
      ),
    ).toBe('Necked flat end mill')
  })

  /**
   * A shoulder no narrower than the shank is a relief worth drawing and not a
   * neck, and a shoulder that stops where the flutes do is no section at all.
   */
  it('says nothing where the shoulder is not behind the flutes or not narrower', () => {
    expect(
      typeLabel(tool({ DC: 6, SFDM: 6, LCF: 12, 'shoulder-diameter': 6, 'shoulder-length': 30 })),
    ).toBe('Flat end mill')
    expect(
      typeLabel(tool({ DC: 6, SFDM: 6, LCF: 12, 'shoulder-diameter': 5.5, 'shoulder-length': 12 })),
    ).toBe('Flat end mill')
  })

  /**
   * A shank a collet has to close on is the harder constraint, so it leads.
   * Nothing in the 39,675-tool scrape is both; the rules are independent, so
   * the order is pinned rather than left to the data.
   */
  it('leads with the shank on a tool that is both', () => {
    expect(
      typeLabel(tool({ DC: 12, SFDM: 10, LCF: 20, 'shoulder-diameter': 8, 'shoulder-length': 40 })),
    ).toBe('Reduced shank flat end mill')
  })

  /**
   * A slot mill is a disc of teeth on a neck; there is no full-shank one to
   * tell it apart from, so the phrase would be two words of noise.
   */
  it('says nothing about the shank where every tool of that form has one', () => {
    expect(typeLabel(tool({ DC: 12, SFDM: 10, LCF: 2 }, 'slot mill'))).toBe('Slot mill')
  })

  /**
   * And the neck is the more literal case of that rule (Paul, 2026-09-09: "we
   * just shouldn't touch any of the slot mills"): 1,791 of the 2,261 slot mills
   * in the scrape state the neck outright and the other 470 only fail to
   * because no shoulder was published.
   */
  it('says nothing about the neck of a slot mill either', () => {
    const cutter = tool(
      { DC: 22.2, SFDM: 12.7, LCF: 1.6, 'shoulder-diameter': 11, 'shoulder-length': 30 },
      'slot mill',
    )

    expect(typeLabel(cutter)).toBe('Slot mill')
    // The reading itself still answers; what is done with it is the label's.
    expect(necked(cutter)).toBe(true)
  })

  /**
   * A tap's shank is sized to the tapping chuck, not to the thread it cuts, so
   * it is under the major diameter on 59% of the taps in the catalog — a phrase
   * on the majority of a list that tells no tap from another (Paul,
   * 2026-09-08: "taps should not show reduced shank").
   */
  it('says nothing about the shank on a tap', () => {
    expect(typeLabel(tool({ DC: 9.525, SFDM: 7.938, LCF: 20 }, 'tap right hand'))).toBe(
      'Tap right hand',
    )
    // The reading itself is unchanged; what is done with it is the label's.
    expect(reducedShank(tool({ DC: 9.525, SFDM: 7.938, LCF: 20 }, 'tap right hand'))).toBe(true)
    expect(
      typeLabel(
        tool(
          { DC: 9.525, SFDM: 9.525, LCF: 20, 'shoulder-diameter': 8, 'shoulder-length': 40 },
          'tap right hand',
        ),
      ),
    ).toBe('Tap right hand')
  })

  it('keeps a name the library does not know', () => {
    expect(typeLabel(tool({ DC: 6, SFDM: 6 }, 'broach'))).toBe('broach')
  })
})

/**
 * **A type ticked in a column is a form asked for** (Paul, 2026-09-08: "End
 * mills are technically a valid tool to predrill for the tap"). The Type column
 * has only the phrase; what decides whether a tool is judged at all is the
 * `form` filter, so the phrase has to read back to a form or a tick narrows a
 * list of drills to nothing.
 */
describe('the form behind a phrase', () => {
  it('reads back what typeLabel wrote, shank and all', () => {
    expect(formOfTypeLabel('Flat end mill')).toBe('flat end mill')
    expect(formOfTypeLabel('Reduced shank bull nose end mill')).toBe('bull nose end mill')
    expect(formOfTypeLabel('Necked bull nose end mill')).toBe('bull nose end mill')
    expect(
      formOfTypeLabel(
        typeLabel(tool({ DC: 6, SFDM: 6, LCF: 12, 'shoulder-diameter': 5, 'shoulder-length': 30 })),
      ),
    ).toBe('flat end mill')
    expect(formOfTypeLabel('Engrave/chamfer mill')).toBe('chamfer mill')
    expect(formOfTypeLabel(typeLabel(tool({ DC: 12, SFDM: 10 }, 'ball end mill')))).toBe(
      'ball end mill',
    )
  })

  /** A vendor's own word passed through is not a form: guessing one asks for nothing. */
  it('answers nothing for a phrase the vocabulary does not hold', () => {
    expect(formOfTypeLabel('Multi-flute wonder cutter')).toBeNull()
  })
})

describe('what a tick on the Type column asks the form filter', () => {
  /** The geometry asked for a drill and the taps; a mill is added beside them. */
  const base = ['drill', 'tap right hand']

  it('adds the form of a newly chosen type', () => {
    expect(formsAsking(base, base, [], ['Flat end mill'])).toEqual([...base, 'flat end mill'])
  })

  it('gives it back when the tick comes off', () => {
    const on = formsAsking(base, base, [], ['Flat end mill'])
    expect(formsAsking(on, base, ['Flat end mill'], [])).toEqual(base)
  })

  /**
   * **The geometry's own forms are never taken away.** Unticking `Drill` should
   * narrow the list to nothing for as long as that tick is off, not empty the
   * form filter and with it every drill the feature is about.
   */
  it('keeps what the geometry asked for whatever is unticked', () => {
    expect(formsAsking(base, base, ['Drill'], [])).toEqual(base)
  })

  /** Anything else in the filter — the predrill press's own additions — stands. */
  it('leaves a form nobody ticked alone', () => {
    const pressed = [...base, 'bull nose end mill']
    expect(formsAsking(pressed, base, [], ['Flat end mill'])).toEqual([...pressed, 'flat end mill'])
  })

  it('asks once for two phrases of the same form', () => {
    expect(formsAsking(base, base, [], ['Flat end mill', 'Reduced shank flat end mill'])).toEqual([
      ...base,
      'flat end mill',
    ])
  })
})

/**
 * **A filter the page set itself has to look like one somebody set** (Paul,
 * 2026-09-09: "the filters automatically applied from feature or group
 * selection are not shown in the column headers"). The forms a feature or a
 * thread writes have no control of their own, so the Type column reads its
 * ticks off them.
 */
describe('what the Type column shows the form filter asking for', () => {
  const offered = ['Bull nose end mill', 'Drill', 'Flat end mill', 'Reduced shank flat end mill']

  it('ticks every phrase of a form the filter is asking for', () => {
    expect(typesAsking(['flat end mill'], [], offered)).toEqual([
      'Flat end mill',
      'Reduced shank flat end mill',
    ])
  })

  it('ticks nothing where the form filter says nothing', () => {
    expect(typesAsking([], [], offered)).toEqual([])
  })

  /**
   * From the first untick the column is answering for itself, and `formsAsking`
   * carries that answer back to the forms — so the ticks have to be that answer
   * rather than the forms it was made from, or the untick would be drawn on again.
   */
  it('shows what somebody set over what the forms would say', () => {
    expect(typesAsking(['flat end mill'], ['Flat end mill'], offered)).toEqual(['Flat end mill'])
  })

  /**
   * Only what the column is showing: a tick in the greyed `…` half would say
   * the list is holding a tool it is not.
   */
  it('never ticks a phrase the list is not offering', () => {
    expect(typesAsking(['drill', 'flat end mill'], [], ['Drill'])).toEqual(['Drill'])
  })

  /** A phrase this catalog did not build is not a form, so it is not ticked. */
  it('leaves a phrase outside the vocabulary alone', () => {
    expect(typesAsking(['flat end mill'], [], ['Multi-flute wonder cutter'])).toEqual([])
  })
})

/**
 * The phrase is read for every tool in the catalog whenever the `type` axis is
 * filtered or counted — three regular expressions and a search through the
 * vocabulary each time, measured at 48 ms a pass over 38,114 tools. Worked out
 * once per form name instead.
 */
describe('reading the phrase for a whole catalog', () => {
  it('says the same thing however many times it is asked', () => {
    const necked = tool({ DC: 12, SFDM: 10 }, 'bull nose end mill')
    const full = tool({ DC: 12, SFDM: 12 }, 'bull nose end mill')

    expect(typeLabel(necked)).toBe('Reduced shank bull nose end mill')
    expect(typeLabel(full)).toBe('Bull nose end mill')
    // The same form again, from the remembered words rather than the vocabulary.
    expect(typeLabel(necked)).toBe('Reduced shank bull nose end mill')
    expect(typeLabel(full)).toBe('Bull nose end mill')
  })

  /** A name the vocabulary does not hold is still its own words, and stays so. */
  it('keeps a vendor own name for a form nobody named', () => {
    const odd = tool({ DC: 12, SFDM: 10 }, 'wonder cutter')

    expect(typeLabel(odd)).toBe('Reduced shank wonder cutter')
    expect(typeLabel(odd)).toBe('Reduced shank wonder cutter')
  })
})
