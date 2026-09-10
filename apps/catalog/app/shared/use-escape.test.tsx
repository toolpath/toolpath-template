import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { layerCount, useEscape } from './use-escape'

/** One press, one meaning: the page under a dialog that is open over it. */
const Page = () => {
  const [pressed, setPressed] = useState<Array<string>>([])
  const [open, setOpen] = useState(false)

  useEscape(true, () => setPressed((was) => [...was, 'page']))
  useEscape(open, () => {
    setPressed((was) => [...was, 'dialog'])
    setOpen(false)
  })

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        open
      </button>
      <p data-testid="pressed">{pressed.join(' ')}</p>
      <p data-testid="open">{open ? 'open' : 'shut'}</p>
    </div>
  )
}

const escape = (init: KeyboardEventInit = {}) =>
  fireEvent.keyDown(document, { key: 'Escape', ...init })

describe('what one press of Escape reaches', () => {
  /**
   * The defect this exists to prevent: the filter rail answered Escape beside
   * the page rather than instead of it, so putting a panel away also dropped
   * the reading behind it.
   */
  it('is the newest thing on the screen, and only that', () => {
    render(<Page />)

    fireEvent.click(screen.getByRole('button', { name: 'open' }))
    escape()

    expect(screen.getByTestId('pressed')).toHaveTextContent('dialog')
    expect(screen.getByTestId('open')).toHaveTextContent('shut')
  })

  /** With the dialog gone the press belongs to the page again. */
  it('goes back to the page once what was over it is closed', () => {
    render(<Page />)

    fireEvent.click(screen.getByRole('button', { name: 'open' }))
    escape()
    escape()

    expect(screen.getByTestId('pressed')).toHaveTextContent('dialog page')
  })

  /** A layer that is not open is not listening, and leaves nothing behind. */
  it('never reaches a closed layer, and unmounting drops it', () => {
    const view = render(<Page />)
    const before = layerCount()

    escape()
    expect(screen.getByTestId('pressed')).toHaveTextContent('page')

    fireEvent.click(screen.getByRole('button', { name: 'open' }))
    expect(layerCount()).toBe(before + 1)

    view.unmount()
    expect(layerCount()).toBe(before - 1)
  })

  /**
   * A `@toolpath/ui` popover closes its own list on Escape and marks the press
   * handled, so a combobox inside a dialog does not close the dialog too.
   */
  it('leaves a press something else has already answered alone', () => {
    render(<Page />)

    const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true })
    event.preventDefault()
    document.dispatchEvent(event)

    expect(screen.getByTestId('pressed')).toHaveTextContent('')
  })
})
