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
  cut: screen.getByRole('button', { name: /^Tap drill/ }),
  form: screen.getByRole('button', { name: /^Form drill/ }),
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
 * **The one state worth stopping on keeps its colour** (Paul, 2026-09-02:
 * "warning visualization is not right for form taps — this should follow the
 * conventions you just said to me").
 *
 * The tick and the grey `i` annotated figures the control no longer shows. Red
 * says what the list underneath cannot: this predrill is not a hole any
 * standard drill makes from the model as drawn.
 */
describe('a predrill the model cannot be read as', () => {
  it('paints it red, and leaves the other alone', () => {
    show()
    const { cut, form } = rows()

    // ⌀5.00 is the cut tap's own drill, and 0.50 under the form tap's.
    expect(cut).not.toHaveClass(/text-danger/)
    expect(form.className).toContain('text-danger')
  })

  /**
   * **A refusal has a glyph carrying the words** (Paul, 2026-09-02: "a red x
   * icon to hover over to see info"), and the figures are in them.
   */
  it('hangs a red x carrying the refusal, with the numbers in it', () => {
    show()

    const refusal = within(rows().form).getByLabelText(/no standard drill makes both/)
    expect(refusal).toBeInTheDocument()
    expect(refusal.getAttribute('aria-label')).toContain('⌀5.50 mm')
    expect(
      within(rows().cut).queryByLabelText(/no standard drill makes both/),
    ).not.toBeInTheDocument()
  })

  /** Widen the band past it and the same figure is a difference like any other. */
  it('reads the band rather than a number of its own', () => {
    show({ deviation: { over: 1, under: 1 } })

    expect(rows().form.className).not.toContain('text-danger')
    expect(screen.queryByLabelText(/no standard drill makes both/)).not.toBeInTheDocument()
  })
})
