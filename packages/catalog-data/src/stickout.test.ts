import { describe, expect, it } from 'vitest'

import sample from '../fixtures/sample-catalog.json' with { type: 'json' }
import { withDerived } from './build.js'
import { stickoutLimits } from './toolholding.js'
import {
  DEFAULT_STICKOUT_POLICY,
  minStickout,
  setupStickout,
  stickoutCeiling,
  stickoutRange,
  type StickoutTool,
} from './stickout.js'
import type { Catalog, CatalogTool } from './types.js'

const catalog = sample as unknown as Catalog

const tool = (geometry: Record<string, number>, unitSystem: 'inch' | 'metric' = 'metric') =>
  ({ geometry, unitSystem }) as StickoutTool

/** The bounds alone, so a case about the caps is not also a case about rounding. */
const BARE = { heldShare: 1 / 3, least: 0, step: { inch: 0, metric: 0 } }

describe('the least a tool can stand out', () => {
  it('is the flutes on a plain tool', () => {
    expect(minStickout(tool({ LCF: 26, OAL: 60 }))).toBe(26)
  })

  /** A collet must not close on a relief, so a stated neck pushes it back. */
  it('is the shoulder on a necked tool', () => {
    expect(
      minStickout(
        tool({ DC: 20, SFDM: 20, LCF: 38, 'shoulder-length': 53, 'shoulder-diameter': 18 }),
      ),
    ).toBe(53)
  })

  /** No flutes, no head, no knowing where a setup starts. */
  it('is nothing at all where the vendor states no flute length', () => {
    expect(minStickout(tool({ DC: 6, SFDM: 6, OAL: 60 }))).toBeNull()
    expect(stickoutRange(tool({ DC: 6, SFDM: 6, OAL: 60 }))).toBeNull()
  })
})

describe('the ceiling, and which of the three caps set it', () => {
  /**
   * The doc's example: ⌀1 in end mill, 5 in long, `LCF` 1.25, on a 1 in shank.
   * 3×D of shank wants 3 in clamped, leaving 2 in — tighter than the third of
   * the overall length the hold share would keep, which leaves 3.333 in. The
   * clamping rule wins and says so.
   *
   * Before 2026-09-03 those were the ceilings of two different files and
   * nothing compared them: `clamping.ts` answered 2.000 and
   * `stickoutLimits().max` answered 3.333 for the same tool.
   */
  it('takes the tightest cap and names it', () => {
    const inch = tool({ DC: 25.4, SFDM: 25.4, LCF: 31.75, OAL: 127 }, 'inch')
    const range = stickoutRange(inch, { policy: BARE })

    expect(range?.max).toBeCloseTo(50.8, 6)
    expect(range?.limitedBy).toBe('clamp')
    expect(range?.wantedGrip).toBeCloseTo(76.2, 6)
  })

  /** A small shank clamps little, so the hold share is the one that bites. */
  it('lets the hold share win where the clamping rule asks for less', () => {
    const range = stickoutRange(tool({ DC: 6, SFDM: 6, LCF: 19, OAL: 60 }), { policy: BARE })

    expect(range?.max).toBe(40)
    expect(range?.limitedBy).toBe('hold')
  })

  /** And a published grip beats both, because it is the only measured one. */
  it('lets a collet’s published grip win where it is the strictest', () => {
    const range = stickoutRange(tool({ DC: 6, SFDM: 6, LCF: 19, OAL: 60 }), {
      grip: 30,
      policy: BARE,
    })

    expect(range?.max).toBe(30)
    expect(range?.limitedBy).toBe('collet')
  })

  /**
   * A tool with less shank behind its flutes than any rule wants is not
   * refused: it is gripped as short as the grip allows, the range collapses
   * onto the flutes, and `gripShort` is what a control says why with.
   */
  it('collapses onto the flutes where no depth meets the rule', () => {
    const range = stickoutRange(tool({ DC: 6, SFDM: 6, LCF: 26, OAL: 40 }), { policy: BARE })

    expect(range).toMatchObject({ min: 26, max: 26, setup: 26, gripShort: true })
  })

  /** Nothing to subtract from is an unbounded range, not a bound of nothing. */
  it('has no ceiling where the tool states no overall length', () => {
    expect(stickoutRange(tool({ DC: 6, LCF: 19 }))?.max).toBeNull()
    expect(stickoutRange(tool({ DC: 6, LCF: 19 }))?.limitedBy).toBeNull()
  })
})

