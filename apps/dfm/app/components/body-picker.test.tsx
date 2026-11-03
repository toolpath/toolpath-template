// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { rememberUpload } from '@toolpath/part-client'
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
  const onUpload = vi.fn<BodyPickerProps['onUpload']>(async () => {})
  render(
    <MemoryRouter>
      <BodyPicker
        partId="part-1"
        message="This file holds 2 solid bodies. Choose the one to machine."
        bodies={bodies}
        status="idle"
        error={null}
        onUpload={onUpload}
        {...overrides}
      />
    </MemoryRouter>,
  )
  return onUpload
}

describe('choosing a body of a multi-body file', () => {
  it('offers every body under the failure, by name or by place, with its size', () => {
    renderPicker()

    expect(screen.getByRole('heading', { name: /holds 2 solid bodies/ })).toBeTruthy()
    expect(
      screen.getByRole('button', { name: /Body 1.*6 faces · 10.00 × 10.00 × 10.00 mm/ }),
    ).toBeTruthy()
    expect(
      screen.getByRole('button', { name: /Bracket.*24 faces · 40.00 × 15.00 × 8.00 mm/ }),
    ).toBeTruthy()
  })

  it('sends the file this tab uploaded again, for the body chosen', () => {
    const file = new File(['STEP'], 'bodies.step')
    rememberUpload('part-held', file)
    const onUpload = renderPicker({ partId: 'part-held' })

    fireEvent.click(screen.getByRole('button', { name: /Bracket/ }))

    expect(onUpload).toHaveBeenCalledWith(file, 1)
  })

  it('asks for the file again when this tab holds none, then sends it for that body', () => {
    const onUpload = renderPicker({ partId: 'part-opened-by-link' })

    fireEvent.click(screen.getByRole('button', { name: /Bracket/ }))
    expect(onUpload).not.toHaveBeenCalled()
    expect(screen.getByText('Choose the file again to open Bracket.')).toBeTruthy()

    const file = new File(['STEP'], 'bodies.step')
    fireEvent.change(screen.getByLabelText('CAD file'), {
      target: { files: { 0: file, length: 1, item: () => file } },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Analyze part' }))

    expect(onUpload).toHaveBeenCalledWith(file, 1)
  })

  it('says how far the upload has got, and what went wrong with it', () => {
    renderPicker({ status: 'uploading-file', error: 'Could not upload the CAD file.' })

    expect(screen.getByRole('status').textContent).toBe('Uploading file…')
    expect(screen.getByRole('alert').textContent).toBe('Could not upload the CAD file.')
    expect(screen.getByRole('button', { name: /Bracket/ }).hasAttribute('disabled')).toBe(true)
  })
})
