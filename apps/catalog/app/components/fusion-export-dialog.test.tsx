import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FusionExportDialog } from './fusion-export-dialog'

describe('FusionExportDialog', () => {
  it('requires a material and passes the selected material and RPM to export', async () => {
    const onExport = vi.fn().mockResolvedValue({ exported: 1, skipped: [], holderWarnings: [] })
    render(
      <FusionExportDialog
        initialMaterial={null}
        initialName="Shop library"
        onCancel={vi.fn()}
        onExport={onExport}
      />,
    )

    const download = screen.getByRole('button', { name: 'Download .json' })
    expect(download).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Aluminum' }))
    fireEvent.change(screen.getByLabelText('Maximum spindle RPM'), { target: { value: '18000' } })
    fireEvent.click(download)

    await vi.waitFor(() =>
      expect(onExport).toHaveBeenCalledWith(
        { material: 'AluWrought', maxRpm: 18000 },
        'Shop library',
      ),
    )
    expect(await screen.findByText('Downloaded 1 tool assembly.')).toBeInTheDocument()
  })
})
