// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToolButton } from 'components/tool-button'

/**
 * The toolbar is icons only, so the label is the whole of what these controls
 * say to anybody not reading the pixels.
 */
// Vitest is not configured with globals, so Testing Library's automatic
// cleanup never registers and renders pile up across tests.
afterEach(cleanup)

describe('ToolButton', () => {
  it('names itself for a screen reader and for a hover', () => {
    render(
      <ToolButton label="Fit to part" onClick={() => {}}>
        <svg />
      </ToolButton>,
    )

    const button = screen.getByRole('button', { name: 'Fit to part' })
    expect(button.getAttribute('title')).toBe('Fit to part')
  })

  it('announces a toggle rather than only colouring it', () => {
    render(
      <ToolButton label="Section (on)" pressed onClick={() => {}}>
        <svg />
      </ToolButton>,
    )

    expect(screen.getByRole('button', { pressed: true })).toBeDefined()
  })

  it('is a plain button when it is not a toggle', () => {
    render(
      <ToolButton label="Reset the view" onClick={() => {}}>
        <svg />
      </ToolButton>,
    )

    // Not `aria-pressed="false"`, which would announce an off switch where
    // there is only an action.
    expect(screen.getByRole('button').hasAttribute('aria-pressed')).toBe(false)
  })

  it('presses', () => {
    const onClick = vi.fn()
    render(
      <ToolButton label="Fit to part" onClick={onClick}>
        <svg />
      </ToolButton>,
    )

    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })
})
