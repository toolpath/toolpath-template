import { describe, expect, it } from 'vitest'
import { reducedShank, typeLabel } from './tool-type'

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
