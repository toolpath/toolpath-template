import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PartBody } from '@toolpath/part-contracts'
import { BodyPicker, type BodyPickerProps } from './body-picker'

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

    expect(screen.getByRole('heading', { name: /holds 2 solid bodies/ })).toBeVisible()
    expect(
      screen.getByRole('button', { name: /Body 1.*6 faces · 10.00 × 10.00 × 10.00 mm/ }),
    ).toBeVisible()
    expect(
      screen.getByRole('button', { name: /Bracket.*24 faces · 40.00 × 15.00 × 8.00 mm/ }),
    ).toBeVisible()
    // The bodies stand where the file chooser was; the file is never asked for again.
    expect(screen.queryByLabelText('Choose or drop a CAD file')).toBeNull()
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

  it('shows the part being started as any upload is shown, and its error', () => {
    renderPicker({ status: 'starting-analysis', error: 'Toolpath Engine request failed.' })

    expect(screen.getByRole('status')).toHaveTextContent('Starting analysis…')
    expect(screen.getByRole('alert')).toHaveTextContent('Toolpath Engine request failed.')
  })
})
