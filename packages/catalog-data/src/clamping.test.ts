import { describe, expect, it } from 'vitest'

import { clampShortfall, clampWanted } from './clamping.js'

const tool = (geometry: Record<string, number>): Record<string, number> => geometry

/** A ⌀6 end mill on a ⌀6 shank, 57 long: the shape the Seco table is about. */
const sixMil = tool({ DC: 6, SFDM: 6, LCF: 13, OAL: 57 })
/** A keyseat cutter: 22 across the teeth, on a ⌀12 shank. */
const keyseat = tool({ DC: 22.2, SFDM: 12.7, LCF: 1.6, OAL: 78 })
/** The same tool, if its maker published the 36 mm it wants clamped. */
const stated = tool({ DC: 6, LCF: 13, OAL: 57, LSCN: 36 })

const RULE = { vendorSpec: true, perDiameter: 3 }

/**
 * What is left *below* the holder is no longer this module's answer — it is
 * `stickout.ts`'s, and `stickout.test.ts` covers it. This file is down to the
 * one question that stayed here: how much shank a shop keeps clamped.
 */
describe('how much shank a shop holds', () => {
  /** The manufacturer's own number wins wherever there is one. */
  it('reads the vendor’s clamping length where the tool publishes one', () => {
    expect(clampWanted(stated, RULE)).toBe(36)
  })

  /** And the rule of thumb everywhere else, which is every tool in the catalog today. */
  it('falls back to the multiple of diameter where it does not', () => {
    expect(clampWanted(sixMil, RULE)).toBe(18)
  })

  it('ignores the vendor’s number when the shop has turned it off', () => {
    expect(clampWanted(stated, { vendorSpec: false, perDiameter: 3 })).toBe(18)
  })

  /**
   * **Of the shank, not the cut.** A holder grips the shank: a keyseat cutter
   * 22 mm across on a ⌀12.7 shank is clamped on 12.7, and reading the cut
   * asked it for a clamp it has no shank for (Paul, 2026-09-01).
   */
  it('measures the diameters against the shank', () => {
    expect(clampWanted(keyseat, RULE)).toBe(38.1)
  })

  /** Where a vendor states no shank, the cut stands in — there is nothing else. */
  it('falls back to the cut where no shank is stated', () => {
    expect(clampWanted(tool({ DC: 6, OAL: 57 }), RULE)).toBe(18)
  })

  it('says nothing where the shop asks for no clamp at all', () => {
    expect(clampWanted(sixMil, { vendorSpec: false, perDiameter: 0 })).toBeNull()
  })
})

describe('what the rule asks for and the tool has not got', () => {
  /**
   * A ⌀20 necked bull nose, 104 mm long, whose reduced section runs 53 mm up
   * from the tip: 3×D wants 60 clamped and there are only 51 mm of shank
   * behind the head, so the rule is 9 mm short of what it wants.
   */
  it('measures the shortfall against the shank behind the head', () => {
    const necked = tool({ DC: 20, SFDM: 20, LCF: 38, 'shoulder-length': 53, OAL: 104 })

    expect(104 - Math.max(53, 38)).toBe(51)
    expect(clampWanted(necked, RULE)).toBe(60)
    expect(clampShortfall(necked, RULE)).toBe(9)
  })

  /** Where the rule fits, nothing is short and nothing changes. */
  it('says nothing is short where the shank is long enough', () => {
    expect(clampShortfall(sixMil, RULE)).toBeNull()
    expect(clampShortfall(stated, RULE)).toBeNull()
  })
})
