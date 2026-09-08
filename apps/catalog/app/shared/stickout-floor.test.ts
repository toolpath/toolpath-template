import { describe, expect, it } from 'vitest'
import { DEFAULT_STICKOUT_POLICY } from '@toolpath/catalog-data'
import { leastStickout, withLeastFor } from './stickout-floor'

describe('the shortest a tool is ever set up at', () => {
  it('is the flutes plus a diameter', () => {
    expect(leastStickout({ LCF: 12.7, DC: 6.35 }, 0)).toBeCloseTo(19.05, 5)
  })

  /** A floor, never a target: a shop asking for more still gets more. */
  it('yields to a shop floor that is longer', () => {
    expect(leastStickout({ LCF: 12.7, DC: 6.35 }, 40)).toBe(40)
  })

  it('scales with the cutter, which is the point of using a diameter', () => {
    expect(leastStickout({ LCF: 20, DC: 20 }, 0)).toBe(40)
    expect(leastStickout({ LCF: 20, DC: 3 }, 0)).toBe(23)
  })

  /**
   * A tool that states no flutes has no known stickout at all, and one that
   * states no diameter has nothing to add — neither is a licence to invent a
   * floor from half a tool.
   */
  it('leaves the shop floor alone where the tool states too little', () => {
    expect(leastStickout({ DC: 6 }, 5)).toBe(5)
    expect(leastStickout({ LCF: 12 }, 5)).toBe(5)
    expect(leastStickout({}, 0)).toBe(0)
  })
})

describe('putting the floor into a policy', () => {
  it('keeps everything else about the policy', () => {
    const made = withLeastFor(DEFAULT_STICKOUT_POLICY, { LCF: 12.7, DC: 6.35 })
    expect(made.heldShare).toBe(DEFAULT_STICKOUT_POLICY.heldShare)
    expect(made.step).toBe(DEFAULT_STICKOUT_POLICY.step)
  })

  it('raises the floor to the one this tool asks for', () => {
    expect(withLeastFor({ ...DEFAULT_STICKOUT_POLICY, least: 0 }, { LCF: 30, DC: 10 }).least).toBe(
      40,
    )
  })
})
