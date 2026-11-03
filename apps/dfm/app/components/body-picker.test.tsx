// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PartBody } from '@toolpath/part-contracts'
import { BodyPicker, type BodyPickerProps } from './body-picker'

afterEach(cleanup)

const bodies: Array<PartBody> = [
  {
    index: 0,
    name: null,
    faceCount: 6,
    boundingBox: { lower: { x: 0, y: 0, z: 0 }, upper: { x: 10, y: 10, z: 10 } },
  },
  {
    index: 1,
    name: 'Bracket',
    faceCount: 24,
    boundingBox: { lower: { x: 0, y: 0, z: 0 }, upper: { x: 40, y: 15, z: 8 } },
  },
]

const renderPicker = (overrides: Partial<BodyPickerProps> = {}) => {
  const props = {
    onChoose: vi.fn<BodyPickerProps['onChoose']>(),
    onBack: vi.fn<BodyPickerProps['onBack']>(),
  }
  render(<BodyPicker bodies={bodies} status="idle" error={null} {...props} {...overrides} />)
  return props
}

describe('choosing a body of a multi-body file', () => {
  it('offers every body of the file, by name or by place, with its size', () => {
    renderPicker()

    expect(screen.getByRole('heading', { name: /holds 2 solid bodies/ })).toBeTruthy()
    expect(
      screen.getByRole('button', { name: /Body 1.*6 faces · 10.00 × 10.00 × 10.00 mm/ }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: /Bracket.*24 faces · 40.00 × 15.00 × 8.00 mm/ }),
    ).toBeTruthy()
  })

  it('names the body chosen by its index', () => {
    const { onChoose } = renderPicker()

    fireEvent.click(screen.getByRole('button', { name: /Bracket/ }))

    expect(onChoose).toHaveBeenCalledWith(1)
  })

  it('goes back to choosing a file', () => {
    const { onBack } = renderPicker()

    fireEvent.click(screen.getByRole('button', { name: 'Choose a different file' }))

    expect(onBack).toHaveBeenCalled()
  })

  it('says how far the part has got, and what went wrong with it', () => {
    renderPicker({ status: 'starting-analysis', error: 'Toolpath Engine request failed.' })

    expect(screen.getByRole('status').textContent).toBe('Starting analysis…')
    expect(screen.getByRole('alert').textContent).toBe('Toolpath Engine request failed.')
    expect(screen.getByRole('button', { name: /Bracket/ }).hasAttribute('disabled')).toBe(true)
    expect(
      screen.getByRole('button', { name: 'Choose a different file' }).hasAttribute('disabled'),
    ).toBe(true)
  })
})
