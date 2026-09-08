import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { PartFeature } from '@toolpath/part-contracts'
import { FeatureDetails } from './feature-details'

/**
 * **A thread is part of the name, everywhere the feature is named** (Paul,
 * 2026-09-08). The dialog behind the ⓘ heads itself with the kernel's summary,
 * and a thread is a reading somebody made on top of that — so it called an
 * M8×1.25 hole `Blind Hole` while the row that opened it said otherwise.
 */
const hole = (tag: string): PartFeature =>
  ({
    featureTag: tag,
    featureType: 'Hole',
    machiningDirection: { x: 0, y: 0, z: 1 },
    regionIdxs: [1],
    datasheet: {
      zMin: -8,
      zMax: 0,
      extendedZMax: 0,
      facts: { kind: 'Hole', diameter: 2.26, throughHole: false },
    },
  }) as unknown as PartFeature

const draw = (over: Partial<Parameters<typeof FeatureDetails>[0]> = {}) =>
  render(
    <FeatureDetails
      features={[hole('feature-1')]}
      allFeatures={[hole('feature-1')]}
      regions={[{ idx: 1, shapeKind: 'CYLINDER' }]}
      unit="millimeters"
      {...over}
    />,
  )

describe('what the details dialog calls the feature', () => {
  it('uses the name the route gives it', () => {
    draw({ name: '#4-40 UNC Blind Hole' })

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('#4-40 UNC Blind Hole')
  })

  it('falls back to the kernel’s own summary where the caller names nothing', () => {
    draw()

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(/Hole/)
  })
})
