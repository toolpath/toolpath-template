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
   * And the package's own reading of a *neck* — a shoulder narrower than the
   * cut standing back from the flutes — which is all but disjoint from the
   * shank rule over the real catalog: a necked tool keeps a full-width shank.
   */
  it('leads with the shank where the neck is thinner than the cut', () => {
    expect(
      typeLabel(tool({ DC: 6, SFDM: 6, LCF: 12, 'shoulder-diameter': 5.5, 'shoulder-length': 30 })),
    ).toBe('Reduced shank flat end mill')
    expect(reducedShank(tool({ DC: 6, SFDM: 6, LCF: 12 }))).toBe(false)
  })

  /**
   * A slot mill is a disc of teeth on a neck; there is no full-shank one to
   * tell it apart from, so the phrase would be two words of noise.
   */
  it('says nothing about the shank where every tool of that form has one', () => {
    expect(typeLabel(tool({ DC: 12, SFDM: 10, LCF: 2 }, 'slot mill'))).toBe('Slot mill')
  })

  it('keeps a name the library does not know', () => {
    expect(typeLabel(tool({ DC: 6, SFDM: 6 }, 'broach'))).toBe('broach')
  })
})
