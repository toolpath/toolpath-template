import { describe, expect, it } from 'vitest'
import { DEFAULT_STICKOUT_POLICY, type CatalogTool } from '@toolpath/catalog-data'
import { withClampingLength } from './clamping-length'
import { policyOf, thresholdsFrom } from './holder-choice'

const tool = (geometry: Record<string, number>): CatalogTool =>
  ({
    guid: 't',
    catalogNumber: 'T',
    form: 'flat end mill',
    unitSystem: 'metric',
    geometry,
    provenance: {},
  }) as unknown as CatalogTool

/** A ⌀6 end mill on a ⌀6 shank, 57 long, as the dataset carries it. */
const sixMil = tool({ DC: 6, SFDM: 6, LCF: 13, OAL: 57, LBH: 15, LD: 2.5 })
const RULE = { vendorSpec: true, perDiameter: 3 }

/**
 * The rule itself is `@toolpath/catalog-data`'s and is tested there — the
 * dataset is built with it. What this file covers is the knob: a shop changing
 * the multiple, and that change reaching every tool the page reads.
 */
describe('the catalog as this shop reads it', () => {
  /** The dataset was built with this rule and this policy, so nothing moves. */
  it('leaves the dataset’s own figures where the rule is the default', () => {
    const [read] = withClampingLength([sixMil], RULE)

    expect(read?.geometry.LBH).toBe(15)
    expect(read?.geometry.LD).toBe(2.5)
    expect(read?.provenance.LBH).toBe('derived')
    expect(read?.provenance.LD).toBe('derived')
  })

  /**
   * **A clamping rule moves the ceiling, and the setup only where it hits it**
   * (2026-09-03). `LBH` is the length the tool is set up at, so clamping more
   * shank shortens the column only once the ceiling comes down past the
   * stickout: this tool sits at 15 with 39 mm of ceiling, and needs 14×D
   * clamped before the ceiling reaches it.
   */
  it('shortens the setup once the shop clamps past it', () => {
    expect(
      withClampingLength([sixMil], { vendorSpec: true, perDiameter: 6 })[0]?.geometry.LBH,
    ).toBe(15)

    const hard = withClampingLength([sixMil], { vendorSpec: true, perDiameter: 7.5 })[0]
    // 7.5×⌀6 leaves 12 of a 57 mm tool, under the 15 it would be set up at.
    expect(hard?.geometry.LBH).toBe(13)
    expect(hard?.geometry.LD).toBe(2.17)
  })

  /**
   * A rule that asks for nothing takes the clamping cap off, and the hold
   * share is still there — so the setup stands where it was rather than
   * running to the end of the tool.
   */
  it('still bounds the setup where the rule says nothing', () => {
    const off = { vendorSpec: false, perDiameter: 0 }

    expect(withClampingLength([sixMil], off)[0]?.geometry.LBH).toBe(15)
  })

  it('leaves a tool that states no diameter or length alone', () => {
    const blank = tool({ DC: 0, LCF: 13 })

    expect(withClampingLength([blank], RULE)[0]).toBe(blank)
  })

  /** No flutes, no head, no setup — and so no figure to rewrite. */
  it('leaves a tool that states no flute length alone', () => {
    const headless = tool({ DC: 6, SFDM: 6, OAL: 57 })

    expect(withClampingLength([headless], RULE)[0]).toBe(headless)
  })
})

/**
 * **The lockstep the two halves of one policy need.**
 *
 * `DEFAULT_STICKOUT_POLICY` is what `build.ts` derives every tool's `LBH` with;
 * `policyOf(thresholdsFrom())` is what this page re-derives it with, and what
 * the stickout control and the drawing use. A package cannot read `knobs.csv`,
 * so the two are written down twice — and since 2026-09-03 `LBH` is the setup
 * length, which means a drifted floor or step puts the column and the drawing
 * back into disagreement. The one number is worth a failing test rather than a
 * comment; AGENTS.md § Testing states the rule.
 */
describe('the sheet and the package agree about the stickout policy', () => {
  const sheet = policyOf(thresholdsFrom())

  it('keeps the same floor and step as the dataset was built with', () => {
    expect(sheet.least).toBe(DEFAULT_STICKOUT_POLICY.least)
    expect(sheet.step).toEqual(DEFAULT_STICKOUT_POLICY.step)
  })

  /**
   * The sheet rounds a third to a whole percent, which is all the two are
   * allowed to differ by: `good hold` is a percentage a shop types and
   * `HELD_SHARE` is the fraction it stands for.
   */
  it('keeps the same held share, to the sheet’s whole percent', () => {
    expect(sheet.heldShare).toBeCloseTo(DEFAULT_STICKOUT_POLICY.heldShare, 2)
  })
})
