import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PartUploadOverlay } from './part-upload-overlay'

describe('replacement part upload', () => {
  it('accepts a CAD file from the viewer overlay without hiding the current part', () => {
    const onUpload = vi.fn()
    render(
      <div>
        <p>the current mesh</p>
        <PartUploadOverlay
          status="idle"
          error={null}
          analysis={null}
          onUpload={onUpload}
          onClose={vi.fn()}
        />
      </div>,
    )

    const file = new File(['STEP fixture'], 'replacement.step')
    const input = screen.getByRole('dialog').querySelector('#replacement-cad')
    expect(input).not.toBeNull()
    fireEvent.change(input!, {
      target: { files: [file] },
    })

    expect(onUpload).toHaveBeenCalledWith(file)
    expect(screen.getByText('the current mesh')).toBeVisible()
  })

  it('shows analysis progress without offering a second file selection', () => {
    render(
      <PartUploadOverlay
        status="starting-analysis"
        error={null}
        analysis={{ message: 'Recognising features…', progress: 0.5 }}
        onUpload={vi.fn()}
        onClose={vi.fn()}
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent('Recognising features…')
    expect(screen.getByText('50%')).toBeVisible()
    expect(screen.getByRole('dialog').querySelector('#replacement-cad')).toBeNull()
  })

  it('can fill the viewer stage instead of floating over it', () => {
    const { container } = render(
      <PartUploadOverlay full status="idle" error={null} analysis={null} onUpload={vi.fn()} />,
    )

    expect(container.firstElementChild).toHaveClass('absolute', 'inset-0')
    expect(screen.getByText('Choose or drop a CAD file').parentElement).toHaveClass('min-h-72')
  })
})
