import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FusionExportDialog } from './fusion-export-dialog'

describe('FusionExportDialog', () => {
  it('passes the trimmed library name to export and reports what landed', async () => {
    const onExport = vi.fn().mockResolvedValue({ exported: 1, skipped: [], holderWarnings: [] })
    render(<FusionExportDialog initialName="Shop library" onCancel={vi.fn()} onExport={onExport} />)

    fireEvent.click(screen.getByRole('button', { name: 'Download .json' }))

    await vi.waitFor(() => expect(onExport).toHaveBeenCalledWith('Shop library'))
    expect(await screen.findByText('Downloaded 1 tool assembly.')).toBeInTheDocument()
  })

  it('will not export under an empty name, which Fusion shows as the library label', () => {
    render(<FusionExportDialog initialName="Shop library" onCancel={vi.fn()} onExport={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Library name'), { target: { value: '  ' } })
    expect(screen.getByRole('button', { name: 'Download .json' })).toBeDisabled()
  })

  it('says which tool was left out, and which holder travelled short', async () => {
    const onExport = vi.fn().mockResolvedValue({
      exported: 1,
      skipped: [{ catalogNumber: 'TDMX0800', reason: 'Fusion requires RE and none is stated' }],
      holderWarnings: [
        { catalogNumber: 'TDMX0600', reason: 'the vendor publishes no gauge length' },
      ],
    })
    render(<FusionExportDialog initialName="Shop library" onCancel={vi.fn()} onExport={onExport} />)

    fireEvent.click(screen.getByRole('button', { name: 'Download .json' }))

    expect(
      await screen.findByText('TDMX0800 skipped — Fusion requires RE and none is stated'),
    ).toBeInTheDocument()
    expect(
      await screen.findByText('TDMX0600 — the vendor publishes no gauge length.'),
    ).toBeInTheDocument()
  })
})
