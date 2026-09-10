// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { SetupsPanel } from './setups-panel'
import { PartViewProvider, type PartView } from './part-view'
import { EMPTY_PLAN } from 'shared/setups'
import { GENERATORS } from 'shared/generate'
import { TEST_DIRECTIONS, testFeature, testReport } from 'shared/test-part'

/**
 * The generate row. What each offer *decides* is pinned in `generate.test.ts`;
 * what the panel does with an offer that cannot be answered yet is only visible
 * once it is rendered, so it is pinned here.
 */
afterEach(cleanup)

const features = [testFeature('profile', 'profile', TEST_DIRECTIONS[0]!, [0, 1])]
const report = testReport(features)

const view: PartView = {
  part: report,
  directions: TEST_DIRECTIONS,
  plan: EMPTY_PLAN,
  scores: new Map(),
  verdicts: [],
  unit: 'millimeters',
  showingPass: 'rough',
}

/** The panel with nothing held, which is when the generate row is open. */
const panel = () => {
  const onGenerate = vi.fn()

  render(
    <PartViewProvider view={view}>
      <SetupsPanel
        focusedTag={null}
        onChoose={vi.fn()}
        onHover={vi.fn()}
        onSetPass={vi.fn()}
        onShowFaces={vi.fn()}
        onRemoveSetup={vi.fn()}
        onGenerate={onGenerate}
        onFillSetup={vi.fn()}
        onLockSetup={vi.fn()}
        choosing={null}
        choosingHow={null}
        showingUncut={false}
        onShowUncut={vi.fn()}
        onClearAll={vi.fn()}
      />
    </PartViewProvider>,
  )

  return { onGenerate }
}

describe('an offer that is not answerable yet', () => {
  it('greys From Toolpath out', () => {
    panel()

    expect(screen.getByRole('button', { name: /From Toolpath/ })).toBeDisabled()
  })

  it('says why on the button, rather than leaving the grey to be guessed at', () => {
    panel()

    // Grey with no reason reads as broken, or as waiting on something you did.
    expect(screen.getByRole('button', { name: /From Toolpath/ })).toHaveTextContent(/soon/i)
  })

  it('carries the reason into the tooltip too', () => {
    panel()

    const title = screen.getByRole('button', { name: /From Toolpath/ }).getAttribute('title')

    expect(title).toMatch(/coming soon/i)
  })

  it('generates nothing when it is pressed', () => {
    const { onGenerate } = panel()

    fireEvent.click(screen.getByRole('button', { name: /From Toolpath/ }))

    expect(onGenerate).not.toHaveBeenCalled()
  })

  it('leaves every other offer pressable', () => {
    const { onGenerate } = panel()

    for (const offer of GENERATORS.filter((generator) => !generator.comingSoon)) {
      const button = screen.getByRole('button', { name: new RegExp(offer.name) })
      // `Fill all` is off with nothing held, and off for its own reason.
      if (offer.how === 'fill from current') {
        continue
      }
      expect(button).toBeEnabled()
    }

    fireEvent.click(screen.getByRole('button', { name: /From the rules/ }))
    expect(onGenerate).toHaveBeenCalledWith('from the rules')
  })
})
