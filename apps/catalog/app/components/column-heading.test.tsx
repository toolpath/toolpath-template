import { useRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ColumnFilterMenu } from './column-heading'
import type { ColumnHeadingProps } from './column-heading'
import type { ColumnOverride } from './column-filter'

/**
 * The menu as a list draws it: over a funnel the list owns.
 *
 * `FilterMenu` measures itself against an element carrying this column's
 * `data-column-funnel`, and closes itself where there is none — so the harness
 * has to draw the funnel the header would, or the menu never appears.
 */
const Menu = (props: ColumnHeadingProps & { readonly onClose?: () => void }) => {
  const anchors = useRef<HTMLDivElement>(null)
  return (
    <div ref={anchors}>
      <span data-column-funnel={props.code} />
      <ColumnFilterMenu {...props} anchors={anchors} onClose={props.onClose ?? (() => {})} />
    </div>
  )
}

const OPTIONS = [
  { value: 'Flat end mill', label: 'Flat end mill', count: 1342 },
  { value: 'Bull nose end mill', label: 'Bull nose end mill', count: 868 },
]

/**
 * **A filter needs a way out beside its way of saying done** (Paul, 2026-09-09:
 * "can I get an X next to the check mark to clear all filters in the filter
 * dialogs?"). The tick keeps the filter and closes; the × drops the whole of
 * what this column is asking, whatever shape it asks it in.
 */
