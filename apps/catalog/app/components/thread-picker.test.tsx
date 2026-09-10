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

/**
 * The control that opens the list, and the one that carries the chosen thread.
 *
 * With a search box in the box the button is a button and the *input* is the
 * combobox — the kit swaps one for the other on `data-popup-open`. While the
 * list is open the kit marks everything behind it inert, so the button has no
 * accessible name to be found by until the list closes; its label is what it is
 * found by either way.
 */
const threadButton = (): HTMLElement => screen.getByLabelText('Thread')

const show = (props: Partial<Parameters<typeof ThreadPicker>[0]> = {}) => {
  const onChange = vi.fn()
  render(
    <ThreadPicker
      holeDiameter={TAP_DRILL_FOR_M6}
      mode="plain"
      spec={null}
      unit="millimeters"
      onChange={onChange}
      {...props}
    />,
  )
  fireEvent.click(threadButton())
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
   * **The dialog says which thread and nothing about how it is made** (Paul,
   * 2026-09-07: "we should no longer show the 'cut tap' and 'form tap' rows in
   * the feature dialog when applying threads to a hole — it should just return
   * the right tap drills").
   *
   * Two rows of figures sat under the thread, on the box somebody opens to say
   * what the hole *is*. Which predrill the thread is started from is a
   * different decision, made over the drills it decides, and it is
   * `<PredrillChoice>` there now — `components/predrill-choice.test.tsx` holds
   * everything those rows were pinned for.
   */
  it('offers no way of making the thread, chosen or not', () => {
    show({ spec: threadNamed('M6×1'), mode: 'cut tap' })

    expect(screen.queryByRole('button', { name: /tap/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Standard predrill')).not.toBeInTheDocument()
    // Nor the figures those rows carried: ⌀5.00 for a cut tap, ⌀5.50 for a form.
    expect(screen.queryByText('⌀5.50 mm')).not.toBeInTheDocument()
  })

  /** A hole near no thread has nothing to offer, and says nothing about one. */
  it('claims nothing for a hole that reads as no thread', () => {
    show({ holeDiameter: 0.4 })

    expect(screen.queryByRole('group', { name: /Closest match/ })).not.toBeInTheDocument()
    expect(threadButton()).toBeInTheDocument()
  })
})

describe('picking a thread', () => {
  /** One click says both things: this hole is an M6, and it is cut-tapped. */
  it('takes the thread from the list, cut-tapped until somebody says otherwise', () => {
    const onChange = show()

    fireEvent.click(screen.getAllByRole('option', { name: /M6×1/ })[0]!)

    expect(onChange).toHaveBeenCalledWith({ mode: 'cut tap', spec: threadNamed('M6×1') })
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

    expect(threadButton()).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'M20×2.5' })).toBeInTheDocument()
  })

  /** A thread the hole does not read as is still shown as the choice it is. */
  it('shows a thread that is not on offer as the chosen one', () => {
    show({ spec: threadNamed('M20×2.5'), mode: 'cut tap' })

    expect(threadButton()).toHaveTextContent('M20×2.5')
  })

  /** The list is also a way back: a plain hole is one of its options. */
  it('goes back to a plain hole from the list', () => {
    const onChange = show({ spec: threadNamed('M6×1'), mode: 'cut tap' })

    fireEvent.click(screen.getByRole('option', { name: 'No thread — a plain hole' }))

    expect(onChange).toHaveBeenCalledWith({ mode: 'plain', spec: null })
  })
})

/**
 * **The list can be typed into as well as scrolled** (Paul, 2026-09-09: "I need
 * to be able to either select from the list we have now or enter text to search
 * the list and select from it"). Thirty-seven threads is a long scroll on the
 * hole that reads as the wrong thing, or as nothing.
 */
describe('searching the list', () => {
  const search = (): HTMLElement => screen.getByRole('combobox', { name: 'Search threads' })

  const type = (text: string) => {
    fireEvent.change(search(), { target: { value: text } })
  }

  it('opens with a search box, and the whole list under it', () => {
    show()

    expect(search()).toHaveValue('')
    expect(screen.getByRole('option', { name: 'M20×2.5' })).toBeInTheDocument()
  })

  /** Both groups narrow together: one list, one question. */
  it('narrows the list to what was typed', () => {
    show()
    type('M20')

    expect(screen.getByRole('option', { name: 'M20×2.5' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'M3×0.5' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: /Closest match/ })).not.toBeInTheDocument()
  })

  /**
   * A thread is written half a dozen ways, and none of them is the table's:
   * `1/4-20`, `1420`, `m6x1`, `#10 32`. ⌀5 is within a tenth of a 1/4-20's tap
   * drill, so it is listed twice — under the closest matches and again below.
   */
  it('reads a thread written the way a shop writes it', () => {
    show()
    type('1/4-20')

    expect(screen.getAllByRole('option', { name: /1\/4-20 UNC/ })).not.toHaveLength(0)
    expect(screen.queryByRole('option', { name: /1\/2-13 UNC/ })).not.toBeInTheDocument()
  })

  /** And the choice is made from the narrowed list, like any other. */
  it('takes the thread that was searched for', () => {
    const onChange = show()
    type('3/8-24')

    fireEvent.click(screen.getByRole('option', { name: '3/8-24 UNF' }))

    expect(onChange).toHaveBeenCalledWith({ mode: 'cut tap', spec: threadNamed('3/8-24 UNF') })
  })

  /** Text no thread answers says so, rather than showing an empty box. */
  it('says when nothing in the catalog is that thread', () => {
    show()
    type('M99')

    expect(screen.getByText(/No thread matches/)).toBeInTheDocument()
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  /** The way back to a plain hole is a searchable option like the rest. */
  it('keeps the plain-hole option out of a search for a thread', () => {
    show()
    type('M6')

    expect(
      screen.queryByRole('option', { name: 'No thread — a plain hole' }),
    ).not.toBeInTheDocument()
  })
})
