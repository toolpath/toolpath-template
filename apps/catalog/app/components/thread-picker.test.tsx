import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { threadNamed } from 'shared/threads'
import { ThreadPicker } from './thread-picker'

/**
 * The group the closest readings are ranked into. Its options are named the
 * same as their twins in the full list below it, so a lookup says which.
 */
const closestMatches = (): HTMLElement =>
  screen.getByRole('group', { name: 'Closest match to modeled diameter' })

/** ⌀5.00 is M6×1's tap drill, which is the reading a hole is likeliest to be drawn at. */
const TAP_DRILL_FOR_M6 = 5

const show = (props: Partial<Parameters<typeof ThreadPicker>[0]> = {}) => {
  const onChange = vi.fn()
  render(
    <ThreadPicker
      holeDiameter={TAP_DRILL_FOR_M6}
      mode="plain"
      spec={null}
      unit="millimeters"
      onChange={onChange}
      // The sheet's own: 0.004 in either way, in millimetres.
      deviation={{ over: 0.1016, under: 0.1016 }}
      {...props}
    />,
  )
  fireEvent.click(screen.getByRole('combobox', { name: /Thread/ }))
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
    // ⌀5 is M6×1's tap drill, and the option names that diameter — nothing more.
    expect(
      within(closestMatches()).getByRole('option', { name: 'M6×1 — tap drill' }),
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

  /**
   * **The list ranks; it does not argue** (Paul, 2026-09-02: "we don't need to
   * defend our match on the thread spec in the drop down"). A hole drawn a
   * little over the tap drill still reads as that thread, and the option says
   * which diameter it matched — not how far off it is, which was a case being
   * made for a guess in a list somebody is scanning.
   */
  it('names the diameter a thread was matched on, and no deviation', () => {
    show({ holeDiameter: 5.08 })

    expect(
      within(closestMatches()).getByRole('option', { name: 'M6×1 — tap drill' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /\+0\.08/ })).not.toBeInTheDocument()
  })

  /** And the group says what the ranking is, rather than what it read. */
  it('heads the matches by what they are closest to', () => {
    show()

    expect(closestMatches()).toBeInTheDocument()
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

    const cut = screen.getByRole('button', { name: /^Cut tap/ })
    const form = screen.getByRole('button', { name: /^Form tap/ })

    // The Engine's charts: ⌀5.00 for a cut tap, ⌀5.50 for a form tap.
    expect(screen.getByText('Standard predrill')).toBeInTheDocument()
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
    expect(screen.getByRole('button', { name: /^Cut tap/ })).toHaveTextContent('exactly')
    expect(screen.getByRole('button', { name: /^Form tap/ })).toHaveTextContent('−0.50')
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

    expect(screen.queryByRole('group', { name: /Closest match/ })).not.toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /Thread/ })).toBeInTheDocument()
  })
})

describe('picking a thread', () => {
  /** One click says both things: this hole is an M6, and it is cut-tapped. */
  it('takes the thread from the list, cut-tapped until somebody says otherwise', () => {
    const onChange = show()

    fireEvent.click(screen.getAllByRole('option', { name: /M6×1/ })[0]!)

    expect(onChange).toHaveBeenCalledWith({ mode: 'cut tap', spec: threadNamed('M6×1') })
  })

  /** And the way it is made is the chip, on the thread already chosen. */
  it('sets the method on the thread that is chosen', () => {
    const onChange = show({ spec: threadNamed('M6×1'), mode: 'cut tap' })

    fireEvent.click(screen.getByRole('button', { name: /^Form tap/ }))

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

    expect(screen.getByRole('combobox', { name: 'Thread' })).toHaveTextContent('M20×2.5')
  })

  /** The list is also a way back: a plain hole is one of its options. */
  it('goes back to a plain hole from the list', () => {
    const onChange = show({ spec: threadNamed('M6×1'), mode: 'cut tap' })

    fireEvent.click(screen.getByRole('option', { name: 'No thread — a plain hole' }))

    expect(onChange).toHaveBeenCalledWith({ mode: 'plain', spec: null })
  })
})

/**
 * **The two figures said the same thing in the same colour** (Paul,
 * 2026-09-02: "warning visualization is not right for form taps — this should
 * follow the conventions you just said to me").
 *
 * On an M6×1 drawn at ⌀5.00 the cut tap is exactly on its predrill and the
 * form tap half a millimetre under it — five times the shop's own drill
 * deviation — and both printed in the same grey. The tool list's convention,
 * in the list's colours: plain inside the band, red past it.
 */
describe('how far the model is from each predrill', () => {
  const rows = () => {
    show({ spec: threadNamed('M6×1'), mode: 'cut tap', holeDiameter: 5 })
    return {
      cut: screen.getByRole('button', { name: /^Cut tap/ }),
      form: screen.getByRole('button', { name: /^Form tap/ }),
    }
  }

  /** Both figures the refusal is about: the predrill, and how far off it is. */
  it('paints a difference past the shop’s deviation red, and leaves the rest plain', () => {
    const { cut, form } = rows()

    // ⌀5.00 is the cut tap's own drill, and 0.50 under the form tap's.
    expect(cut.querySelector('.text-danger')).toBeNull()
    const red = [...form.querySelectorAll('.text-danger')].map((each) => each.textContent).join(' ')
    expect(red).toContain('⌀5.50')
    expect(red).toContain('−0.50')
  })

  /**
   * **The third glyph** (Paul, 2026-09-02: "diameter number should be red and a
   * red x icon to hover over to see info"). Exact and inside-the-band each hang
   * their sentence on an icon; past the band had a bare red number, so the one
   * state worth stopping on was the only one with nothing to hover.
   */
  it('hangs a red x carrying the refusal on a difference past the band', () => {
    const { cut, form } = rows()

    expect(within(form).getByLabelText(/Further from the modelled hole/)).toBeInTheDocument()
    expect(within(cut).queryByLabelText(/Further from the modelled hole/)).not.toBeInTheDocument()
  })

  /**
   * **The table's three states, not two** (Paul, 2026-09-02: "form taps are not
   * following that, they are using the old convention"): a green tick where
   * the model is exactly the predrill, a grey `i` where it is inside the shop's
   * deviation, red past it.
   */
  it('ticks the predrill the model is exactly on', () => {
    const { cut } = rows()

    expect(within(cut).getByLabelText('exactly this predrill')).toBeInTheDocument()
  })

  it('hangs a grey glyph on a difference inside the band', () => {
    show({
      spec: threadNamed('M6×1'),
      mode: 'cut tap',
      holeDiameter: 5.05,
      deviation: { over: 0.2, under: 0.2 },
    })
    const cut = screen.getByRole('button', { name: /^Cut tap/ })

    expect(cut.querySelector('.text-danger')).toBeNull()
    expect(within(cut).getByLabelText(/inside the shop's max drill deviation/)).toBeInTheDocument()
  })

  /** Widen the band past it and the same figure is a difference like any other. */
  it('reads the band rather than a number of its own', () => {
    show({
      spec: threadNamed('M6×1'),
      mode: 'cut tap',
      holeDiameter: 5,
      deviation: { over: 1, under: 1 },
    })

    expect(
      screen.getByRole('button', { name: /^Form tap/ }).querySelector('.text-danger'),
    ).toBeNull()
  })
})
