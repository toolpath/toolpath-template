import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { curvesByTag, withReachCurve } from './reach-curve.js'

const curve = { horizontalOffset: [0, 2, 8], verticalOffset: [12, 12, 30] }

describe('putting the reach curve back', () => {
  it('reads well-formed curves out of a datasheet batch, by feature tag', () => {
    const curves = curvesByTag({
      datasheets: [
        { featureTag: 'pocket-1', datasheet: { zMin: -12, reachCurve: curve } },
        { featureTag: 'no-sheet', datasheet: null },
      ],
    })

    expect([...curves.keys()]).toEqual(['pocket-1'])
    expect(curves.get('pocket-1')).toEqual(curve)
  })

  /** A malformed curve is not a curve; passing one on would make the sweep lie. */
  it('leaves out anything that is not a curve', () => {
    const curves = curvesByTag({
      datasheets: [
        {
          featureTag: 'a',
          datasheet: { reachCurve: { horizontalOffset: [0, 5], verticalOffset: [3] } },
        },
        {
          featureTag: 'b',
          datasheet: { reachCurve: { horizontalOffset: [5, 0], verticalOffset: [1, 2] } },
        },
        { featureTag: 'c', datasheet: { reachCurve: 'nope' } },
        { featureTag: 'd', datasheet: {} },
      ],
    })

    expect(curves.size).toBe(0)
  })

  it('grafts the curve onto the typed datasheet and touches nothing else', () => {
    const typed = { featureTag: 'pocket-1', datasheet: { zMin: -12, zMax: 0 } }

    const grafted = withReachCurve(typed as never, new Map([['pocket-1', curve]]))

    expect(grafted).toEqual({
      featureTag: 'pocket-1',
      datasheet: { zMin: -12, zMax: 0, reachCurve: curve },
    })
    expect(withReachCurve(typed as never, new Map())).toBe(typed)
  })
})

/**
 * The sensor that retires this module.
 *
 * The graft exists only because the installed SDK does not know the field. The
 * day its generated `FeatureDatasheet` names `reachCurve`, the SDK reads it
 * typed, the raw read is a second copy of the truth, and this file is the one
 * saying so: delete `reach-curve.ts`, the `…Raw` calls in `engine.ts`, and this
 * test, and make `ReachCurve` in `@toolpath/part-contracts` a re-export.
 */
describe('while the SDK does not know the field', () => {
  it('is still needed — the SDK’s FeatureDatasheet does not declare reachCurve', () => {
    // Through this package's own dependency link rather than `require.resolve`:
    // the SDK's export map has no `require` condition, and the link is where
    // pnpm puts exactly the version this package pins.
    const declaration = join(
      dirname(fileURLToPath(import.meta.url)),
      '..',
      'node_modules',
      '@toolpath',
      'api',
      'dist',
      'generated',
      'models',
      'FeatureDatasheet.d.ts',
    )
    expect(
      existsSync(declaration),
      `The SDK's generated models are not at ${declaration}. Its layout moved: point this test at the new FeatureDatasheet declaration before trusting it.`,
    ).toBe(true)
    const source = readFileSync(declaration, 'utf8')

    expect(
      source,
      'The SDK now declares reachCurve. Delete src/reach-curve.ts and the getPartFeaturesRaw call in src/engine.ts, read the field typed, and re-export the SDK’s ReachCurve from @toolpath/part-contracts.',
    ).not.toContain('reachCurve')
  })
})
