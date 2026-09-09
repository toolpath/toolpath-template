import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { threadNamed, type ThreadSpec } from 'shared/threads'
import { PredrillChoice } from './predrill-choice'

/**
 * The hole the thread is started from, over the drills it decides.
 *
 * These are the rows that stood under the thread on the feature dialog until
 * 2026-09-07, moved with everything they were pinned for: the two standard
 * predrills, how far the modelled hole is from each, and the tool list's three
 * states. `components/thread-picker.test.tsx` pins that the dialog no longer
 * offers them.
 */
const M6 = threadNamed('M6×1') as ThreadSpec

const show = (props: Partial<Parameters<typeof PredrillChoice>[0]> = {}) => {
  const onChange = vi.fn()
  render(
    <PredrillChoice
      spec={M6}
      mode="cut tap"
      onChange={onChange}
      holeDiameter={5}
      unit="millimeters"
      // The sheet's own: 0.004 in either way, in millimetres.
      deviation={{ over: 0.1016, under: 0.1016 }}
      {...props}
    />,
  )
  return onChange
}

const rows = () => ({
  cut: screen.getByRole('button', { name: /^Cut Tap/ }),
  form: screen.getByRole('button', { name: /^Form Tap/ }),
})

/**
 * **Nothing on the control is marked** (Paul, 2026-09-09: "we also shouldn't
 * show the X on drills"). The `✗` said no standard drill makes this predrill
 * from the model as drawn — true, and read as "this option is unavailable",
 * which it never meant: the taps are there and an end mill bores the hole. The
 * figures stay on the hover, and the list underneath says the rest in words.
 */
describe('what it never marks', () => {
  /** ⌀5.50 form predrill against a ⌀5.00 hole: 0.50 mm out of a 0.1016 band. */
  const refusing = { holeDiameter: 5, mode: 'cut tap' as const }

  it('marks a predrill the model cannot be read as with nothing at all', () => {
    show(refusing)

    expect(screen.queryByLabelText(/drill deviation/)).not.toBeInTheDocument()
    expect(document.querySelector('.text-danger')).toBeNull()
  })

  /** The figures survive the mark going: they are what the hover is for. */
  it('still says the predrill and the difference on the hover', () => {
    show(refusing)

    expect(within(rows().form).getByTitle(/⌀5\.50 mm/)).toBeVisible()
  })
})

describe('what it offers', () => {
  /**
   * **Two words, and no figures** (Paul, 2026-09-07: "don't show the numbers,
   * just tap or form drill").
   *
   * The chart size and the difference from the modelled hole were printed on
   * the control and again, per row, in the list underneath it — which is where
   * a shop reads a drill's deviation in the table's own columns. Named after
   * the hole rather than the tool, because the control is a predrill.
   */
  it('offers the two predrills by name, and prints no diameter', () => {
    show()
    const { cut, form } = rows()

    expect(cut).toHaveAttribute('aria-pressed', 'true')
    expect(form).toHaveAttribute('aria-pressed', 'false')
    // The Engine's charts for an M6×1: ⌀5.00 cut, ⌀5.50 form — neither on show.
    expect(cut).not.toHaveTextContent('5.00')
    expect(form).not.toHaveTextContent('5.50')
    expect(screen.queryByText(/⌀/)).not.toBeInTheDocument()
  })

  /** The figures are on the hover, for somebody checking what the list was judged against. */
  it('says the predrill it starts from, and how far the model is off it, on hover', () => {
    show()

    const hover = (each: HTMLElement) => within(each).getByTitle(/⌀/).getAttribute('title')
    // ⌀5 is the cut tap's drill exactly, and half a millimetre under the form's.
    expect(hover(rows().cut)).toContain('⌀5.00 mm')
    expect(hover(rows().cut)).toContain('exactly on it')
    expect(hover(rows().form)).toContain('−0.50')
  })

  /** Thread milling is out for now (Paul, 2026-09-01), so it is not offered. */
  it('offers no thread mill', () => {
    show()

    expect(screen.queryByRole('button', { name: /thread mill/ })).not.toBeInTheDocument()
  })

  /** The press says how the thread is made, and nothing else about the hole. */
  it('reports the way of making it that was pressed', () => {
    const onChange = show()

    fireEvent.click(rows().form)

    expect(onChange).toHaveBeenCalledWith('form tap')
  })
})

/**
 * **A predrill the model cannot be read as is said, not marked** (Paul,
 * 2026-09-09: "we also shouldn't show the X on drills - if there are no drills,
 * it should show 'no drills matching predrill size, showing end mills'").
 *
 * It was a red `✗` here from 2026-09-02 until then, and it read as *this option
 * is unavailable* — which it never was: the taps are in the list beside it, and
 * an end mill bores the hole the drills cannot. What it actually says belongs
 * in the list underneath, in words, beside the mills that answer it.
 */
describe('a predrill the model cannot be read as', () => {
  /** ⌀5.00 is the cut tap's own drill, and 0.50 under the form tap's. */
  it('is painted no differently from the one the model is on', () => {
    show()
    const { cut, form } = rows()

    expect(cut.className).not.toContain('text-danger')
    expect(form.className).not.toContain('text-danger')
  })

  it('hangs no glyph on either', () => {
    show()

    expect(within(rows().form).queryByRole('img')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/drill deviation/)).not.toBeInTheDocument()
  })

  /** The figures are still one hover away, and say what it means for the list. */
  it('says the predrill, the difference, and that a mill is what bores it', () => {
    show()

    const says =
      within(rows().form)
        .getByTitle(/⌀5\.50 mm/)
        .getAttribute('title') ?? ''
    expect(says).toContain('further from the modelled hole')
    expect(says).toContain('end mill that bores it')
  })

  /** Widen the band past it and the same figure is a difference like any other. */
  it('reads the band rather than a number of its own', () => {
    show({ deviation: { over: 1, under: 1 } })

    expect(
      within(rows().form)
        .getByTitle(/⌀5\.50 mm/)
        .getAttribute('title'),
    ).toContain('the modelled hole is')
  })
})
