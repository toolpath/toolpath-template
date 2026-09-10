import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { NoColletToggle } from './no-collet-toggle'

/**
 * **The press says which way it goes** (Paul, 2026-09-10). A toggle labelled
 * with its state leaves somebody working out which of the two racks is on
 * screen from the rows, which is what they opened the list to find out.
 */
describe('the press that shows the chucks with no collet', () => {
  it('offers to hide them while they are shown', () => {
    render(<NoColletToggle count={12} shown onToggle={() => {}} />)

    const press = screen.getByRole('button', { name: 'Hide 12 with no collet' })
    expect(press).toHaveAttribute('aria-pressed', 'true')
  })

  it('offers to show them while they are hidden', () => {
    render(<NoColletToggle count={12} shown={false} onToggle={() => {}} />)

    const press = screen.getByRole('button', { name: 'Show 12 with no collet' })
    expect(press).toHaveAttribute('aria-pressed', 'false')
  })

  /** The number is the rows the press controls, so it cannot change meaning. */
  it('counts the same rows in both directions', () => {
    const { unmount } = render(<NoColletToggle count={7} shown onToggle={() => {}} />)
    expect(screen.getByRole('button')).toHaveTextContent('7')
    unmount()

    render(<NoColletToggle count={7} shown={false} onToggle={() => {}} />)
    expect(screen.getByRole('button')).toHaveTextContent('7')
  })

  it('presses', () => {
    const onToggle = vi.fn()
    render(<NoColletToggle count={3} shown onToggle={onToggle} />)

    fireEvent.click(screen.getByRole('button'))

    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  /** A control about an empty set is not drawn at all. */
  it('is absent where it would move no rows', () => {
    render(<NoColletToggle count={0} shown onToggle={() => {}} />)

    expect(screen.queryByRole('button')).toBeNull()
  })
})
