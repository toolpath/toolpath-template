import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { threadNamed } from 'shared/threads'
import { ThreadPicker } from './thread-picker'

/** ⌀5.00 is M6×1's tap drill, which is the reading a hole is likeliest to be drawn at. */
const TAP_DRILL_FOR_M6 = 5

const show = (props: Partial<Parameters<typeof ThreadPicker>[0]> = {}) => {
  const onChange = vi.fn()
  render(
    <ThreadPicker
      holeDiameter={TAP_DRILL_FOR_M6}
      mode="plain"
      spec={null}
      unit="mm"
      onChange={onChange}
      {...props}
    />,
  )
  return onChange
}

describe('what the panel says about a hole before anything is chosen', () => {
  /**
   * The whole point of the notice: a hole at somebody's tap drill is very
   * probably threaded, and being told so on selection is the difference
   * between finding the tap and knowing to look for one (Paul, 2026-09-01).
   */
  it('says what the hole read as before anything is chosen', () => {
    show()

    expect(screen.getByText(/is M6×1’s tap drill/)).toBeInTheDocument()
  })

  /**
   * The row is the thread and the chips are the ways to make it, each marked
   * with the hole it starts from: a form tap wants a bigger hole than a cut
   * tap, and that difference is the reason to print it (Paul, 2026-09-01).
   */
  it('offers cut and form for each thread, each with its own drill', () => {
    show()

    // A form tap wants `d − p/2`, half a millimetre more hole than the cut tap's.
    expect(screen.getByRole('button', { name: 'M6×1 cut tap' })).toHaveTextContent('cut ⌀5.00')
    expect(screen.getByRole('button', { name: 'M6×1 form tap' })).toHaveTextContent('form ⌀5.50')
  })

  /** Thread milling is out for now (Paul, 2026-09-01), so it is not offered. */
  it('offers no thread mill', () => {
    show()

    expect(screen.queryByRole('button', { name: /thread mill/ })).not.toBeInTheDocument()
  })

  /** A hole near no thread has nothing to offer, and says nothing about one. */
  it('claims nothing for a hole that reads as no thread', () => {
    show({ holeDiameter: 0.4 })

    expect(screen.queryByText(/is .*’s tap drill/)).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /Manually spec thread/ })).toBeInTheDocument()
  })
})

describe('picking a thread', () => {
  /** One click says both things: this hole is an M6, and it is cut-tapped. */
  it('sets the thread and the method together', () => {
    const onChange = show()

    fireEvent.click(screen.getByRole('button', { name: 'M6×1 form tap' }))

    expect(onChange).toHaveBeenCalledWith({ mode: 'form tap', spec: threadNamed('M6×1') })
  })

  /** And the way back out, without going through the list. */
  it('goes back to a plain hole in one click', () => {
    const onChange = show({ spec: threadNamed('M6×1'), mode: 'cut tap' })

    fireEvent.click(screen.getByRole('button', { name: 'plain hole' }))

    expect(onChange).toHaveBeenCalledWith({ mode: 'plain', spec: null })
  })

  /**
   * On show and labelled: behind a link it read as a sentence rather than a
   * control, and nobody knew there was a way to say something else.
   */
  it('shows the full list, labelled for what it is', () => {
    show()

    expect(screen.getByRole('combobox', { name: /Manually spec thread/ })).toBeInTheDocument()
  })

  /** A thread the hole does not read as is still shown as the choice it is. */
  it('shows a thread that is not on offer as the chosen one', () => {
    show({ spec: threadNamed('M20×2.5'), mode: 'cut tap' })

    expect(screen.getByRole('combobox', { name: /Manually spec thread/ })).toHaveValue('M20×2.5')
  })

  /** The list is also a way back: a plain hole is one of its options. */
  it('goes back to a plain hole from the list', () => {
    const onChange = show({ spec: threadNamed('M6×1'), mode: 'cut tap' })

    fireEvent.change(screen.getByRole('combobox', { name: /Manually spec thread/ }), {
      target: { value: '' },
    })

    expect(onChange).toHaveBeenCalledWith({ mode: 'plain', spec: null })
  })
})