describe('clearing a column from inside its own menu', () => {
  it('takes back every tick on a term column at once', () => {
    const onChosen = vi.fn()
    render(
      <Menu
        code="type"
        label="Type"
        ask={{ shape: 'terms', axis: 'type' }}
        options={OPTIONS}
        chosen={['Flat end mill', 'Bull nose end mill']}
        onChosen={onChosen}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Clear the Type filter' }))

    expect(onChosen).toHaveBeenCalledWith([])
  })

  it('takes back a range', () => {
    const onBound = vi.fn()
    render(
      <Menu
        code="DC"
        label="Diameter"
        ask={{ shape: 'range', kind: 'length' }}
        unit="millimeters"
        bound={{ min: 3, max: 6 }}
        onBound={onBound}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Clear the Diameter filter' }))

    expect(onBound).toHaveBeenCalledWith(undefined)
  })

  it('takes back a typed word', () => {
    const onText = vi.fn()
    render(
      <Menu
        code="name"
        label="Name"
        ask={{ shape: 'text' }}
        text="harvi"
        onText={onText}
        // A text filter has no options of its own.
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Clear the Name filter' }))

    expect(onText).toHaveBeenCalledWith('')
  })

  /** An × over a filter nobody set is an × that does nothing. */
  it('offers nothing to clear while the column narrows nothing', () => {
    render(
      <Menu
        code="type"
        label="Type"
        ask={{ shape: 'terms', axis: 'type' }}
        options={OPTIONS}
        chosen={[]}
        onChosen={() => {}}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Clear the Type filter' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Done filtering by Type' })).toBeInTheDocument()
  })

  /**
   * A bound the part stated is not this menu's to drop: the tap list is swept
   * on it (`column-filters.ts` § `askOfTapColumn`), so there is nothing here
   * an × could hand back.
   */
  it('offers nothing to clear on a bound the part stated', () => {
    render(
      <Menu
        code="DC"
        label="Thread diameter"
        ask={{ shape: 'range', kind: 'length' }}
        unit="millimeters"
        bound={{ min: 6, max: 6 }}
        why="From the thread on this hole."
      />,
    )

    expect(
      screen.queryByRole('button', { name: 'Clear the Thread diameter filter' }),
    ).not.toBeInTheDocument()
  })

  /** Clearing leaves the menu open: the press after "not that" is "this instead". */
  it('keeps the menu open', () => {
    const onClose = vi.fn()
    render(
      <Menu
        code="type"
        label="Type"
        ask={{ shape: 'terms', axis: 'type' }}
        options={OPTIONS}
        chosen={['Flat end mill']}
        onChosen={() => {}}
        onClose={onClose}
      />,
    )

    // Counted from before the press rather than from zero: jsdom reports the
    // funnel as invisible, so `FilterMenu` has already closed itself once by
    // the time anything is pressed. What this pins is that clearing adds none.
    const before = onClose.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Clear the Type filter' }))

    expect(onClose.mock.calls.length).toBe(before)
  })
})

/**
 * **The tick is what overrules the rules** (Paul, 2026-09-09: "clicking the
 * check mark should override the rules … the button shouldn't be a button, it
 * should be a warning, then I confirm if I want to do it by clicking the
 * check"). The chip that used to sit beside it is gone: the sentence under the
 * boxes is the warning, and the one way out of the dialog is the answer to it.
 */
describe('confirming an override', () => {
  const offer = (over: Partial<ColumnOverride> = {}): ColumnOverride => ({
    suggested: { max: 5 },
    available: 948,
    on: false,
    onOverride: vi.fn(),
    say: (bound) => `at most ${String(bound.max)} mm`,
    ...over,
  })

  const range = (override: ColumnOverride, onClose = () => {}) => (
    <Menu
      code="DC"
      label="Diameter"
      ask={{ shape: 'range', kind: 'length' }}
      unit="millimeters"
      bound={{ max: 20 }}
      onBound={() => {}}
      override={override}
      onClose={onClose}
    />
  )

  it('sets the rules aside and closes, from the one press', () => {
    const onOverride = vi.fn()
    const onClose = vi.fn()
    render(range(offer({ onOverride }), onClose))

    const tick = screen.getByRole('button', {
      name: 'Keep this diameter and override its rules',
    })
    const before = onClose.mock.calls.length
    fireEvent.click(tick)

    expect(onOverride).toHaveBeenCalled()
    expect(onClose.mock.calls.length).toBe(before + 1)
  })

  /** There is one press in the chrome for this, and it is the tick. */
  it('offers no second press beside it', () => {
    render(range(offer()))

    expect(
      screen.queryByRole('button', { name: 'Override the diameter rules' }),
    ).not.toBeInTheDocument()
  })

  it('just closes where the rules are keeping nothing back', () => {
    const onOverride = vi.fn()
    render(range(offer({ available: 0, onOverride })))

    fireEvent.click(screen.getByRole('button', { name: 'Done filtering by Diameter' }))

    expect(onOverride).not.toHaveBeenCalled()
  })

  /**
   * A confirmation of what is already true is a press with nothing to say —
   * and the way back out of an override is the number, not this button
   * (`part.tsx` § `overrideFor`).
   */
  it('just closes where the rules are already set aside', () => {
    const onOverride = vi.fn()
    render(range(offer({ on: true, onOverride })))

    fireEvent.click(screen.getByRole('button', { name: 'Done filtering by Diameter' }))

    expect(onOverride).not.toHaveBeenCalled()
  })

  it("just closes where the number is still the geometry's", () => {
    const onOverride = vi.fn()
    render(
      <Menu
        code="DC"
        label="Diameter"
        ask={{ shape: 'range', kind: 'length' }}
        unit="millimeters"
        bound={{ max: 5 }}
        onBound={() => {}}
        override={offer({ onOverride })}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Done filtering by Diameter' }))

    expect(onOverride).not.toHaveBeenCalled()
  })
})

/**
 * **Enter is the tick** (Paul, 2026-09-09: "hitting enter with a filter dialog
 * shown should confirm it just like the check mark does"). Every filter here
 * commits as it is typed, so the press has nothing to save — what it does is
 * say *done* without reaching for the mouse, and where the tick is confirming
 * an override it confirms the same one.
 */
describe('Enter, from inside a filter menu', () => {
  it('closes a term column from its search box', () => {
    const onClose = vi.fn()
    render(
      <Menu
        code="type"
        label="Type"
        ask={{ shape: 'terms', axis: 'type' }}
        options={OPTIONS}
        chosen={['Flat end mill']}
        onChosen={() => {}}
        onClose={onClose}
      />,
    )

    const before = onClose.mock.calls.length
    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Search type values' }), {
      key: 'Enter',
    })

    expect(onClose.mock.calls.length).toBe(before + 1)
  })

  it('closes a typed word from its own box', () => {
    const onClose = vi.fn()
    render(
      <Menu
        code="name"
        label="Name"
        ask={{ shape: 'text' }}
        text="harvi"
        onText={() => {}}
        onClose={onClose}
      />,
    )

    const before = onClose.mock.calls.length
    fireEvent.keyDown(screen.getByRole('searchbox', { name: 'Search by name' }), { key: 'Enter' })

    expect(onClose.mock.calls.length).toBe(before + 1)
  })

  it('overrules the rules where the tick would have, from the number box', () => {
    const onOverride = vi.fn()
    const onClose = vi.fn()
    render(
      <Menu
        code="DC"
        label="Diameter"
        ask={{ shape: 'range', kind: 'length' }}
        unit="millimeters"
        bound={{ max: 20 }}
        onBound={() => {}}
        override={{
          suggested: { max: 5 },
          available: 948,
          on: false,
          onOverride,
          say: (bound) => `at most ${String(bound.max)} mm`,
        }}
        onClose={onClose}
      />,
    )

    const before = onClose.mock.calls.length
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Diameter — value' }), { key: 'Enter' })

    expect(onOverride).toHaveBeenCalled()
    expect(onClose.mock.calls.length).toBe(before + 1)
  })

  /**
   * **Enter is the dialog's, never a control's** (Paul, 2026-09-10: "enter
   * should never check or uncheck, it only works at the dialog level for the
   * checkbox selection filters").
   *
   * It used to leave a focused control its own press — Enter on the × cleared
   * and left the menu standing. That exemption is what put Enter on the kit's
   * `Checkbox`, which is a `<button role="checkbox">` holding the focus of the
   * last value clicked: the press somebody meant as "done" unticked it instead.
   * There is one rule now rather than a rule and an exception, and the × is a
   * click away as it always was.
   */
  it('finishes the filter from the ×, rather than clearing', () => {
    const onClose = vi.fn()
    render(
      <Menu
        code="type"
        label="Type"
        ask={{ shape: 'terms', axis: 'type' }}
        options={OPTIONS}
        chosen={['Flat end mill']}
        onChosen={() => {}}
        onClose={onClose}
      />,
    )

    const before = onClose.mock.calls.length
    fireEvent.keyDown(screen.getByRole('button', { name: 'Clear the Type filter' }), {
      key: 'Enter',
    })

    expect(onClose.mock.calls.length).toBe(before + 1)
  })
})
