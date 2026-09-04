import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { UnitSystem } from '@toolpath/tool-support'
import {
  ColumnPicker,
  RangeFilter,
  boundFor,
  compareOf,
  type Bound,
  type Kind,
} from './column-filter'

/**
 * The filter as a page holds it: the bound it writes is the bound it is shown.
 *
 * Rendered this way rather than with a fixed `bound` because the two defects
 * this file pins were both in the round trip — what the component wrote came
 * straight back as its own props, and that is where the box vanished and the
 * text was re-formatted under the cursor.
 */
const Harness = ({
  initial,
  unit = 'millimeters',
  kind = 'length',
  onBound = () => {},
}: {
  initial: Bound | undefined
  unit?: UnitSystem
  kind?: Kind
  onBound?: (bound: Bound | undefined) => void
}) => {
  const [bound, setBound] = useState<Bound | undefined>(initial)
  return (
    <RangeFilter
      label="Diameter"
      bound={bound}
      onBound={(next) => {
        setBound(next)
        onBound(next)
      }}
      unit={unit}
      kind={kind}
    />
  )
}

const operator = () => screen.getByRole('combobox', { name: 'How to compare Diameter' })
const choose = (compare: string) => {
  const labels: Record<string, string> = {
    any: 'Any',
    under: '≤ at most',
    over: '≥ at least',
    equals: '= exactly',
    range: 'between',
  }
  fireEvent.click(operator())
  fireEvent.click(screen.getByRole('option', { name: labels[compare] }))
}
const box = (name = 'value') => screen.getByRole('textbox', { name: `Diameter — ${name}` })
const type = (raw: string, name = 'value') =>
  fireEvent.change(box(name), { target: { value: raw } })

describe('asking about one number', () => {
  /**
   * The defect: the operator was derived from the bound, so ≤ with nothing
   * typed yet wrote `{ max: undefined }` — which is `{}`, which is "Any" — and
   * the box to type into never appeared. Choosing an operator has to be enough.
   */
  it('shows a box to type in as soon as an operator is chosen', () => {
    render(<Harness initial={undefined} />)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

    choose('under')

    expect(box()).toBeInTheDocument()
  })

  it('writes the number in millimetres, whatever unit it was typed in', () => {
    const onBound = vi.fn()
    render(<Harness initial={undefined} unit="inches" onBound={onBound} />)

    choose('under')
    type('1.25')

    expect(onBound).toHaveBeenLastCalledWith({ max: 31.75 })
    expect(screen.getByText('in')).toBeInTheDocument()
  })

  /**
   * The other defect: a controlled number box that re-formatted through
   * millimetres on every keystroke turned "1." into "1.000" under the cursor.
   */
  it('keeps what was typed, half-typed numbers included', () => {
    render(<Harness initial={undefined} unit="inches" />)
    choose('over')

    type('1.')
    expect(box()).toHaveValue('1.')

    type('1.2')
    expect(box()).toHaveValue('1.2')
  })

  it('takes two numbers for a range', () => {
    const onBound = vi.fn()
    render(<Harness initial={undefined} onBound={onBound} />)

    choose('range')
    type('3', 'from')
    type('6', 'to')

    expect(onBound).toHaveBeenLastCalledWith({ min: 3, max: 6 })
  })

  it('writes one number as both ends for exactly', () => {
    const onBound = vi.fn()
    render(<Harness initial={undefined} onBound={onBound} />)

    choose('equals')
    type('4')

    expect(onBound).toHaveBeenLastCalledWith({ min: 4, max: 4 })
  })

  /** A suggestion, a saved filter, Clear: the stored bound moves, and the boxes follow. */
  it('starts from a bound set elsewhere, and follows one that changes', () => {
    const shown = (bound: Bound | undefined) => (
      <RangeFilter
        label="Diameter"
        bound={bound}
        onBound={vi.fn()}
        unit="millimeters"
        kind="length"
      />
    )
    const { rerender } = render(shown({ max: 6 }))
    expect(box()).toHaveValue('6.00')

    rerender(shown({ min: 2, max: 6 }))
    expect(box('from')).toHaveValue('2.00')
    expect(box('to')).toHaveValue('6.00')

    rerender(shown(undefined))
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('puts the number down on Any', () => {
    const onBound = vi.fn()
    render(<Harness initial={{ max: 6 }} onBound={onBound} />)

    choose('any')

    expect(onBound).toHaveBeenLastCalledWith(undefined)
  })

  /** Emptying the box is on the way to the next number, not a change of mind about the operator. */
  it('keeps the operator while the box is empty', () => {
    render(<Harness initial={{ max: 6 }} />)

    type('')

    expect(box()).toBeInTheDocument()
  })

  it('never converts a count, and gives it no unit', () => {
    const onBound = vi.fn()
    render(<Harness initial={undefined} unit="inches" kind="count" onBound={onBound} />)

    choose('over')
    type('4')

    expect(onBound).toHaveBeenLastCalledWith({ min: 4 })
    expect(screen.queryByText('in')).not.toBeInTheDocument()
  })
})

describe('what an operator and its numbers add up to', () => {
  it('is nothing until there is a number', () => {
    expect(boundFor('under', undefined, undefined)).toBeUndefined()
    expect(boundFor('range', undefined, undefined)).toBeUndefined()
  })

  /** Every operator survives the round trip through the bound it writes. */
  it('reads back as the operator it was written from', () => {
    expect(compareOf(boundFor('under', 6, undefined))).toBe('under')
    expect(compareOf(boundFor('over', 6, undefined))).toBe('over')
    expect(compareOf(boundFor('equals', 6, undefined))).toBe('equals')
    expect(compareOf(boundFor('range', 3, 6))).toBe('range')
    expect(compareOf(boundFor('any', 6, 6))).toBe('any')
  })
})

describe('the column picker', () => {
  it('keeps the pencil at the table header touch target size', () => {
    render(
      <ColumnPicker
        columns={[{ code: 'DC', label: 'Diameter' }]}
        shown={['DC']}
        onToggle={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Which columns to show' })).toHaveClass('size-6')
  })
})