describe('the setup length', () => {
  /**
   * **The floor and the step are what make `LBH` a setup rather than a flute
   * length** (2026-09-03). The doc's drill — ⌀0.096 in, 2.283 in long, 0.669 in
   * of flute on a 0.157 in shank — stands out at its flutes, up to the half
   * inch nobody sets up under, and onto the next eighth: 0.750 in. The reading
   * reverted on 2026-09-01 gave its bare 0.669 in, because the policy the
   * dataset was built with carried no floor and no step.
   */
  it('takes the flutes up to the sheet’s floor and onto its step', () => {
    const drill = tool({ DC: 2.4384, SFDM: 3.9878, LCF: 16.9926, OAL: 57.9882 }, 'inch')

    expect(minStickout(drill)).toBeCloseTo(16.9926, 4)
    // 0.750 in, from 0.669 in of flute.
    expect(setupStickout(drill)).toBeCloseTo(19.05, 2)
    /**
     * And the ceiling, which is what `LBH` used to be. The clamping rule alone
     * gives 2.283 − 3 × 0.157 = 1.812 in; the hold share is tighter on a drill
     * this long and takes it to 1.522 in. Which is the point: the old `LBH`
     * consulted only the first of those and `stickoutLimits().max` only the
     * second, and the two were never compared.
     */
    expect(
      stickoutRange(drill, { policy: { ...DEFAULT_STICKOUT_POLICY, heldShare: 0 } })?.max,
    ).toBeCloseTo(46.02, 1)
    expect(stickoutCeiling(drill)).toBeCloseTo(38.66, 1)
  })

  /** Out to what the feature needs, where that is more than the flutes. */
  it('stands out to what the holder needs to clear the part', () => {
    const inch = tool({ DC: 6.35, SFDM: 6.35, LCF: 19, OAL: 76.2 }, 'inch')

    // 22.225 mm — the range rounds to a hundredth, as `LBH` always has.
    expect(stickoutRange(inch, { required: 20.3 })?.setup).toBe(22.23)
    expect(stickoutRange(inch, { required: 21.5 })?.setup).toBe(22.23)
  })

  /** And never past the ceiling, whatever the feature asks for. */
  it('is held under the ceiling', () => {
    const range = stickoutRange(tool({ DC: 6, SFDM: 6, LCF: 19, OAL: 60 }), {
      required: 55,
      policy: BARE,
    })

    expect(range?.setup).toBe(40)
    expect(range?.max).toBe(40)
  })
})

/**
 * **The invariant the whole module exists for.**
 *
 * `min ≤ setup ≤ max` and `geometry.LBH === setup` are what stop a drawing
 * dimensioning a length the table beside it contradicts. Checked over the
 * committed sample rather than asserted in a comment, and asked of every
 * holder and collet the sample carries as well as of the bare tool.
 */
describe('the one number, over the committed dataset', () => {
  const tools = catalog.tools as ReadonlyArray<CatalogTool>

  it('has tools to check', () => {
    expect(tools.length).toBeGreaterThan(5)
  })

  it('writes the setup length into LBH, and LD from it', () => {
    for (const each of tools) {
      expect(each.geometry.LBH).toBe(setupStickout(each) ?? undefined)
      const { DC, LBH } = each.geometry
      if (LBH !== undefined && DC !== undefined && DC > 0) {
        expect(each.geometry.LD).toBe(Math.round((LBH / DC) * 100) / 100)
      }
    }
  })

  it('keeps every setup inside its own range, held or not', () => {
    const grips = [null, ...catalog.collets.map((collet) => collet.clampLength)]
    for (const each of tools) {
      for (const grip of grips) {
        const range = stickoutRange(each, { grip })
        if (range === null) {
          continue
        }
        expect(range.setup).toBeGreaterThanOrEqual(range.min)
        if (range.max !== null) {
          expect(range.setup).toBeLessThanOrEqual(range.max)
          expect(range.max).toBeGreaterThanOrEqual(range.min)
        }
      }
    }
  })

  /**
   * The collet-shaped way in has to be the same arithmetic, or the assemblies
   * disagree with the column again by a different route.
   */
  it('answers a collet the same way it answers that collet’s grip', () => {
    const collet = catalog.collets[0]
    expect(collet).toBeDefined()
    for (const each of tools) {
      expect(stickoutLimits(each, collet ?? null)).toEqual(
        stickoutRange(each, { grip: collet?.clampLength ?? null }),
      )
    }
  })

  /** Rebuilding a built tool is a fixed point: the rule has already run. */
  it('is stable across a rebuild', () => {
    for (const each of tools) {
      expect(withDerived(each).geometry.LBH).toBe(each.geometry.LBH)
    }
  })
})

describe('the policy the dataset is built with', () => {
  /**
   * These are `knobs.csv`'s numbers, and they matter: with `least: 0` and no
   * step — what this constant held until 2026-09-03 — `LBH` is the bare flute
   * length, which is the answer that got this reading reverted once already.
   * `apps/catalog` keeps the lockstep test against its own sheet.
   */
  it('carries the sheet’s floor and step', () => {
    expect(DEFAULT_STICKOUT_POLICY.least).toBe(12.7)
    expect(DEFAULT_STICKOUT_POLICY.step).toEqual({ inch: 3.175, metric: 3 })
    expect(DEFAULT_STICKOUT_POLICY.heldShare).toBeCloseTo(1 / 3, 6)
  })
})
