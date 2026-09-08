import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { PartFeature } from '@toolpath/part-contracts'
import { SelectionPanel } from './selection-panel'

/**
 * **A thread is part of the name, everywhere the feature is named** (Paul,
 * 2026-09-08: "once a thread is selected, anywhere that feature is used should
 * show the new name"). The list named a row through the route's `nameOf` and
 * this panel named the same hole off `featureRow`, so the row read `#4-40 UNC
 * Blind Hole` and the panel over it read `Blind Hole`.
 *
 * The thread is kept per feature by the route, so `nameOf` is the only way the
 * panel can know — and without one the kernel's own kind still stands in, which
 * is what every caller that has no threads to report relies on.
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

const draw = (over: Partial<Parameters<typeof SelectionPanel>[0]> = {}) =>
  render(
    <SelectionPanel
      feature={hole('feature-1')}
      features={[hole('feature-1')]}
      regions={[{ idx: 1, shapeKind: 'CYLINDER' }]}
      unit="millimeters"
      siblings={1}
      onInfo={() => undefined}
      {...over}
    />,
  )

describe('what the panel calls the reading', () => {
  it('uses the name the route gives it', () => {
    draw({ nameOf: () => '#4-40 UNC Blind Hole' })

    expect(screen.getByText('#4-40 UNC Blind Hole')).toBeInTheDocument()
  })

  /** And the way in to everything measured is about the same feature. */
  it('names the same feature on the way to what was measured', () => {
    draw({ nameOf: () => '#4-40 UNC Blind Hole' })

    expect(
      screen.getByRole('button', { name: 'What Toolpath measured about #4-40 UNC Blind Hole' }),
    ).toBeInTheDocument()
  })

  it('falls back to the kernel’s own kind where the caller names nothing', () => {
    draw()

    expect(screen.getByRole('status', { name: 'Selected feature' })).toHaveTextContent(/Hole/)
  })
})
