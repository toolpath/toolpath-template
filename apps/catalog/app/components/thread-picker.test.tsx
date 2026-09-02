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
   * **Every number says what it is** (Paul, 2026-09-01: "it's not really clear
   * what the boxes are showing — tap drill diameter, diameter of the modeled
   * hole, what"). The hole the model draws, and — in the list — what each
   * thread reads as and how far the model is from that size.
   */
  it('labels the modelled hole, and puts the suggestions in the list', () => {
    show()

    expect(screen.getByText('Modeled hole diameter:')).toBeInTheDocument()
    expect(screen.getByText('⌀5.00 mm')).toBeInTheDocument()
    // ⌀5 is exactly M6×1's tap drill, so the option says so rather than "+0.00".
    expect(
      screen.getByRole('option', { name: 'M6×1 — its tap drill, exactly' }),
    ).toBeInTheDocument()
  })

  /**
   * **One control** (Paul, 2026-09-01: "only suggest threads in the drop down
   * list — don't show the suggested thread spec at all, just the drop down").
   */
  it('offers the suggestions nowhere but the list', () => {
    show()

    expect(screen.queryByRole('button', { name: /M6×1/ })).not.toBeInTheDocument()
  })

  /** A hole drawn a little over the tap drill says by how much, and which way. */
  it('says how far the model is from the size the reading expects', () => {
    show({ holeDiameter: 5.08 })

    expect(screen.getByRole('option', { name: /M6×1 — its tap drill, \+0.08/ })).toBeInTheDocument()
  })

  /**
   * **A row each, with the drill it starts from** (Paul, 2026-09-02: "we should
   * show the expected cut and form tap drill for cut and form taps when a
   * thread is selected from the drop down — it should show the cut and form tap
   * options in rows with standard tap drill diameters for each").
   *
   * The numbers came off these controls on 2026-09-01, when they sat under a
   * list of *suggested* threads and three diameters were on screen at once.
   * With the thread settled they are the question: the two ways of making it
   * want different holes, and the drill list is judged against whichever is
   * chosen.
   */
  it('offers cut and form tap as rows, each with its own standard tap drill', () => {
    show({ spec: threadNamed('M6×1'), mode: 'cut tap' })

    const cut = screen.getByRole('button', { name: 'M6×1 cut tap' })
    const form = screen.getByRole('button', { name: 'M6×1 form tap' })

    // The Engine's charts: ⌀5.00 for a cut tap, ⌀5.50 for a form tap.
    expect(cut).toHaveTextContent('Cut tap')
    expect(cut).toHaveTextContent('⌀5.00 mm')
    expect(form).toHaveTextContent('⌀5.50 mm')
    expect(cut).toHaveAttribute('aria-pressed', 'true')
    expect(form).toHaveAttribute('aria-pressed', 'false')
  })

  /** And how far the hole as modelled is from each of them. */
  it('says how far the modelled hole is from each drill', () => {
    show({ spec: threadNamed('M6×1'), mode: 'cut tap', holeDiameter: 5 })

    // ⌀5 is the cut tap's drill exactly, and half a millimetre under the form's.
    expect(screen.getByRole('button', { name: 'M6×1 cut tap' })).toHaveTextContent('exactly')
    expect(screen.getByRole('button', { name: 'M6×1 form tap' })).toHaveTextContent('−0.50')
  })

  /** Nothing to make until there is a thread to make. */
  it('offers no way of making a plain hole', () => {
    show()

    expect(screen.queryByRole('button', { name: /tap/ })).not.toBeInTheDocument()
  })

  /** Thread milling is out for now (Paul, 2026-09-01), so it is not offered. */
  it('offers no thread mill', () => {
    show({ spec: threadNamed('M6×1'), mode: 'cut tap' })

    expect(screen.queryByRole('button', { name: /thread mill/ })).not.toBeInTheDocument()
  })

  /** A hole near no thread has nothing to offer, and says nothing about one. */
  it('claims nothing for a hole that reads as no thread', () => {
    show({ holeDiameter: 0.4 })

    expect(screen.queryByRole('group', { name: /Suggested/ })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /Thread/ })).toBeInTheDocument()
  })
})

describe('picking a thread', () => {
  /** One click says both things: this hole is an M6, and it is cut-tapped. */
  it('takes the thread from the list, cut-tapped until somebody says otherwise', () => {
    const onChange = show()

    fireEvent.change(screen.getByRole('combobox', { name: /Thread/ }), {
      target: { value: 'M6×1' },
    })

    expect(onChange).toHaveBeenCalledWith({ mode: 'cut tap', spec: threadNamed('M6×1') })
  })

  /** And the way it is made is the chip, on the thread already chosen. */
  it('sets the method on the thread that is chosen', () => {
    const onChange = show({ spec: threadNamed('M6×1'), mode: 'cut tap' })

    fireEvent.click(screen.getByRole('button', { name: 'M6×1 form tap' }))

    expect(onChange).toHaveBeenCalledWith({ mode: 'form tap', spec: threadNamed('M6×1') })
  })

  /**
   * **The heading says what the hole is** (Paul, 2026-09-02: "when a hole is
   * selected, it should say <Thread Spec> Threaded Hole instead of
   * thread:plain"), and the way back out is the first option in the list —
   * "remove the 'make it plain' button, you can just do that through the drop
   * down" (same day). One way to say a thing is enough.
   */
  it('heads the box with the thread, and offers no second way back to plain', () => {
    show({ spec: threadNamed('M6×1'), mode: 'cut tap' })

    expect(screen.getByText('M6×1 threaded hole')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /plain/i })).not.toBeInTheDocument()
  })

  /** With no thread it is the question rather than an answer. */
  it('heads the box “Thread” while the hole is plain', () => {
    show()

    expect(screen.getByText('Thread')).toBeInTheDocument()
  })

  /**
   * On show and labelled: behind a link it read as a sentence rather than a
   * control, and nobody knew there was a way to say something else.
   */
  it('shows the full list, labelled for what it is', () => {
    show()

    expect(screen.getByRole('combobox', { name: /Thread/ })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'M20×2.5' })).toBeInTheDocument()
  })

  /** A thread the hole does not read as is still shown as the choice it is. */
  it('shows a thread that is not on offer as the chosen one', () => {
    show({ spec: threadNamed('M20×2.5'), mode: 'cut tap' })

    expect(screen.getByRole('combobox', { name: /Thread/ })).toHaveValue('M20×2.5')
  })

  /** The list is also a way back: a plain hole is one of its options. */
  it('goes back to a plain hole from the list', () => {
    const onChange = show({ spec: threadNamed('M6×1'), mode: 'cut tap' })

    fireEvent.change(screen.getByRole('combobox', { name: /Thread/ }), {
      target: { value: '' },
    })

    expect(onChange).toHaveBeenCalledWith({ mode: 'plain', spec: null })
  })
})
