import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ThreadPicker } from './thread-picker'
import { threadNamed } from 'shared/threads'

describe('how a hole is made', () => {
  /**
   * The model draws a threaded hole as a hole, so the panel guesses from the
   * diameter — and choosing a mode takes the guess rather than making somebody
   * find it (Paul, 2026-08-31).
   */
  it('takes the thread read off the hole when a mode is chosen', () => {
    const onChange = vi.fn()
    render(<ThreadPicker holeDiameter={5} mode="plain" spec={null} onChange={onChange} unit="mm" />)
    fireEvent.click(screen.getByRole('button', { name: 'Cut tap' }))

    expect(onChange).toHaveBeenCalledWith({
      mode: 'cut tap',
      spec: expect.objectContaining({ name: 'M6×1' }),
    })
  })

  /** Four modes, because each starts from a different hole. */
  it('offers every way of making a thread', () => {
    render(<ThreadPicker holeDiameter={5} mode="plain" spec={null} onChange={vi.fn()} unit="mm" />)

    for (const name of ['Plain', 'Cut tap', 'Form tap', 'Thread mill']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })

  /**
   * And says which hole the mode drills, because that is the number the drill
   * list is judged against — a form tap starts four tenths bigger than a cut
   * tap on an M6.
   */
  it('says what it read and what the mode drills', () => {
    const { rerender } = render(
      <ThreadPicker
        holeDiameter={5}
        mode="cut tap"
        spec={threadNamed('M6×1')}
        onChange={vi.fn()}
        unit="mm"
      />,
    )

    expect(screen.getByText(/is this thread's tap drill/)).toBeInTheDocument()
    expect(screen.getByText(/cut tap starts from ⌀5\.00 mm/)).toBeInTheDocument()

    rerender(
      <ThreadPicker
        holeDiameter={5}
        mode="form tap"
        spec={threadNamed('M6×1')}
        onChange={vi.fn()}
        unit="mm"
      />,
    )

    expect(screen.getByText(/form tap starts from ⌀5\.50 mm/)).toBeInTheDocument()
  })

  it('lets the thread be overridden from the whole table', () => {
    const onChange = vi.fn()
    render(
      <ThreadPicker
        holeDiameter={5}
        mode="cut tap"
        spec={threadNamed('M6×1')}
        onChange={onChange}
        unit="mm"
      />,
    )
    fireEvent.change(screen.getByRole('combobox', { name: 'Thread' }), {
      target: { value: 'M8×1.25' },
    })

    expect(onChange).toHaveBeenCalledWith({
      mode: 'cut tap',
      spec: expect.objectContaining({ name: 'M8×1.25' }),
    })
  })

  /** And back to a plain hole, which is what most holes are. */
  it('goes back to a plain hole', () => {
    const onChange = vi.fn()
    render(
      <ThreadPicker
        holeDiameter={5}
        mode="cut tap"
        spec={threadNamed('M6×1')}
        onChange={onChange}
        unit="mm"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Plain' }))

    expect(onChange).toHaveBeenCalledWith({ mode: 'plain', spec: null })
  })
})
