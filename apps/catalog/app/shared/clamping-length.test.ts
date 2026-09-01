import { describe, expect, it } from 'vitest'
import type { CatalogTool } from '@toolpath/catalog-data'
import {
  clampedFrom,
  clampedLength,
  lengthBelowHolder,
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
    expect(clampedFrom(stated, RULE)).toBe('vendor')
  })

  /** And the rule of thumb everywhere else, which is every tool in the catalog today. */
  it('falls back to the multiple of diameter where it does not', () => {
    expect(clampedLength(sixMil, RULE)).toBe(18)
    expect(clampedFrom(sixMil, RULE)).toBe('rule')
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
    expect(lengthBelowHolder(keyseat, RULE)).toBe(39.9)
  })

  /** Where a vendor states no shank, the cut stands in — there is nothing else. */
  it('falls back to the cut where no shank is stated', () => {
    expect(clampedLength(tool({ DC: 6, OAL: 57 }), RULE)).toBe(18)
  })
})

describe('what that leaves below the holder', () => {
  /** The overall length less the shank held: 57 less 3×⌀6 is 39. */
  it('is the overall length less what is clamped', () => {
    expect(lengthBelowHolder(sixMil, RULE)).toBe(39)
    expect(lengthBelowHolder(stated, RULE)).toBe(21)
  })

  /** A tool with nothing to spare is pushed all the way in, not given a negative. */
  it('never leaves less than nothing', () => {
    expect(lengthBelowHolder(tool({ DC: 6, LCF: 13, OAL: 15 }), RULE)).toBe(0)
  })

  it('leaves the catalog’s own numbers alone where the rule says nothing', () => {
    const off = { vendorSpec: false, perDiameter: 0 }

    expect(lengthBelowHolder(sixMil, off)).toBeNull()
    expect(withClampingLength([sixMil], off)[0]?.geometry.LBH).toBe(19)
  })

  /** L/D is `LBH ÷ DC`, so it has to follow or the two columns disagree. */
  it('carries the ratio with it', () => {
    const [read] = withClampingLength([stated], RULE)

    expect(read?.geometry.LBH).toBe(21)
    expect(read?.geometry.LD).toBe(3.5)
    expect(read?.provenance.LBH).toBe('derived')
  })

  it('leaves a tool that states no diameter or length alone', () => {
    const blank = tool({ LCF: 13 })

    expect(withClampingLength([blank], RULE)[0]).toBe(blank)
  })
})
