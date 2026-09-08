import { describe, expect, it } from 'vitest'
import { formOfTypeLabel, formsAsking, reducedShank, typeLabel } from './tool-type'

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
   * **A neck is not a reduced shank** (Paul, 2026-09-08: "use my reduced shank
   * rule rather than the old one"). `shankOf` reads a shoulder narrower than
   * the cut standing back from the flutes — a different population entirely,
   * 6,378 tools against 7,499 with one tool in both — and it is not the rule
   * these words are built from. The axis it answers is parked.
   */
  it('says nothing about the shank of a necked tool whose shank is full width', () => {
    expect(
      typeLabel(tool({ DC: 6, SFDM: 6, LCF: 12, 'shoulder-diameter': 5.5, 'shoulder-length': 30 })),
    ).toBe('Flat end mill')
    expect(reducedShank(tool({ DC: 6, SFDM: 6, LCF: 12 }))).toBe(false)
  })

  /**
   * A slot mill is a disc of teeth on a neck; there is no full-shank one to
   * tell it apart from, so the phrase would be two words of noise.
   */
  it('says nothing about the shank where every tool of that form has one', () => {
    expect(typeLabel(tool({ DC: 12, SFDM: 10, LCF: 2 }, 'slot mill'))).toBe('Slot mill')
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
