import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ClampingLength } from './clamping-length'

const open = (over: Partial<Parameters<typeof ClampingLength>[0]> = {}) => {
  const onChange = vi.fn()
  render(
    <ClampingLength
      rule={{ vendorSpec: true, perDiameter: 3 }}
      onChange={onChange}
      sheet={3}
      {...over}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: /Minimum clamping length/ }))
  return onChange
}

describe('how much shank a shop holds', () => {
  /** **Gone** (Paul, 2026-09-01: "remove 'a third of the tool' option"). */
  it('offers multiples of the diameter, and nothing else', () => {
    open()

    expect(screen.queryByRole('button', { name: /third of the tool/i })).not.toBeInTheDocument()
    for (const each of ['3×D', '4×D', '5×D', '6×D']) {
      expect(screen.getByRole('button', { name: each })).toBeInTheDocument()
    }
  })

  /**
   * **No spinner** (Paul, 2026-09-01: "I don't need the arrows in this box,
   * just to enter the text value").
   */
  it('takes a multiple of its own as typed text', () => {
    const onChange = open()

    const box = screen.getByLabelText('Minimum clamping length, in diameters')
    expect(box).toHaveAttribute('type', 'text')
    expect(box).toHaveAttribute('inputMode', 'decimal')

    fireEvent.change(box, { target: { value: '4.5' } })
    expect(onChange).toHaveBeenCalledWith({ vendorSpec: true, perDiameter: 4.5 })
  })
})
