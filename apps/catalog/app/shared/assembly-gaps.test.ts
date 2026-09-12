import { describe, expect, it } from 'vitest'
import type { Margins } from '@toolpath/catalog-data'
import type { ReachCurve } from '@toolpath/part-contracts'
import type { ViewerAssembly } from '@toolpath/tool-drawing/geometry'
import { cuttingRadiusOf, gapsFor } from './assembly-gaps'

const tool = (geometry: Record<string, unknown>): { geometry: Record<string, number> } => ({
  geometry: geometry as Record<string, number>,
})

const MARGINS: Margins = { axial: 0.508, radial: 0.508 }

/**
 * **A tool with no flank is not a tool cutting on the centreline.**
 *
 * `(DC ?? 0) / 2` read a missing cutting diameter as a radius of nought, which
 * put the material's inner face on the axis: the wall was measured, and drawn,
 * through the tool it was supposed to stand clear of (Paul, 2026-09-11). It was
 * fixed in `catalog-drawing.tsx` on main while this branch had already moved
 * the expression here, so the merge resolved it in a file nothing reads any
 * more. These are the two shapes the old guard let through — `!== undefined`
 * is true of both — and they are pinned here rather than on the drawing because
 * the three clearance boxes read this same radius.
 */
describe('cuttingRadiusOf', () => {
  it('halves a stated cutting diameter', () => {
    expect(cuttingRadiusOf(tool({ DC: 6 }))).toBe(3)
  })

  it('states no radius where the vendor published no diameter', () => {
    // The runtime shape: the type says `number`, a vendor that published
    // nothing carries `null`, and the catalog is built from the vendor.
    expect(cuttingRadiusOf(tool({ DC: null }))).toBeNull()
    expect(cuttingRadiusOf(tool({}))).toBeNull()
  })

  it('states no radius for a diameter of nought, which is the same silence', () => {
    expect(cuttingRadiusOf(tool({ DC: 0 }))).toBeNull()
  })
})

describe('gapsFor', () => {
  /** Neither is reached: the radius is refused before the outline is taken. */
  const curve = { points: [] } as unknown as ReachCurve
  const viewer = {} as unknown as ViewerAssembly

  it('measures nothing without a cutting radius to measure past', () => {
    expect(gapsFor(viewer, curve, null, MARGINS)).toBeNull()
  })

  it('measures nothing without a feature', () => {
    expect(gapsFor(viewer, null, 3, MARGINS)).toBeNull()
  })
})
