import { describe, expect, it } from 'vitest'
import type { CatalogTool } from '@toolpath/catalog-data'
import {
  clampShortfall,
  clampWanted,
  clampedLength,
  maxStickout,
  shankLength,
  startingStickout,
  withClampingLength,
} from './clamping-length'

const tool = (geometry: Record<string, number>): CatalogTool =>
  ({
    guid: 't',
    catalogNumber: 'T',
    form: 'flat end mill',
    geometry,
    provenance: {},
  }) as unknown as CatalogTool

/** A ⌀6 end mill on a ⌀6 shank, 57 long: the shape the Seco table is about. */
const sixMil = tool({ DC: 6, SFDM: 6, LCF: 13, OAL: 57, LBH: 19, LD: 3.17 })
/** A keyseat cutter: 22 across the teeth, on a ⌀12 shank. */
const keyseat = tool({ DC: 22.2, SFDM: 12.7, LCF: 1.6, OAL: 78 })
/** The same tool, if its maker published the 36 mm it wants clamped. */
const stated = tool({ DC: 6, LCF: 13, OAL: 57, LSCN: 36 })

const RULE = { vendorSpec: true, perDiameter: 3 }

describe('how much shank a shop holds', () => {
  /** The manufacturer's own number wins wherever there is one. */
  it('reads the vendor’s clamping length where the tool publishes one', () => {
    expect(clampedLength(stated, RULE)).toBe(36)
  })

  /** And the rule of thumb everywhere else, which is every tool in the catalog today. */
  it('falls back to the multiple of diameter where it does not', () => {
    expect(clampedLength(sixMil, RULE)).toBe(18)
  })

  it('ignores the vendor’s number when the shop has turned it off', () => {
    expect(clampedLength(stated, { vendorSpec: false, perDiameter: 3 })).toBe(18)
  })

  /**
   * **Of the shank, not the cut.** A holder grips the shank: a keyseat cutter
   * 22 mm across on a ⌀12.7 shank is clamped on 12.7, and reading the cut
   * asked it for a clamp it has no shank for (Paul, 2026-09-01).
   */
  it('measures the diameters against the shank', () => {
    expect(clampedLength(keyseat, RULE)).toBe(38.1)
    expect(maxStickout(keyseat, RULE)).toBe(39.9)
  })

  /** Where a vendor states no shank, the cut stands in — there is nothing else. */
  it('falls back to the cut where no shank is stated', () => {
    expect(clampedLength(tool({ DC: 6, OAL: 57 }), RULE)).toBe(18)
  })
})

describe('how far it can be pulled out', () => {
  /** The overall length less the shank held: 57 less 3×⌀6 is 39. */
  it('is the overall length less what is clamped', () => {
    expect(maxStickout(sixMil, RULE)).toBe(39)
    expect(maxStickout(stated, RULE)).toBe(21)
  })

  /**
   * **The rule cannot reach past the shank** (Paul, 2026-09-01: "below holder
   * rule is not possible in this scenario… ensure length below holder is not
   * set in impossible areas").
   *
   * A ⌀20 necked bull nose, 104 mm long, whose reduced section runs 53 mm up
   * from the tip has 51 mm of shank. 3×D asks for 60 — taken at its word it
   * put 44 mm below the holder, which is less than the neck and the flutes,
   * and means a chuck closed on the relief. What it can hold is the shank, and
   * everything below the shank is below the holder.
   */
  it('holds no more shank than the tool has, and says how much it wanted', () => {
    const necked = tool({ DC: 20, SFDM: 20, LCF: 38, 'shoulder-length': 53, OAL: 104 })

    expect(shankLength(necked)).toBe(51)
    expect(clampWanted(necked, RULE)).toBe(60)
    expect(clampedLength(necked, RULE)).toBe(51)
    expect(maxStickout(necked, RULE)).toBe(53)
    expect(clampShortfall(necked, RULE)).toBe(9)
  })

  /** Which is the same rule on a plain tool: the flutes are never in the holder. */
  it('keeps the flutes out of the holder', () => {
    expect(maxStickout(tool({ DC: 6, LCF: 13, OAL: 15 }), RULE)).toBe(13)
    expect(clampShortfall(tool({ DC: 6, LCF: 13, OAL: 15 }), RULE)).toBe(16)
  })

  /** Where the rule fits, nothing is short and nothing changes. */
  it('says nothing is short where the shank is long enough', () => {
    expect(clampShortfall(sixMil, RULE)).toBeNull()
    expect(clampShortfall(stated, RULE)).toBeNull()
  })

  it('says nothing about the ceiling where the rule says nothing', () => {
    const off = { vendorSpec: false, perDiameter: 0 }

    expect(maxStickout(sixMil, off)).toBeNull()
  })

  /** L/D is `LBH ÷ DC`, so it has to follow or the two columns disagree. */
  /**
   * **The column shows the stickout the tool starts at** (Paul, 2026-09-01:
   * "L/D column should show starting stickout. Do what Toolpath does"), which
   * is its head length — 13 mm of flute on this one. How far it may be pulled
   * out is `LBHX`, and that is what the reach rules read.
   */
  it('starts at the head, and carries the ceiling and the ratio with it', () => {
    const [read] = withClampingLength([stated], RULE)

    expect(read?.geometry.LBH).toBe(13)
    expect(read?.geometry.LD).toBe(2.17)
    expect(read?.geometry.LBHX).toBe(21)
    expect(read?.provenance.LBH).toBe('derived')
    expect(read?.provenance.LBHX).toBe('derived')
  })

  it('leaves a tool that states no diameter or length alone', () => {
    const blank = tool({ LCF: 13 })

    expect(withClampingLength([blank], RULE)[0]).toBe(blank)
  })
})
