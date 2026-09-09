import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AddBar } from './add-bar'

/**
 * The three presses that grow the list, over the top-left of the part.
 *
 * They were the last thing inside the Features card until 2026-09-08, where a
 * long list scrolled them out of reach; what they *do* is the route's, so what
 * is pinned here is that all three are on show without a menu in between, that
 * the first asks rather than refuses, and that the row is not a curtain over the
 * canvas — `tests/on-the-part.spec.ts` § "at a laptop width" is the other half
 * of that last one.
 */
const show = (props: Partial<Parameters<typeof AddBar>[0]> = {}) => {
  const handlers = {
    onAddFeature: vi.fn(),
    onAddGroup: vi.fn(),
    onAddAssembly: vi.fn(),
  }
  render(<AddBar addingFeature={false} {...handlers} {...props} />)
  return handlers
}

describe('the three ways to add', () => {
  /**
   * **Buttons, not one that asks** (Paul, 2026-09-02: "it should show buttons
   * for Add Feature or Add Group, not the weird combined one"), and named for
   * what they make (Paul, 2026-09-08: "+ Feature, + Group, + Tool Assembly").
   */
  it('offers all three on show, without a menu in between', () => {
    const { onAddGroup, onAddAssembly } = show()

    expect(screen.getByRole('button', { name: '+ Feature' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '+ Group' }))
    fireEvent.click(screen.getByRole('button', { name: '+ Tool Assembly' }))

    expect(onAddGroup).toHaveBeenCalled()
    expect(onAddAssembly).toHaveBeenCalled()
  })

  /**
   * **Pressable, then asking** (Paul, 2026-09-02: "Add feature is greyed out by
   * default, which makes it confusing — it should be clickable, then just
   * prompt you to click on the part"). Disabled, it read as broken rather than
   * as waiting for the one thing it needs.
   */
  it('asks for a face rather than refusing to be pressed', () => {
    const { onAddFeature } = show()

    const add = screen.getByRole('button', { name: '+ Feature' })
    expect(add).toBeEnabled()
    fireEvent.click(add)

    expect(onAddFeature).toHaveBeenCalled()
  })

  it('says it is waiting once it has been pressed', () => {
    show({ addingFeature: true })

    expect(screen.getByRole('button', { name: '+ Feature' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  /**
   * **The row is as wide as its buttons.** A transparent box over the canvas
   * carrying `pointer-events: auto` is a curtain, and one of them stopped
   * click-drag-rotate on the whole part on 2026-09-02.
   */
  it('takes the pointer for its buttons and no further', () => {
    show()

    const row = screen.getByRole('button', { name: '+ Feature' }).parentElement
    expect(row).toHaveClass('w-fit')
  })
})
