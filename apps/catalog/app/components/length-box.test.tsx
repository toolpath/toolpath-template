import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { UnitSystem } from '@toolpath/tool-support'
import { LengthBox, clampTo } from './length-box'

const Harness = ({
  onChange = () => {},
  unit = 'millimeters' as const,
  max,
}: {
  onChange?: (mm: number) => void
  unit?: UnitSystem
  max?: number
}) => {
  const [value, setValue] = useState(26)
  return (
    <LengthBox
      id="stickout"
      label="stickout"
      value={value}
      unit={unit}
      min={19}
      max={max}
      onChange={(mm) => {
        setValue(mm)
        onChange(mm)
      }}
    />
  )
}

const box = () => screen.getByRole('textbox', { name: 'stickout' })

describe('typing a length', () => {
  it('shows what was typed while typing, point included', () => {
    render(<Harness />)
    fireEvent.focus(box())

    fireEvent.change(box(), { target: { value: '3' } })
    fireEvent.change(box(), { target: { value: '30.' } })

    expect(box()).toHaveValue('30.')
  })

  /** `30.` is 30 to everybody except a parser: leaving the box takes it. */
  it('commits on blur, and comes back formatted', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    fireEvent.focus(box())
    fireEvent.change(box(), { target: { value: '30.' } })
    // A plain blur: the box already holds what was typed, and passing a value to
    // the blur event itself bypasses React's own restore of the controlled value.
    fireEvent.blur(box())

    expect(onChange).toHaveBeenLastCalledWith(30)
    expect(box()).toHaveValue('30.00')
  })

  it('reads in the unit being read in and writes millimetres', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} unit="inches" />)
    fireEvent.focus(box())
    fireEvent.change(box(), { target: { value: '1.25' } })

    expect(onChange).toHaveBeenLastCalledWith(31.75)
  })

  /** Clearing is how retyping starts, not an answer. */
  it('brings the stored number back when the box is emptied and left', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} />)
    fireEvent.focus(box())
    fireEvent.change(box(), { target: { value: '' } })
    fireEvent.blur(box())

    expect(onChange).not.toHaveBeenCalled()
    expect(box()).toHaveValue('26.00')
  })

  it('holds what leaves inside the range', () => {
    const onChange = vi.fn()
    render(<Harness onChange={onChange} max={42} />)
    fireEvent.focus(box())
    fireEvent.change(box(), { target: { value: '90' } })
    expect(onChange).toHaveBeenLastCalledWith(42)

    fireEvent.change(box(), { target: { value: '5' } })
    expect(onChange).toHaveBeenLastCalledWith(19)
  })

  it('clamps like a clamp', () => {
    expect(clampTo(5, 1, 3)).toBe(3)
    expect(clampTo(0, 1, 3)).toBe(1)
    expect(clampTo(2)).toBe(2)
  })
})
