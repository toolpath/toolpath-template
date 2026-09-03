import { describe, expect, it } from 'vitest'
import type { PartFeature } from '@toolpath/part-contracts'
import { featureRow } from './feature-rows'

const DOWN = { x: 0, y: 0, z: 1 }

const pocket = (over: { cd?: number; zMax?: number; zMin?: number } = {}): PartFeature =>
  ({
    featureTag: 'pocket-1',
    featureType: 'Pocket',
    regionIdxs: [],
    machiningDirection: DOWN,
    datasheet: {
      zMax: over.zMax,
      zMin: over.zMin,
      extendedZMax: over.zMax,
      facts: { kind: 'Pocket', cd: { ignore: { min: over.cd ?? 6 } } },
    },
  }) as unknown as PartFeature

const chamfer = (angle: number): PartFeature =>
  ({
    featureTag: 'chamfer-1',
    featureType: 'Chamfer',
    regionIdxs: [],
    machiningDirection: DOWN,
    datasheet: { facts: { kind: 'Chamfer', bevel: { angleDeg: angle } } },
  }) as unknown as PartFeature

const row = (feature: PartFeature, features: Array<PartFeature> = [feature]) =>
  featureRow({ feature, features, regions: [], unit: 'millimeters' })

describe('featureRow', () => {
  it('says what the feature is and which way up it is cut', () => {
    const result = row(pocket())

    expect(result.type).toBe('Pocket')
    expect(result.direction).not.toBe('')
  })

  /** Half the widest cutter that reaches the corners: "will a 6 mm get in there". */
  it('states the tightest radius the feature leaves room for', () => {
    expect(row(pocket({ cd: 6 })).minRadius).toBe('3.00 mm')
  })

  it('measures depth from the top of the part where the report supports it', () => {
    expect(row(pocket({ cd: 6, zMax: 10, zMin: 2 })).maxDepth).toBe('8.00 mm')
  })

  /** A chamfer is chosen by its angle rather than by its size. */
  it('states a chamfer’s angle', () => {
    expect(row(chamfer(45)).angle).toBe('45.0°')
  })

  it('leaves the angle out for anything that is not a chamfer', () => {
    expect(row(pocket()).angle).toBeNull()
  })

  /** A number the datasheet does not state is absent, never a zero. */
  it('states nothing the kernel did not', () => {
    const bare = {
      featureTag: 'bare',
      featureType: 'Face',
      regionIdxs: [],
      machiningDirection: DOWN,
    } as unknown as PartFeature

    expect(row(bare).minRadius).toBeNull()
    expect(row(bare).maxDepth).toBeNull()
  })
})
