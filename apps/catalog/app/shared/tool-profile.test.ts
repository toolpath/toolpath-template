import { describe, expect, it } from 'vitest'
import type { CatalogTool, Holder } from '@toolpath/catalog-data'
import { stackProfile, toolProfile } from './tool-profile'

const tool = (geometry: Record<string, number>): CatalogTool =>
  ({
    guid: 't',
    catalogNumber: 'T',
    form: 'flat end mill',
    geometry,
    provenance: {},
  }) as unknown as CatalogTool

describe('a cutter as a profile', () => {
  it('starts at the tip with the cutting diameter and ends at the overall length', () => {
    const profile = toolProfile(tool({ DC: 6, LCF: 20, SFDM: 6, OAL: 60 }))!

    expect(profile.steps[0]).toEqual({ fromHeight: 0, radius: 3 })
    expect(profile.top).toBe(60)
  })

  /** A reduced shank is a step in the silhouette, and the profile carries it. */
  it('carries a reduced shank as its own step', () => {
    const profile = toolProfile(
      tool({ DC: 6, LCF: 20, SFDM: 8, 'shoulder-diameter': 5, 'shoulder-length': 30, OAL: 60 }),
    )!

    expect(profile.steps).toEqual([
      { fromHeight: 0, radius: 3 },
      { fromHeight: 20, radius: 2.5 },
      { fromHeight: 30, radius: 4 },
    ])
  })

  /** No diameter or no length is no shape — never a guessed cylinder. */
  it('says nothing about a tool with no diameter or no length', () => {
    expect(toolProfile(tool({ LCF: 20, OAL: 60 }))).toBeNull()
    expect(toolProfile(tool({ DC: 6, LCF: 20 }))).toBeNull()
  })
})

describe('the stack as one profile', () => {
  const cutter = tool({ DC: 6, LCF: 20, SFDM: 6, OAL: 60, LBH: 26 })
  const holder = {
    noseDiameter: 28,
    noseLength: 20,
    bodyDiameter: 34,
    bodyLength: 15,
    flangeDiameter: 46,
    projection: 60,
  } as unknown as Holder

  /**
   * The tool up to the stickout, the holder above it — the same profile the
   * STEP revolves and the cross-section draws, so the two cannot disagree
   * (Paul, 2026-08-31).
   */
  it('cuts the tool at the stickout and stands the holder on it', () => {
    const stack = stackProfile(cutter, holder, 30)!

    // The tool's own steps below the stickout, then the holder's three.
    expect(stack.steps).toEqual([
      { fromHeight: 0, radius: 3 },
      { fromHeight: 20, radius: 3 },
      { fromHeight: 30, radius: 14 },
      { fromHeight: 50, radius: 17 },
      { fromHeight: 90, radius: 23 },
    ])
    expect(stack.top).toBe(100)
  })

  /** No stickout chosen is the shortest the tool can be set at. */
  it('stands it out its own length below the holder by default', () => {
    expect(stackProfile(cutter, holder, null)?.steps.find((step) => step.radius === 14)).toEqual({
      fromHeight: 26,
      radius: 14,
    })
  })

  /** A holder the vendor drew nothing of leaves the tool as it was. */
  it('is the tool alone where the holder publishes no nose', () => {
    const bare = { noseDiameter: null } as unknown as Holder

    expect(stackProfile(cutter, bare, 30)).toEqual(toolProfile(cutter))
    expect(stackProfile(cutter, undefined, 30)).toEqual(toolProfile(cutter))
  })

  it('says nothing about a tool with no shape', () => {
    expect(stackProfile(undefined, holder, 30)).toBeNull()
  })
})
