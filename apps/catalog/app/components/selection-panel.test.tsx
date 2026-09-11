import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
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

/**
 * **Grouping identical holes is offered, not applied** (Paul, 2026-09-09: "In
 * Add Feature, I should be able to select a single hole. The Add Feature Dialog
 * should warn me there are other identical holes and ask if I want to add them
 * in a group"). Every path through `part-interaction` used to expand a hole
 * into its siblings, so one of a bolt circle could not be asked about; this is
 * where that rule went, and both answers are here.
 */
describe('the offer to group identical holes', () => {
  const offer = (over: Partial<{ count: number }> = {}) => {
    const identical = { count: 39, onGroup: vi.fn(), onDismiss: vi.fn(), ...over }
    draw({ siblings: identical.count, identical })
    return identical
  }

  it('says how many others there are, and names the number on the press', () => {
    offer()

    expect(screen.getByText(/38 other holes on this part are identical/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add all 39 as a group' })).toBeInTheDocument()
  })

  /** Two holes are one other hole, and the sentence has to read as English. */
  it('counts one other hole in the singular', () => {
    offer({ count: 2 })

    expect(screen.getByText(/One other hole on this part is identical/)).toBeInTheDocument()
  })

  it('takes the offer', () => {
    const identical = offer()

    fireEvent.click(screen.getByRole('button', { name: 'Add all 39 as a group' }))

    expect(identical.onGroup).toHaveBeenCalled()
  })

  /** And turning it down is a press of its own, so both answers are on screen. */
  it('turns the offer down', () => {
    const identical = offer()

    fireEvent.click(screen.getByRole('button', { name: 'Just this hole' }))

    expect(identical.onDismiss).toHaveBeenCalled()
  })

  it('is not made for a hole with nothing like it', () => {
    draw({ siblings: 1 })

    expect(screen.queryByText(/identical/)).not.toBeInTheDocument()
  })
})

/**
 * **The thread is read before the numbers, not after them** (Paul, 2026-09-11:
 * "the option to add a thread should be more prominent — put it directly
 * underneath the group bubble in a similar bubble with grey background").
 *
 * Whether a hole is tapped decides which catalog the table below is even
 * showing, and it sat at the foot of the panel under a hairline rule, below
 * every measurement — which is where this page puts a detail.
 */
describe('where the thread is asked', () => {
  const both = {
    identical: { count: 8, onGroup: () => undefined, onDismiss: () => undefined },
    thread: {
      holeDiameter: 5,
      mode: 'plain' as const,
      spec: null,
      onChange: () => undefined,
    },
  }

  it('puts it directly under the grouping offer, in a bubble of its own', () => {
    draw({ siblings: 8, ...both })

    const offer = screen
      .getByRole('button', { name: 'Add all 8 as a group' })
      .closest('div.rounded')
    const thread = screen.getByText('Modeled hole diameter:').closest('div.rounded')

    expect(offer).not.toBeNull()
    expect(thread).not.toBeNull()
    // The next box down, rather than the last thing on the panel.
    expect(offer?.nextElementSibling).toBe(thread)
    // Grey, where the offer above it is the page's blue: a standing question
    // about the hole rather than something to answer now.
    expect(thread?.className).toContain('bg-zinc-800/60')
  })

  /**
   * **And nothing points at the arrows** (Paul, 2026-09-11: "once a feature is
   * selected, it should no longer show 'click an arrow for machining
   * direction'"). It was advice for picking a way up, under a box already
   * naming the one being read.
   */
  it('says nothing about clicking an arrow', () => {
    draw({ siblings: 8, ...both })

    expect(screen.queryByText(/click an arrow/)).not.toBeInTheDocument()
  })
})
