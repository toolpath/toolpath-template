import { describe, expect, it } from 'vitest'

import { BAND_CSS, BAND_HEX, UNJUDGED_HEX, bandHex } from './bands'
import { BANDS } from './rules'

/**
 * The five bands, and the grey that is not one of them.
 *
 * "Nothing judged this" and "this is fine" are different statements, and a part
 * that shows them the same way is a part claiming to have been checked.
 */
describe('the band colours', () => {
  it('has one for every band the rules can return', () => {
    // A band with no colour falls back to whatever the caller does next, which
    // is how an unjudged grey ends up meaning `easy`.
    for (const band of BANDS) {
      expect(BAND_HEX[band]).toBeTypeOf('number')
      expect(BAND_CSS[band]).toBeTypeOf('string')
    }
  })

  it('gives an unjudged feature its own colour, not the easy one', () => {
    expect(bandHex(null)).toBe(UNJUDGED_HEX)
    expect(bandHex(null)).not.toBe(BAND_HEX.easy)
  })

  it('gives every band a colour of its own', () => {
    // Five named bands are five decisions a shop made. Two sharing a colour is
    // two of those decisions the part cannot tell apart.
    const used = BANDS.map((band) => BAND_HEX[band])

    expect(new Set(used).size).toBe(BANDS.length)
    expect(used).not.toContain(UNJUDGED_HEX)
  })

  it('answers with the band asked for', () => {
    expect(bandHex('rats')).toBe(BAND_HEX.rats)
  })
})
